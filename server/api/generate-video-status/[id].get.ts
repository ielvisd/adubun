import { getVideoJob, saveVideoJob } from '../generate-video.post'
import { getJob } from '../generate-assets.post'
import path from 'path'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Job ID required',
    })
  }

  const videoJob = await getVideoJob(id)
  if (!videoJob) {
    throw createError({
      statusCode: 404,
      message: 'Video generation job not found',
    })
  }

  // If already completed or failed, return status
  if (videoJob.status === 'completed') {
    return {
      status: 'completed',
      progress: 100,
      videoUrl: videoJob.videoUrl,
      videoId: videoJob.videoId,
      step: 'completed',
    }
  }

  if (videoJob.status === 'failed') {
    return {
      status: 'failed',
      progress: videoJob.progress,
      error: videoJob.error,
      step: videoJob.step,
    }
  }

  // Check asset generation status
  const assetJob = await getJob(videoJob.assetJobId)
  if (!assetJob) {
    throw createError({
      statusCode: 404,
      message: 'Asset generation job not found',
    })
  }

  // Check if we have any completed segments with video URLs
  const completedSegmentsWithVideos = assetJob.assets?.filter(
    a => a.status === 'completed' && a.videoUrl
  ) || []
  
  // If asset generation failed but we have completed segments, allow composition
  if (assetJob.status === 'failed') {
    if (completedSegmentsWithVideos.length === 0) {
      // No completed segments, mark video job as failed
      videoJob.status = 'failed'
      videoJob.error = assetJob.error || 'Asset generation failed - no segments completed'
      videoJob.progress = 50
      await saveVideoJob(videoJob)
      return {
        status: 'failed',
        progress: 50,
        error: videoJob.error,
        step: 'generating-assets',
      }
    } else {
      // We have some completed segments, allow composition to proceed
      console.log(`[Generate Video Status] Asset job marked as failed, but ${completedSegmentsWithVideos.length} segments completed. Proceeding with composition.`)
    }
  }

  // Calculate progress based on asset generation
  const totalSegments = assetJob.assets?.length || 0
  const completedSegments = assetJob.assets?.filter(a => a.status === 'completed').length || 0
  const assetProgress = totalSegments > 0 
    ? Math.round((completedSegments / totalSegments) * 50) // Assets are 50% of total
    : 0

  // If assets are still generating, return current progress
  if (assetJob.status === 'processing') {
    videoJob.progress = assetProgress
    videoJob.step = 'generating-assets'
    await saveVideoJob(videoJob)
    
    // Extract scene videos from assets
    const sceneVideos: Record<number, string> = {}
    // Build detailed segment status array
    const segmentStatuses = assetJob.assets?.map((asset) => {
      const metadata = asset.metadata || {}
      const elapsedTime = metadata.elapsedTime || 0
      const predictionId = metadata.predictionId || asset.metadata?.predictionId
      const predictionStatus = metadata.predictionStatus || 'unknown'
      
      return {
        segmentId: asset.segmentId,
        status: asset.status,
        error: asset.error,
        videoUrl: asset.videoUrl,
        predictionId,
        predictionStatus,
        elapsedTime: Math.round(elapsedTime / 1000), // Convert to seconds
        segmentType: metadata.segmentType || 'unknown',
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        duration: metadata.duration,
      }
    }) || []
    
    if (assetJob.assets) {
      assetJob.assets.forEach((asset) => {
        if (asset.status === 'completed' && asset.videoUrl) {
          sceneVideos[asset.segmentId] = asset.videoUrl
        }
      })
    }
    
    // Calculate estimated time remaining (average time per segment * remaining segments)
    const processingSegments = segmentStatuses.filter(s => s.status === 'processing')
    const avgProcessingTime = processingSegments.length > 0
      ? processingSegments.reduce((sum, s) => sum + (s.elapsedTime || 0), 0) / processingSegments.length
      : 0
    const remainingSegments = totalSegments - completedSegments
    const estimatedTimeRemaining = avgProcessingTime > 0 && remainingSegments > 0
      ? Math.round(avgProcessingTime * remainingSegments)
      : null
    
    return {
      status: 'processing',
      progress: assetProgress,
      step: 'generating-assets',
      message: `Generating assets: ${completedSegments}/${totalSegments} segments completed`,
      assets: assetJob.assets,
      segmentStatuses, // Detailed segment-level status
      sceneVideos,
      assetJobId: videoJob.assetJobId,
      estimatedTimeRemaining, // In seconds
      totalSegments,
      completedSegments,
      failedSegments: segmentStatuses.filter(s => s.status === 'failed').length,
      processingSegments: processingSegments.length,
    }
  }

  // Assets are completed (or partially completed with at least one video), now compose video
  const hasCompletedSegments = completedSegmentsWithVideos.length > 0
  if ((assetJob.status === 'completed' || (assetJob.status === 'failed' && hasCompletedSegments)) && videoJob.step === 'generating-assets') {
    try {
      console.log('[Generate Video Status] Assets completed, starting video composition')
      videoJob.step = 'composing-video'
      videoJob.progress = 75
      await saveVideoJob(videoJob)

      // Format clips for composition
      const segmentTimings = new Map<number, { startTime: number; endTime: number; type: string }>()
      videoJob.storyboard.segments.forEach((seg, idx) => {
        segmentTimings.set(idx, {
          startTime: seg.startTime,
          endTime: seg.endTime,
          type: seg.type,
        })
      })

      let currentStartTime = 0
      const formattedClips = assetJob.assets!
        .filter(asset => asset.status === 'completed' && asset.videoUrl)
        .map((asset) => {
          const timing = segmentTimings.get(asset.segmentId)
          if (!timing) {
            console.warn(`[Generate Video Status] No timing found for segment ${asset.segmentId}`)
            return null
          }

          const clipStart = currentStartTime
          const clipDuration = timing.endTime - timing.startTime
          const clipEnd = currentStartTime + clipDuration
          currentStartTime = clipEnd

          const videoUrl = asset.videoUrl || asset.metadata?.videoUrl || asset.metadata?.replicateVideoUrl
          if (!videoUrl) {
            console.warn(`[Generate Video Status] No video URL for segment ${asset.segmentId}`)
            return null
          }

          return {
            videoUrl,
            voiceUrl: asset.voiceUrl || asset.metadata?.voiceUrl,
            startTime: clipStart,
            endTime: clipEnd,
            type: timing.type || 'scene',
          }
        })
        .filter((clip: any) => clip !== null)

      if (formattedClips.length === 0) {
        throw new Error('No video clips available for composition')
      }

      // Convert music URL from local path to proper URL format
      let backgroundMusicUrl: string | undefined = undefined
      if (assetJob.musicUrl) {
        const musicUrl = assetJob.musicUrl
        if (musicUrl.startsWith('http://') || musicUrl.startsWith('https://')) {
          backgroundMusicUrl = musicUrl
        } else {
          const filename = path.basename(musicUrl)
          const config = useRuntimeConfig()
          const baseUrl = config.public.appUrl || 'http://localhost:3000'
          backgroundMusicUrl = `${baseUrl}/api/assets/${filename}`
        }
      }

      const composeOptions: {
        transition: string
        musicVolume: number
        aspectRatio: string
        backgroundMusicUrl?: string
      } = {
        transition: 'none',
        musicVolume: 70,
        aspectRatio: videoJob.storyboard.meta.aspectRatio || '9:16',
      }

      if (backgroundMusicUrl) {
        composeOptions.backgroundMusicUrl = backgroundMusicUrl
      }

      const composeResult = await $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video-smart', {
        method: 'POST',
        body: {
          clips: formattedClips,
          options: composeOptions,
        },
      })

      // Update video job with result
      videoJob.status = 'completed'
      videoJob.progress = 100
      videoJob.step = 'completed'
      videoJob.videoUrl = composeResult.videoUrl
      videoJob.videoId = composeResult.videoId
      videoJob.endTime = Date.now()
      await saveVideoJob(videoJob)

      console.log('[Generate Video Status] Video composition completed')
      console.log('[Generate Video Status] Final video URL:', composeResult.videoUrl)

      // Extract scene videos from assets
      const sceneVideos: Record<number, string> = {}
      if (assetJob.assets) {
        assetJob.assets.forEach((asset) => {
          if (asset.status === 'completed' && asset.videoUrl) {
            sceneVideos[asset.segmentId] = asset.videoUrl
          }
        })
      }
      
      // Build detailed segment status for completed job
      const completedSegmentStatuses = assetJob.assets?.map((asset) => {
        const metadata = asset.metadata || {}
        return {
          segmentId: asset.segmentId,
          status: asset.status,
          error: asset.error,
          videoUrl: asset.videoUrl,
          predictionId: metadata.predictionId,
          predictionStatus: 'succeeded',
          elapsedTime: metadata.elapsedTime ? Math.round(metadata.elapsedTime / 1000) : null,
          segmentType: metadata.segmentType || 'unknown',
          startTime: metadata.startTime,
          endTime: metadata.endTime,
          duration: metadata.duration,
        }
      }) || []
      
      return {
        status: 'completed',
        progress: 100,
        videoUrl: composeResult.videoUrl,
        videoId: composeResult.videoId,
        step: 'completed',
        assets: assetJob.assets,
        segmentStatuses: completedSegmentStatuses,
        sceneVideos,
        assetJobId: videoJob.assetJobId,
      }
    } catch (error: any) {
      console.error('[Generate Video Status] Error composing video:', error)
      videoJob.status = 'failed'
      videoJob.error = error.message || 'Failed to compose video'
      videoJob.progress = 75
      await saveVideoJob(videoJob)

      return {
        status: 'failed',
        progress: 75,
        error: videoJob.error,
        step: 'composing-video',
      }
    }
  }

  // If already composing, return processing status
  if (videoJob.step === 'composing-video') {
    return {
      status: 'processing',
      progress: 75,
      step: 'composing-video',
      message: 'Composing final video...',
    }
  }

  // Default: return current status
  // Try to get assets if available
  let sceneVideos: Record<number, string> = {}
  let assets = undefined
  let segmentStatuses = []
  try {
    const assetJob = await getJob(videoJob.assetJobId)
    if (assetJob?.assets) {
      assets = assetJob.assets
      segmentStatuses = assetJob.assets.map((asset) => {
        const metadata = asset.metadata || {}
        const elapsedTime = metadata.elapsedTime || 0
        const predictionId = metadata.predictionId || asset.metadata?.predictionId
        const predictionStatus = metadata.predictionStatus || 'unknown'
        
        return {
          segmentId: asset.segmentId,
          status: asset.status,
          error: asset.error,
          videoUrl: asset.videoUrl,
          predictionId,
          predictionStatus,
          elapsedTime: Math.round(elapsedTime / 1000), // Convert to seconds
          segmentType: metadata.segmentType || 'unknown',
          startTime: metadata.startTime,
          endTime: metadata.endTime,
          duration: metadata.duration,
        }
      })
      
      assetJob.assets.forEach((asset) => {
        if (asset.status === 'completed' && asset.videoUrl) {
          sceneVideos[asset.segmentId] = asset.videoUrl
        }
      })
    }
  } catch (e) {
    // Ignore errors when fetching assets
  }
  
  return {
    status: videoJob.status,
    progress: videoJob.progress,
    step: videoJob.step,
    assets,
    segmentStatuses, // Detailed segment-level status
    sceneVideos,
    assetJobId: videoJob.assetJobId,
  }
})

