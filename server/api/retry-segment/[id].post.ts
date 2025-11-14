import { getJob, saveJob } from '../generate-assets.post'
import { callReplicateMCP, callElevenLabsMCP } from '../../utils/mcp-client'
import { trackCost } from '../../utils/cost-tracker'
import { saveAsset, readStoryboard } from '../../utils/storage'
import { uploadFileToReplicate } from '../../utils/replicate-upload'
import path from 'path'
import { promises as fs } from 'fs'

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

export default defineEventHandler(async (event) => {
  const segmentId = parseInt(getRouterParam(event, 'id') || '0')
  const { jobId } = await readBody(event)

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Job ID required',
    })
  }

  const job = await getJob(jobId)
  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  // Get storyboard to find segment details
  const storyboard = await readStoryboard(job.storyboardId)
  const segment = storyboard.segments[segmentId]

  if (!segment) {
    throw createError({
      statusCode: 404,
      message: 'Segment not found',
    })
  }

  try {
    // Determine which images to use (segment-specific or global fallback)
    const firstFrameImage = segment.firstFrameImage || storyboard.meta.firstFrameImage
    const subjectReference = segment.subjectReference || storyboard.meta.subjectReference

    // Retry video generation
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

    await trackCost('video-generation', 0.15, {
      segmentId,
      retry: true,
    })

    // Poll for completion
    let predictionStatus = videoResult
    // Get the prediction ID from the initial response
    const predictionId = predictionStatus.predictionId || predictionStatus.id
    if (!predictionId) {
      console.error('[Retry Segment] Invalid video result:', JSON.stringify(videoResult, null, 2))
      throw new Error(`Invalid response from video generation: missing prediction ID`)
    }
    
    console.log('[Retry Segment] Starting prediction with ID:', predictionId)
    
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
      console.error('[Retry Segment] No videoUrl in result:', JSON.stringify(videoResultFinal, null, 2))
      throw new Error(`Video generation completed but no video URL was returned. Result: ${JSON.stringify(videoResultFinal)}`)
    }

    // Retry voice if needed
    let voiceUrl: string | undefined
    if (segment.audioNotes) {
      const voiceResult = await callElevenLabsMCP('text_to_speech', {
        text: segment.audioNotes,
        voice_id: '21m00Tcm4TlvDq8ikWAM',
        model_id: 'eleven_monolingual_v1',
      })

      if (!voiceResult?.audioBase64) {
        console.error('[Retry Segment] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
        throw new Error('Voice synthesis completed but no audio data was returned')
      }
      const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
      const audioPath = await saveAsset(audioBuffer, 'mp3')
      voiceUrl = audioPath

      await trackCost('voice-synthesis', 0.05, {
        segmentId,
        retry: true,
      })
    }

    // Update job asset
    if (job.assets) {
      job.assets[segmentId] = {
        segmentId,
        videoUrl,
        voiceUrl,
        status: 'completed',
      }
      job.status = job.assets.every(a => a.status === 'completed') ? 'completed' : 'processing'
      await saveJob(job)
    }

    return {
      success: true,
      asset: job.assets?.[segmentId],
    }
  } catch (error: any) {
    if (job.assets) {
      job.assets[segmentId] = {
        ...job.assets[segmentId],
        status: 'failed',
        error: error.message,
      }
      await saveJob(job)
    }

    throw createError({
      statusCode: 500,
      message: `Failed to retry segment: ${error.message}`,
    })
  }
})

