import { getJob, saveJob } from '../generate-assets.post'
import { callOpenAIMCP } from '../../utils/mcp-client'
import { trackCost } from '../../utils/cost-tracker'
import { readStoryboard, downloadFile, saveVideo, cleanupTempFiles } from '../../utils/storage'
import { extractAllFramesFromEnd, trimVideoAtTimestamp, getVideoDuration, extractFirstFrame } from '../../utils/ffmpeg'
import { nanoid } from 'nanoid'
import type { Asset } from '../../../app/types/generation'

export default defineEventHandler(async (event) => {
  const segmentId = parseInt(getRouterParam(event, 'segmentId') || '0')
  const { jobId } = await readBody(event)

  console.log(`[Optimize Continuity ${segmentId}] ===== Starting validation =====`)
  console.log(`[Optimize Continuity ${segmentId}] Request received with segmentId: ${segmentId}, jobId: ${jobId || 'missing'}`)

  if (!jobId) {
    console.error(`[Optimize Continuity ${segmentId}] Validation failed: Job ID required`)
    throw createError({
      statusCode: 400,
      message: 'Job ID required',
    })
  }

  const job = await getJob(jobId)
  if (!job) {
    console.error(`[Optimize Continuity ${segmentId}] Validation failed: Job not found for jobId: ${jobId}`)
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  console.log(`[Optimize Continuity ${segmentId}] Job found: ${jobId}, storyboardId: ${job.storyboardId}`)

  // Get storyboard to find segment details
  const storyboard = await readStoryboard(job.storyboardId)
  const segment = storyboard.segments[segmentId]

  if (!segment) {
    console.error(`[Optimize Continuity ${segmentId}] Validation failed: Segment not found`, {
      segmentId,
      totalSegments: storyboard.segments.length,
      availableSegmentIds: storyboard.segments.map((_, idx) => idx),
    })
    throw createError({
      statusCode: 404,
      message: 'Segment not found',
    })
  }

  console.log(`[Optimize Continuity ${segmentId}] Segment found, total segments: ${storyboard.segments.length}`)

  // Check if there's a next segment
  const nextSegment = storyboard.segments[segmentId + 1]
  if (!nextSegment) {
    console.error(`[Optimize Continuity ${segmentId}] Validation failed: No next segment found`, {
      segmentId,
      totalSegments: storyboard.segments.length,
      isLastSegment: segmentId === storyboard.segments.length - 1,
    })
    throw createError({
      statusCode: 400,
      message: 'No next segment found. Continuity optimization requires a following segment.',
    })
  }

  console.log(`[Optimize Continuity ${segmentId}] Next segment exists (segmentId: ${segmentId + 1})`)

  // Get current segment's asset
  const currentAsset = job.assets?.[segmentId]
  if (!currentAsset || !currentAsset.videoUrl) {
    console.error(`[Optimize Continuity ${segmentId}] Validation failed: Current segment missing video URL`, {
      segmentId,
      hasAsset: !!currentAsset,
      assetVideoUrl: currentAsset?.videoUrl || 'missing',
      availableAssetIds: job.assets ? Object.keys(job.assets).map(Number) : [],
    })
    throw createError({
      statusCode: 400,
      message: 'Current segment does not have a video URL',
    })
  }

  console.log(`[Optimize Continuity ${segmentId}] Current segment has video URL: ${currentAsset.videoUrl}`)

  const tempPaths: string[] = []

  // Get next segment's first frame image - with fallback to extracting from video
  let nextFirstFrame = nextSegment.firstFrameImage
  let frameSource = 'storyboard' // Track where the frame came from
  
  if (!nextFirstFrame) {
    console.log(`[Optimize Continuity ${segmentId}] Next segment missing firstFrameImage, attempting to extract from video...`)
    
    // Check if next segment has a video URL in job assets
    const nextAsset = job.assets?.[segmentId + 1]
    if (nextAsset && nextAsset.videoUrl) {
      console.log(`[Optimize Continuity ${segmentId}] Next segment has video URL, extracting first frame...`)
      try {
        // Download next segment's video
        const nextVideoPath = await downloadFile(nextAsset.videoUrl)
        tempPaths.push(nextVideoPath)
        
        // Extract first frame from video
        nextFirstFrame = await extractFirstFrame(nextVideoPath)
        tempPaths.push(nextFirstFrame)
        frameSource = 'extracted'
        
        console.log(`[Optimize Continuity ${segmentId}] Successfully extracted first frame from next segment video`)
      } catch (extractError: any) {
        console.error(`[Optimize Continuity ${segmentId}] Failed to extract first frame from video:`, extractError.message)
        throw createError({
          statusCode: 400,
          message: `Next segment does not have a first frame image, and extraction from video failed: ${extractError.message}. Please generate frames for all segments or ensure the storyboard is saved with frame images.`,
        })
      }
    } else {
      console.error(`[Optimize Continuity ${segmentId}] Validation failed: Next segment missing first frame image and video URL`, {
        segmentId,
        nextSegmentId: segmentId + 1,
        nextSegmentType: nextSegment.type,
        nextSegmentDescription: nextSegment.description,
        hasFirstFrameImage: !!nextSegment.firstFrameImage,
        hasNextAsset: !!nextAsset,
        nextAssetVideoUrl: nextAsset?.videoUrl || 'missing',
      })
      throw createError({
        statusCode: 400,
        message: 'Next segment does not have a first frame image or a video URL. Please generate frames for all segments or ensure the storyboard is saved with frame images.',
      })
    }
  }

  console.log(`[Optimize Continuity ${segmentId}] Next segment first frame obtained from: ${frameSource}`)
  console.log(`[Optimize Continuity ${segmentId}] ===== Validation passed =====`)

  try {
    console.log(`[Optimize Continuity ${segmentId}] Starting continuity optimization`)
    console.log(`[Optimize Continuity ${segmentId}] Current segment video: ${currentAsset.videoUrl}`)
    console.log(`[Optimize Continuity ${segmentId}] Next segment first frame: ${nextFirstFrame}`)

    // Step 1: Download current segment video
    console.log(`[Optimize Continuity ${segmentId}] Downloading video...`)
    const localVideoPath = await downloadFile(currentAsset.videoUrl)
    tempPaths.push(localVideoPath)
    console.log(`[Optimize Continuity ${segmentId}] Video downloaded to: ${localVideoPath}`)

    // Step 2: Get video duration
    const videoDuration = await getVideoDuration(localVideoPath)
    console.log(`[Optimize Continuity ${segmentId}] Video duration: ${videoDuration}s`)

    // Step 3: Extract all frames from last 1 second
    console.log(`[Optimize Continuity ${segmentId}] Extracting frames from last 1 second...`)
    const lastFrames = await extractAllFramesFromEnd(localVideoPath, videoDuration, 1.0)
    console.log(`[Optimize Continuity ${segmentId}] Extracted ${lastFrames.length} frames`)
    tempPaths.push(...lastFrames)

    if (lastFrames.length === 0) {
      throw new Error('Failed to extract frames from video')
    }

    // Step 4: Analyze frames with OpenAI Vision API
    console.log(`[Optimize Continuity ${segmentId}] Analyzing frames for continuity...`)
    console.log(`[Optimize Continuity ${segmentId}] Last frames count: ${lastFrames.length}`)
    console.log(`[Optimize Continuity ${segmentId}] Last frames:`, lastFrames.map((f, i) => `${i}: ${f.substring(0, 50)}...`))
    console.log(`[Optimize Continuity ${segmentId}] Next first frame:`, nextFirstFrame?.substring(0, 50) + '...')
    
    let analysisResult
    try {
      analysisResult = await callOpenAIMCP('analyze_frames_for_continuity', {
        lastFrames,
        nextFirstFrame,
      })
      console.log(`[Optimize Continuity ${segmentId}] OpenAI analysis call successful`)
      console.log(`[Optimize Continuity ${segmentId}] Analysis result type:`, typeof analysisResult)
      console.log(`[Optimize Continuity ${segmentId}] Analysis result keys:`, analysisResult ? Object.keys(analysisResult) : 'null/undefined')
    } catch (openAIError: any) {
      console.error(`[Optimize Continuity ${segmentId}] ===== OpenAI Vision Analysis Failed =====`)
      console.error(`[Optimize Continuity ${segmentId}] Error message:`, openAIError.message)
      console.error(`[Optimize Continuity ${segmentId}] Error stack:`, openAIError.stack)
      console.error(`[Optimize Continuity ${segmentId}] Error details:`, {
        name: openAIError.name,
        message: openAIError.message,
        cause: openAIError.cause,
        lastFramesCount: lastFrames.length,
        hasNextFirstFrame: !!nextFirstFrame,
        hasOpenAIApiKey: !!process.env.OPENAI_API_KEY,
        openAIApiKeyLength: process.env.OPENAI_API_KEY?.length || 0,
      })
      throw new Error(`OpenAI vision analysis failed: ${openAIError.message}`)
    }

    // Parse the analysis result
    let analysis: {
      selectedFrameIndex: number
      selectedFrameIndex0Based: number
      similarityScore: number
      differences: string[]
      reasoning: string
    }

    try {
      if (typeof analysisResult === 'string') {
        analysis = JSON.parse(analysisResult)
      } else if (analysisResult.content && typeof analysisResult.content === 'string') {
        analysis = JSON.parse(analysisResult.content)
      } else if (analysisResult.selectedFrameIndex !== undefined) {
        analysis = analysisResult as typeof analysis
      } else {
        console.error(`[Optimize Continuity ${segmentId}] Invalid analysis result format:`, JSON.stringify(analysisResult, null, 2))
        throw new Error('Invalid analysis result format')
      }
      
      console.log(`[Optimize Continuity ${segmentId}] Analysis result parsed successfully:`, JSON.stringify(analysis, null, 2))
    } catch (parseError: any) {
      console.error(`[Optimize Continuity ${segmentId}] ===== Failed to Parse Analysis Result =====`)
      console.error(`[Optimize Continuity ${segmentId}] Parse error:`, parseError.message)
      console.error(`[Optimize Continuity ${segmentId}] Raw result:`, JSON.stringify(analysisResult, null, 2))
      throw new Error(`Failed to parse OpenAI analysis result: ${parseError.message}`)
    }

    // Step 5: Calculate trim timestamp
    // Frames are extracted from last 1 second, ordered chronologically
    // Frame index 0 = 1 second from end, frame index N-1 = at end
    // We need to calculate the timestamp where the selected frame occurs
    const frameCount = lastFrames.length
    const frameInterval = 1.0 / frameCount // Time between frames
    const selectedFramePosition = analysis.selectedFrameIndex0Based // 0-based index
    // Calculate timestamp: videoDuration - (1.0 - (selectedFramePosition * frameInterval))
    // This gives us the exact timestamp where the selected frame occurs
    const trimTimestamp = videoDuration - (1.0 - (selectedFramePosition * frameInterval))
    
    console.log(`[Optimize Continuity ${segmentId}] Selected frame index: ${analysis.selectedFrameIndex} (0-based: ${analysis.selectedFrameIndex0Based})`)
    console.log(`[Optimize Continuity ${segmentId}] Frame interval: ${frameInterval}s`)
    console.log(`[Optimize Continuity ${segmentId}] Trim timestamp: ${trimTimestamp}s`)

    // Step 6: Trim video at optimal timestamp
    console.log(`[Optimize Continuity ${segmentId}] Trimming video at ${trimTimestamp}s...`)
    const trimmedVideoPath = await trimVideoAtTimestamp(localVideoPath, trimTimestamp)
    tempPaths.push(trimmedVideoPath)
    console.log(`[Optimize Continuity ${segmentId}] Video trimmed to: ${trimmedVideoPath}`)

    // Step 7: Upload trimmed video to S3
    console.log(`[Optimize Continuity ${segmentId}] Uploading trimmed video to S3...`)
    const trimmedVideoBuffer = await import('fs/promises').then(fs => fs.readFile(trimmedVideoPath))
    const trimmedVideoUrl = await saveVideo(
      trimmedVideoBuffer,
      `segment-${segmentId}-trimmed-${nanoid()}.mp4`,
      'ai_videos'
    )
    console.log(`[Optimize Continuity ${segmentId}] Trimmed video uploaded: ${trimmedVideoUrl}`)

    // Step 8: Track cost (~$0.03 per optimization)
    await trackCost('optimize-continuity', 0.03, {
      segmentId,
      frameCount: lastFrames.length,
      similarityScore: analysis.similarityScore,
      trimTimestamp,
    })

    // Step 9: Update asset metadata
    const updatedMetadata = {
      ...currentAsset.metadata,
      trimmedVideoUrl,
      trimTimestamp,
      continuityScore: analysis.similarityScore,
      originalVideoUrl: currentAsset.videoUrl, // Preserve original URL
    }

    // Update the asset in the job
    if (job.assets) {
      job.assets[segmentId] = {
        ...currentAsset,
        metadata: updatedMetadata,
      }
      await saveJob(job)
    }

    console.log(`[Optimize Continuity ${segmentId}] Continuity optimization completed successfully`)
    console.log(`[Optimize Continuity ${segmentId}] Original video: ${currentAsset.videoUrl}`)
    console.log(`[Optimize Continuity ${segmentId}] Trimmed video: ${trimmedVideoUrl}`)
    console.log(`[Optimize Continuity ${segmentId}] Trim timestamp: ${trimTimestamp}s`)
    console.log(`[Optimize Continuity ${segmentId}] Continuity score: ${analysis.similarityScore}`)

    // Clean up temp files
    await cleanupTempFiles(tempPaths).catch((error) => {
      console.warn(`[Optimize Continuity ${segmentId}] Error during cleanup:`, error.message)
    })

    return {
      success: true,
      asset: job.assets?.[segmentId],
      analysis: {
        selectedFrameIndex: analysis.selectedFrameIndex,
        similarityScore: analysis.similarityScore,
        differences: analysis.differences,
        reasoning: analysis.reasoning,
      },
      trimTimestamp,
    }
  } catch (error: any) {
    // Log detailed error information
    console.error(`[Optimize Continuity ${segmentId}] ===== Error Occurred =====`)
    console.error(`[Optimize Continuity ${segmentId}] Request context:`, {
      segmentId,
      jobId,
      hasJob: !!job,
      hasStoryboard: !!storyboard,
      storyboardSegmentCount: storyboard?.segments?.length || 0,
      hasCurrentAsset: !!currentAsset,
      currentAssetVideoUrl: currentAsset?.videoUrl || 'missing',
      hasNextSegment: !!nextSegment,
      nextSegmentFirstFrame: !!nextFirstFrame,
    })
    console.error(`[Optimize Continuity ${segmentId}] Error details:`, {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      cause: error.cause,
    })
    console.error(`[Optimize Continuity ${segmentId}] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2))

    // Clean up temp files on error
    await cleanupTempFiles(tempPaths).catch(() => {})

    // If error already has a statusCode (from createError), preserve it
    if (error.statusCode && error.statusCode !== 500) {
      console.error(`[Optimize Continuity ${segmentId}] Re-throwing error with preserved statusCode: ${error.statusCode}`)
      throw error
    }

    // Otherwise, wrap as 500 error
    throw createError({
      statusCode: 500,
      message: `Failed to optimize continuity: ${error.message}`,
      data: {
        originalError: error.message,
        segmentId,
        jobId,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    })
  }
})

