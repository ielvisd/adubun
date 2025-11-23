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

  // If asset generation failed, mark video job as failed
  if (assetJob.status === 'failed') {
    videoJob.status = 'failed'
    videoJob.error = assetJob.error || 'Asset generation failed'
    videoJob.progress = 50
    await saveVideoJob(videoJob)
    return {
      status: 'failed',
      progress: 50,
      error: videoJob.error,
      step: 'generating-assets',
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
    if (assetJob.assets) {
      assetJob.assets.forEach((asset) => {
        if (asset.status === 'completed' && asset.videoUrl) {
          sceneVideos[asset.segmentId] = asset.videoUrl
        }
      })
    }
    
    return {
      status: 'processing',
      progress: assetProgress,
      step: 'generating-assets',
      message: `Generating assets: ${completedSegments}/${totalSegments} segments completed`,
      assets: assetJob.assets,
      sceneVideos,
      assetJobId: videoJob.assetJobId,
    }
  }

  // Assets are completed, now compose video
  if (assetJob.status === 'completed' && videoJob.step === 'generating-assets') {
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
      
      return {
        status: 'completed',
        progress: 100,
        videoUrl: composeResult.videoUrl,
        videoId: composeResult.videoId,
        step: 'completed',
        assets: assetJob.assets,
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
  try {
    const assetJob = await getJob(videoJob.assetJobId)
    if (assetJob?.assets) {
      assets = assetJob.assets
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
    sceneVideos,
    assetJobId: videoJob.assetJobId,
  }
})

