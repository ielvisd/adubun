import { promises as fs } from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  
  if (!id) {
    throw createError({ statusCode: 400, message: 'Asset ID required' })
  }

  const ASSETS_DIR = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')
  const filePath = path.join(ASSETS_DIR, id)

  try {
    // Check if file exists
    await fs.access(filePath)
    
    // Read file
    const fileBuffer = await fs.readFile(filePath)
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase()
    let contentType = 'application/octet-stream'
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
    else if (ext === '.png') contentType = 'image/png'
    else if (ext === '.webp') contentType = 'image/webp'
    else if (ext === '.mp4') contentType = 'video/mp4'
    
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Cache-Control', 'public, max-age=31536000') // Cache for 1 year
    
    return fileBuffer
  } catch (error) {
    throw createError({ statusCode: 404, message: 'Asset not found' })
  }
})
