import { generateAssetsSchema } from '../utils/validation'
import { callReplicateMCP, callElevenLabsMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { downloadFile, saveAsset, readFile } from '../utils/storage'
import { uploadFileToReplicate } from '../utils/replicate-upload'
import { nanoid } from 'nanoid'
import type { GenerationJob, Asset } from '../../app/types/generation'
import { promises as fs } from 'fs'
import path from 'path'

// Helper function to prepare image input for Replicate
// Uploads local files to Replicate and returns public URLs
async function prepareImageInput(filePath: string | undefined | null): Promise<string | undefined> {
  if (!filePath) {
    return undefined
  }
  
  // If it's already a public URL (https://), return as-is
  if (filePath.startsWith('https://')) {
    return filePath
  }
  
  // If it's a localhost URL, convert it to a local file path first
  if (filePath.startsWith('http://localhost') || filePath.startsWith('http://127.0.0.1')) {
    try {
      // Extract filename from URL and convert to local path
      const urlPath = new URL(filePath).pathname
      const filename = path.basename(urlPath)
      const assetsDir = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')
      const localPath = path.join(assetsDir, filename)
      // Resolve to absolute path and upload
      const resolvedPath = path.resolve(localPath)
      return await uploadFileToReplicate(resolvedPath)
    } catch (e) {
      // If URL parsing fails, treat as file path
      console.warn('Failed to parse localhost URL, treating as file path:', filePath)
    }
  }
  
  // If it's already a URL (but not localhost), return as-is
  if (filePath.startsWith('http://')) {
    return filePath
  }
  
  // It's a local file path - resolve to absolute and upload to Replicate
  let resolvedPath: string
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath
  } else {
    // Resolve relative path to absolute
    const resolved = path.resolve(filePath)
    
    // Check if file exists at resolved path
    try {
      await fs.access(resolved)
      resolvedPath = resolved
    } catch {
      // Try relative to assets directory
      const assetsDir = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')
      const assetsPath = path.isAbsolute(assetsDir) 
        ? path.join(assetsDir, path.basename(filePath))
        : path.resolve(assetsDir, path.basename(filePath))
      resolvedPath = path.resolve(assetsPath)
    }
  }
  
  // Upload to Replicate and get public URL
  return await uploadFileToReplicate(resolvedPath)
}

const JOBS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'jobs.json')

export async function saveJob(job: GenerationJob) {
  let jobs: GenerationJob[] = []
  try {
    const content = await fs.readFile(JOBS_FILE, 'utf-8')
    jobs = JSON.parse(content)
  } catch {
    // File doesn't exist, start fresh
  }

  const index = jobs.findIndex(j => j.id === job.id)
  if (index >= 0) {
    jobs[index] = job
  } else {
    jobs.push(job)
  }

  await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true })
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2))
}

export async function getJob(jobId: string): Promise<GenerationJob | null> {
  try {
    const content = await fs.readFile(JOBS_FILE, 'utf-8')
    const jobs: GenerationJob[] = JSON.parse(content)
    return jobs.find(j => j.id === jobId) || null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const { storyboard } = generateAssetsSchema.parse(await readBody(event))
  const jobId = nanoid()

  // Create job
  const job: GenerationJob = {
    id: jobId,
    status: 'processing',
    startTime: Date.now(),
    storyboardId: storyboard.id,
    assets: [],
  }
  await saveJob(job)

  try {
    // In demo mode, only process first segment
    const segmentsToProcess = storyboard.meta.mode === 'demo' 
      ? storyboard.segments.slice(0, 1)
      : storyboard.segments

    // Generate assets in parallel
    const assetPromises = segmentsToProcess.map(async (segment, idx) => {
      try {
        // Determine which images to use (segment-specific or global fallback)
        const firstFrameImage = segment.firstFrameImage || storyboard.meta.firstFrameImage
        const subjectReference = segment.subjectReference || storyboard.meta.subjectReference

        // Video Generation (Replicate MCP) - always uses minimax/video-01
        const videoParams: any = {
          prompt: segment.visualPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        if (firstFrameImage) {
          videoParams.first_frame_image = await prepareImageInput(firstFrameImage)
        }
        if (subjectReference) {
          videoParams.subject_reference = await prepareImageInput(subjectReference)
        }

        const videoResult = await callReplicateMCP('generate_video', videoParams)

        // Track cost
        await trackCost('video-generation', 0.15, {
          segmentId: idx,
          duration: segment.endTime - segment.startTime,
        })

        // Poll for completion
        let predictionStatus = videoResult
        // Get the prediction ID from the initial response
        const predictionId = predictionStatus.predictionId || predictionStatus.id
        if (!predictionId) {
          console.error('[Generate Assets] Invalid video result:', JSON.stringify(videoResult, null, 2))
          throw new Error(`Invalid response from video generation: missing prediction ID`)
        }
        
        console.log('[Generate Assets] Starting prediction with ID:', predictionId)
        
        while (predictionStatus.status === 'starting' || predictionStatus.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 2000))
          predictionStatus = await callReplicateMCP('check_prediction_status', {
            predictionId: predictionId,
          })
        }

        if (predictionStatus.status !== 'succeeded') {
          throw new Error(`Video generation failed: ${predictionStatus.error || 'Unknown error'}`)
        }

        const videoResultFinal = await callReplicateMCP('get_prediction_result', {
          predictionId: predictionId,
        })

        const videoUrl = videoResultFinal?.videoUrl
        if (!videoUrl) {
          console.error('[Generate Assets] No videoUrl in result:', JSON.stringify(videoResultFinal, null, 2))
          throw new Error(`Video generation completed but no video URL was returned. Result: ${JSON.stringify(videoResultFinal)}`)
        }

        // Voice Over (ElevenLabs MCP)
        let voiceUrl: string | undefined
        if (segment.audioNotes) {
          const voiceResult = await callElevenLabsMCP('text_to_speech', {
            text: segment.audioNotes,
            voice_id: '21m00Tcm4TlvDq8ikWAM',
            model_id: 'eleven_monolingual_v1',
          })

          // Save audio file
          if (!voiceResult?.audioBase64) {
            console.error('[Generate Assets] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
            throw new Error('Voice synthesis completed but no audio data was returned')
          }
          const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
          const audioPath = await saveAsset(audioBuffer, 'mp3')
          voiceUrl = audioPath

          await trackCost('voice-synthesis', 0.05, {
            segmentId: idx,
            textLength: segment.audioNotes.length,
          })
        }

        return {
          segmentId: idx,
          videoUrl,
          voiceUrl,
          status: 'completed',
        } as Asset
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred'
        console.error(`[Segment ${idx}] Asset generation failed:`, errorMessage)
        console.error(`[Segment ${idx}] Error details:`, error)
        if (error.stack) {
          console.error(`[Segment ${idx}] Stack trace:`, error.stack)
        }
        return {
          segmentId: idx,
          status: 'failed',
          error: errorMessage,
        } as Asset
      }
    })

    const assets = await Promise.all(assetPromises)

    // Update job
    job.assets = assets
    job.status = assets.every(a => a.status === 'completed') ? 'completed' : 'failed'
    job.endTime = Date.now()
    await saveJob(job)

    return { jobId, assets }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error occurred'
    console.error('[Generation Job] Overall failure:', errorMessage)
    console.error('[Generation Job] Error details:', error)
    if (error.stack) {
      console.error('[Generation Job] Stack trace:', error.stack)
    }
    job.status = 'failed'
    job.error = errorMessage
    job.endTime = Date.now()
    await saveJob(job)
    throw createError({
      statusCode: 500,
      message: `Failed to generate assets: ${errorMessage}`,
    })
  }
})

