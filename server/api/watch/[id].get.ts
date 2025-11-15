import { promises as fs } from 'fs'
import path from 'path'
import { readFile } from '../../utils/storage'

const VIDEOS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')

async function getVideo(id: string) {
  try {
    const content = await fs.readFile(VIDEOS_FILE, 'utf-8')
    const videos = JSON.parse(content)
    return videos.find((v: any) => v.id === id) || null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  console.log('[Watch] Video ID requested:', id)
  
  if (!id) {
    console.error('[Watch] No video ID provided')
    throw createError({
      statusCode: 400,
      message: 'Video ID required',
    })
  }

  const video = await getVideo(id)
  console.log('[Watch] Video lookup result:', video ? 'found' : 'not found')
  
  if (!video) {
    console.error('[Watch] Video not found in database for ID:', id)
    throw createError({
      statusCode: 404,
      message: 'Video not found',
    })
  }

  console.log('[Watch] Video metadata:', {
    id: video.id,
    url: video.url,
    duration: video.duration,
    resolution: video.resolution,
  })

  // Check if URL is an S3 URL (or any HTTP(S) URL)
  if (video.url.startsWith('http://') || video.url.startsWith('https://')) {
    console.log('[Watch] Video is stored in S3, redirecting to:', video.url)
    // Redirect to the S3 presigned URL
    return sendRedirect(event, video.url, 302)
  }

  // Handle local file path
  console.log('[Watch] Video is stored locally, reading from:', video.url)
  
  // Check if file exists
  const { promises: fs } = await import('fs')
  try {
    const stats = await fs.stat(video.url)
    console.log('[Watch] Video file exists, size:', stats.size, 'bytes')
  } catch (statError: any) {
    console.error('[Watch] Video file does not exist or cannot be read:', video.url)
    console.error('[Watch] Stat error:', statError.message)
    throw createError({
      statusCode: 404,
      message: `Video file not found at: ${video.url}`,
    })
  }

  // Read video file
  console.log('[Watch] Reading video file from:', video.url)
  const videoBuffer = await readFile(video.url)
  console.log('[Watch] Video buffer read, size:', videoBuffer.length, 'bytes')

  // Set headers for streaming
  setHeader(event, 'Content-Type', 'video/mp4')
  setHeader(event, 'Content-Length', videoBuffer.length.toString())
  setHeader(event, 'Accept-Ranges', 'bytes')
  console.log('[Watch] Headers set, returning video buffer')

  return videoBuffer
})

