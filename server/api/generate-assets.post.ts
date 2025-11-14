import { generateAssetsSchema } from '../utils/validation'
import { callReplicateMCP, callOpenAIMCP } from '../utils/mcp-client'
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

        // Get model from storyboard meta, default to google/veo-3.1
        const model = storyboard.meta.model || 'google/veo-3.1'

        // Video Generation (Replicate MCP) - use model from storyboard
        const videoParams: any = {
          model,
          prompt: segment.visualPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        // Model-specific image handling
        if (model === 'google/veo-3.1') {
          // Veo 3.1 supports: image, last_frame, reference_images, negative_prompt, resolution, generate_audio, seed
          if (storyboard.meta.image) {
            videoParams.image = await prepareImageInput(storyboard.meta.image)
          }
          if (storyboard.meta.lastFrame) {
            videoParams.last_frame = await prepareImageInput(storyboard.meta.lastFrame)
          }
          if (storyboard.meta.referenceImages && storyboard.meta.referenceImages.length > 0) {
            videoParams.reference_images = await Promise.all(
              storyboard.meta.referenceImages.map((img: string) => prepareImageInput(img))
            )
          }
          if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = storyboard.meta.negativePrompt
          }
          if (storyboard.meta.resolution) {
            videoParams.resolution = storyboard.meta.resolution
          }
          if (storyboard.meta.generateAudio !== undefined) {
            videoParams.generate_audio = storyboard.meta.generateAudio
          }
          if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
            videoParams.seed = storyboard.meta.seed
          }
        } else if (model === 'runway/gen-3-alpha-turbo' || model === 'anotherbyte/seedance-1.0') {
          // These models support generic 'image' input
          if (firstFrameImage) {
            videoParams.image_legacy = await prepareImageInput(firstFrameImage)
          } else if (subjectReference) {
            videoParams.image_legacy = await prepareImageInput(subjectReference)
          }
        } else if (model === 'stability-ai/stable-video-diffusion') {
          // Stable Video Diffusion requires image input
          if (firstFrameImage) {
            videoParams.image_legacy = await prepareImageInput(firstFrameImage)
          } else if (subjectReference) {
            videoParams.image_legacy = await prepareImageInput(subjectReference)
          }
        } else {
          // Legacy models - support firstFrameImage/subjectReference
          if (firstFrameImage) {
            videoParams.first_frame_image = await prepareImageInput(firstFrameImage)
          }
          if (subjectReference) {
            videoParams.subject_reference = await prepareImageInput(subjectReference)
          }
        }

        console.log(`[Segment ${idx}] Calling Replicate MCP generate_video with params:`, JSON.stringify(videoParams, null, 2))
        const videoResult = await callReplicateMCP('generate_video', videoParams)
        console.log(`[Segment ${idx}] Replicate MCP generate_video response:`, JSON.stringify(videoResult, null, 2))

        // Track cost
        await trackCost('video-generation', 0.15, {
          segmentId: idx,
          duration: segment.endTime - segment.startTime,
        })

        // Poll for completion
        let predictionStatus = videoResult
        console.log(`[Segment ${idx}] Initial prediction status:`, JSON.stringify(predictionStatus, null, 2))
        
        // Get the prediction ID from the initial response - try multiple possible fields
        const predictionId = predictionStatus.predictionId || 
                            predictionStatus.id || 
                            predictionStatus.prediction?.id ||
                            (predictionStatus as any)?.prediction_id
                            
        console.log(`[Segment ${idx}] Extracted prediction ID:`, predictionId)
        console.log(`[Segment ${idx}] Full response keys:`, Object.keys(predictionStatus))
        
        if (!predictionId) {
          const errorDetails = {
            segmentId: idx,
            response: videoResult,
            responseKeys: Object.keys(videoResult || {}),
            responseType: typeof videoResult,
            isArray: Array.isArray(videoResult),
            stringified: JSON.stringify(videoResult, null, 2),
          }
          console.error(`[Segment ${idx}] Invalid video result - missing prediction ID:`, JSON.stringify(errorDetails, null, 2))
          
          // Store error details in asset for frontend access
          return {
            segmentId: idx,
            status: 'failed',
            error: `Invalid response from video generation: missing prediction ID`,
            metadata: errorDetails,
          } as Asset
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
          const errorDetails = {
            segmentId: idx,
            predictionId,
            finalResult: videoResultFinal,
            finalResultKeys: Object.keys(videoResultFinal || {}),
          }
          console.error(`[Segment ${idx}] No videoUrl in result:`, JSON.stringify(errorDetails, null, 2))
          
          // Store error details in asset for frontend access
          return {
            segmentId: idx,
            status: 'failed',
            error: `Video generation completed but no video URL was returned`,
            metadata: {
              predictionId,
              predictionStatus,
              finalResult: videoResultFinal,
            },
          } as Asset
        }

        console.log(`[Segment ${idx}] Video URL obtained:`, videoUrl)
        console.log(`[Segment ${idx}] Prediction ID:`, predictionId)

        // Voice Over (OpenAI TTS)
        let voiceUrl: string | undefined
        if (segment.audioNotes) {
          try {
            const voiceResult = await callOpenAIMCP('text_to_speech', {
              text: segment.audioNotes,
              voice: 'alloy',
              model: 'tts-1',
            })

            // Save audio file
            if (!voiceResult?.audioBase64) {
              console.error('[Generate Assets] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
              console.error('[Generate Assets] Voice result keys:', voiceResult ? Object.keys(voiceResult) : 'null')
              // Don't fail the entire segment if voice synthesis fails - just log and continue
              console.warn(`[Segment ${idx}] Voice synthesis failed, continuing without audio`)
            } else {
              const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
              const audioPath = await saveAsset(audioBuffer, 'mp3')
              voiceUrl = audioPath

              await trackCost('voice-synthesis', 0.05, {
                segmentId: idx,
                textLength: segment.audioNotes.length,
              })
            }
          } catch (voiceError: any) {
            // Don't fail the entire segment if voice synthesis fails - just log and continue
            console.error(`[Segment ${idx}] Voice synthesis error:`, voiceError.message)
            console.warn(`[Segment ${idx}] Continuing without audio due to voice synthesis failure`)
          }
        }

        // Store metadata including prediction ID and video URL for frontend access
        const metadata = {
          predictionId,
          videoUrl,
          replicateVideoUrl: videoUrl, // Direct Replicate URL
          voiceUrl,
          segmentIndex: idx,
          segmentType: segment.type,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.endTime - segment.startTime,
          timestamp: Date.now(),
        }

        console.log(`[Segment ${idx}] Asset metadata:`, JSON.stringify(metadata, null, 2))

        return {
          segmentId: idx,
          videoUrl,
          voiceUrl,
          status: 'completed',
          metadata, // Include metadata for frontend access
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

