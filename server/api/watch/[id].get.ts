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
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Video ID required',
    })
  }

  const video = await getVideo(id)
  if (!video) {
    throw createError({
      statusCode: 404,
      message: 'Video not found',
    })
  }

  // Read video file
  const videoBuffer = await readFile(video.url)

  // Set headers for streaming
  setHeader(event, 'Content-Type', 'video/mp4')
  setHeader(event, 'Content-Length', videoBuffer.length.toString())
  setHeader(event, 'Accept-Ranges', 'bytes')

  return videoBuffer
})

