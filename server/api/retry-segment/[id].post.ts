import { getJob, saveJob } from '../generate-assets.post'
import { callReplicateMCP, callOpenAIMCP } from '../../utils/mcp-client'
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

    console.log(`[Retry Segment ${segmentId}] Calling Replicate MCP generate_video with params:`, JSON.stringify(videoParams, null, 2))
    const videoResult = await callReplicateMCP('generate_video', videoParams)
    console.log(`[Retry Segment ${segmentId}] Replicate MCP generate_video response:`, JSON.stringify(videoResult, null, 2))

    // Check if the response contains an error
    if (videoResult && typeof videoResult === 'object' && 'error' in videoResult) {
      console.error(`[Retry Segment ${segmentId}] Replicate MCP returned error:`, videoResult.error)
      throw new Error(`Video generation error: ${videoResult.error}`)
    }

    await trackCost('video-generation', 0.15, {
      segmentId,
      retry: true,
    })

    // Poll for completion
    let predictionStatus = videoResult
    console.log(`[Retry Segment ${segmentId}] Initial prediction status:`, JSON.stringify(predictionStatus, null, 2))
    console.log(`[Retry Segment ${segmentId}] Response type:`, typeof predictionStatus)
    console.log(`[Retry Segment ${segmentId}] Is array:`, Array.isArray(predictionStatus))
    console.log(`[Retry Segment ${segmentId}] Response keys:`, predictionStatus ? Object.keys(predictionStatus) : 'null/undefined')
    
    // Get the prediction ID from the initial response - try multiple possible fields
    // Handle different response structures that might come from different models
    let predictionId: string | undefined
    
    if (predictionStatus) {
      // Try direct properties first
      predictionId = predictionStatus.predictionId || 
                    predictionStatus.id || 
                    (predictionStatus as any)?.prediction_id
      
      // Try nested structures
      if (!predictionId && (predictionStatus as any).prediction) {
        predictionId = (predictionStatus as any).prediction.id || 
                      (predictionStatus as any).prediction.predictionId ||
                      (predictionStatus as any).prediction.prediction_id
      }
      
      // Try if response is wrapped in a data property
      if (!predictionId && (predictionStatus as any).data) {
        const data = (predictionStatus as any).data
        predictionId = data.predictionId || data.id || data.prediction_id
      }
      
      // Try if response is an array (some models might return arrays)
      if (!predictionId && Array.isArray(predictionStatus) && predictionStatus.length > 0) {
        const firstItem = predictionStatus[0]
        predictionId = firstItem.predictionId || firstItem.id || firstItem.prediction_id
      }
    }
                        
    console.log(`[Retry Segment ${segmentId}] Extracted prediction ID:`, predictionId)
    
    if (!predictionId) {
      const errorDetails = {
        segmentId,
        response: videoResult,
        responseKeys: videoResult ? Object.keys(videoResult) : [],
        responseType: typeof videoResult,
        isArray: Array.isArray(videoResult),
        stringified: JSON.stringify(videoResult, null, 2),
        model: videoParams.model,
      }
      console.error(`[Retry Segment ${segmentId}] Invalid video result - missing prediction ID:`, JSON.stringify(errorDetails, null, 2))
      throw new Error(`Invalid response from video generation: missing prediction ID. Model: ${videoParams.model}. Please check the response structure for this model. Response: ${JSON.stringify(errorDetails)}`)
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
      try {
        const voiceResult = await callOpenAIMCP('text_to_speech', {
          text: segment.audioNotes,
          voice: 'alloy',
          model: 'tts-1',
        })

        if (!voiceResult?.audioBase64) {
          console.error('[Retry Segment] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
          console.error('[Retry Segment] Voice result keys:', voiceResult ? Object.keys(voiceResult) : 'null')
          // Don't fail the entire segment if voice synthesis fails - just log and continue
          console.warn(`[Retry Segment ${segmentId}] Voice synthesis failed, continuing without audio`)
        } else {
          const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
          const audioPath = await saveAsset(audioBuffer, 'mp3')
          voiceUrl = audioPath

          await trackCost('voice-synthesis', 0.05, {
            segmentId,
            retry: true,
          })
        }
      } catch (voiceError: any) {
        // Don't fail the entire segment if voice synthesis fails - just log and continue
        console.error(`[Retry Segment ${segmentId}] Voice synthesis error:`, voiceError.message)
        console.warn(`[Retry Segment ${segmentId}] Continuing without audio due to voice synthesis failure`)
      }
    }

    // Store metadata including prediction ID and video URL for frontend access
    const metadata = {
      predictionId,
      videoUrl,
      replicateVideoUrl: videoUrl, // Direct Replicate URL
      voiceUrl,
      segmentIndex: segmentId,
      segmentType: segment.type,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.endTime - segment.startTime,
      timestamp: Date.now(),
      retry: true,
    }

    console.log(`[Retry Segment ${segmentId}] Asset metadata:`, JSON.stringify(metadata, null, 2))

    // Update job asset
    if (job.assets) {
      job.assets[segmentId] = {
        segmentId,
        videoUrl,
        voiceUrl,
        status: 'completed',
        metadata, // Include metadata for frontend access
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

