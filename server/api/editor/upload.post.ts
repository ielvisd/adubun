import { readMultipartFormData } from 'h3'
import { saveAsset } from '../../utils/storage'
import { nanoid } from 'nanoid'
import path from 'path'
import { promises as fs } from 'fs'
import { getVideoDuration } from '../../utils/ffmpeg'

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'No file uploaded',
      })
    }

    const videoFile = formData.find(field => field.name === 'video')
    if (!videoFile || !videoFile.data) {
      throw createError({
        statusCode: 400,
        message: 'No video file found',
      })
    }

    // Validate file type
    if (!videoFile.filename?.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid video file format. Supported: MP4, MOV, AVI, MKV, WebM',
      })
    }

    // Save video file
    const videoId = nanoid()
    const videoBuffer = Buffer.from(videoFile.data)
    
    // Save to assets directory
    const videoPath = await saveAsset(videoBuffer, 'mp4')
    const assetId = path.basename(videoPath)
    
    console.log('[Editor Upload] Video saved to:', videoPath)
    console.log('[Editor Upload] Asset ID:', assetId)
    
    // Get video duration
    let duration = 0
    try {
      // Check if file exists
      await fs.access(videoPath)
      
      duration = await getVideoDuration(videoPath)
      console.log('[Editor Upload] Video duration:', duration)
    } catch (error: any) {
      console.error('[Editor Upload] Failed to get video duration:', error)
      console.error('[Editor Upload] Error details:', error.message, error.stack)
      // Default to 10 seconds if we can't determine duration
      duration = 10
    }

    // Return video info with proper URL
    const videoUrl = `/api/assets/${assetId}`

    return {
      id: videoId,
      url: videoUrl,
      duration,
      name: videoFile.filename || 'video.mp4',
    }
  } catch (error: any) {
    console.error('[Editor Upload] Error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload video',
    })
  }
})

