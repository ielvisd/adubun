import { readFile } from '../../utils/storage'
import { promises as fs } from 'fs'
import path from 'path'

const ASSETS_DIR = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Asset ID required',
    })
  }

  const filePath = path.join(ASSETS_DIR, id)
  
  try {
    // Check if file exists
    await fs.access(filePath)
    
    // Read file
    const fileBuffer = await readFile(filePath)
    
    // Determine content type based on extension
    const ext = id.split('.').pop()?.toLowerCase()
    const contentTypeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
    }
    
    const contentType = contentTypeMap[ext || ''] || 'application/octet-stream'
    
    // Set headers
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    
    return fileBuffer
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw createError({
        statusCode: 404,
        message: 'Asset not found',
      })
    }
    throw createError({
      statusCode: 500,
      message: 'Failed to read asset',
    })
  }
})

