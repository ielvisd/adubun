import { promises as fs } from 'fs'
import path from 'path'

const VIDEOS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : 50
  const offset = query.offset ? parseInt(query.offset as string) : 0

  try {
    const content = await fs.readFile(VIDEOS_FILE, 'utf-8')
    const videos = JSON.parse(content)

    // Sort by creation date (newest first)
    const sorted = videos.sort((a: any, b: any) => b.createdAt - a.createdAt)

    // Paginate
    const paginated = sorted.slice(offset, offset + limit)

    return {
      videos: paginated,
      total: videos.length,
      limit,
      offset,
    }
  } catch {
    return {
      videos: [],
      total: 0,
      limit,
      offset,
    }
  }
})

