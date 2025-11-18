import { promises as fs } from 'fs'
import path from 'path'
import { downloadFile } from '../../utils/storage'

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

  // Download video file (handles both local files and S3 URLs)
  const videoPath = await downloadFile(video.url)
  const videoBuffer = await fs.readFile(videoPath)

  // Set headers for download
  setHeader(event, 'Content-Type', 'video/mp4')
  setHeader(event, 'Content-Disposition', `attachment; filename="adubun-${id}.mp4"`)
  setHeader(event, 'Content-Length', videoBuffer.length.toString())

  return videoBuffer
})

