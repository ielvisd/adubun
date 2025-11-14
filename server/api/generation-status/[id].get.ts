import { getJob } from '../generate-assets.post'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Job ID required',
    })
  }

  const job = await getJob(id)
  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  // Calculate overall progress
  const totalSegments = job.assets?.length || 0
  const completedSegments = job.assets?.filter(a => a.status === 'completed').length || 0
  const overallProgress = totalSegments > 0 
    ? Math.round((completedSegments / totalSegments) * 100)
    : 0

  return {
    status: job.status,
    overallProgress,
    segments: job.assets?.map((asset, idx) => ({
      segmentId: asset.segmentId,
      status: asset.status,
      progress: asset.status === 'completed' ? 100 : asset.status === 'processing' ? 50 : 0,
      error: asset.error,
      metadata: asset.metadata, // Include metadata for frontend access
      videoUrl: asset.videoUrl, // Include video URL
      voiceUrl: asset.voiceUrl, // Include voice URL
    })) || [],
    error: job.error,
  }
})

