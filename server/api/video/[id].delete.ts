import { promises as fs } from 'fs'
import path from 'path'
import { deleteFile } from '../../utils/storage'

const VIDEOS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')

async function deleteVideoMetadata(id: string) {
  try {
    const content = await fs.readFile(VIDEOS_FILE, 'utf-8')
    const videos = JSON.parse(content)
    const filtered = videos.filter((v: any) => v.id !== id)
    await fs.writeFile(VIDEOS_FILE, JSON.stringify(filtered, null, 2))
    return true
  } catch {
    return false
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

  // Get video to find file path
  try {
    const content = await fs.readFile(VIDEOS_FILE, 'utf-8')
    const videos = JSON.parse(content)
    const video = videos.find((v: any) => v.id === id)

    if (video) {
      // Delete file
      await deleteFile(video.url)
      // Delete metadata
      await deleteVideoMetadata(id)
    }

    return { success: true, deleted: id }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `Failed to delete video: ${error.message}`,
    })
  }
})

