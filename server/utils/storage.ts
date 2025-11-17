import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { uploadFileToS3 } from './s3-upload'

const DATA_DIR = process.env.MCP_FILESYSTEM_ROOT || './data'
const VIDEOS_DIR = path.join(DATA_DIR, 'videos')
const ASSETS_DIR = path.join(DATA_DIR, 'assets')
const STORYBOARDS_DIR = path.join(DATA_DIR, 'storyboards')
const JOBS_DIR = path.join(DATA_DIR, 'jobs')

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(VIDEOS_DIR, { recursive: true })
  await fs.mkdir(ASSETS_DIR, { recursive: true })
  await fs.mkdir(STORYBOARDS_DIR, { recursive: true })
  await fs.mkdir(JOBS_DIR, { recursive: true })
}

export async function saveVideo(fileBuffer: Buffer, filename?: string, folder: string = 'ai_videos'): Promise<string> {
  await ensureDirectories()
  const videoId = filename || `${nanoid()}.mp4`
  const filePath = path.join(VIDEOS_DIR, videoId)
  
  // Save video locally first (for backup and fallback)
  await fs.writeFile(filePath, fileBuffer)
  console.log('[Storage] Video saved locally:', filePath)
  
  // Upload to S3 with proper folder organization
  try {
    const s3Url = await uploadFileToS3(filePath, folder)
    console.log(`[Storage] Video uploaded to S3 (${folder}):`, s3Url)
    return s3Url
  } catch (error: any) {
    console.error('[Storage] Failed to upload video to S3:', error.message)
    console.warn('[Storage] Falling back to local file path:', filePath)
    // Return local path as fallback if S3 upload fails
    return filePath
  }
}

export async function saveAsset(fileBuffer: Buffer, extension: string = 'tmp'): Promise<string> {
  await ensureDirectories()
  const assetId = `${nanoid()}.${extension}`
  const filePath = path.join(ASSETS_DIR, assetId)
  await fs.writeFile(filePath, fileBuffer)
  return filePath
}

export async function saveStoryboard(storyboard: any): Promise<string> {
  await ensureDirectories()
  const storyboardId = storyboard.id || nanoid()
  const filePath = path.join(STORYBOARDS_DIR, `${storyboardId}.json`)
  await fs.writeFile(filePath, JSON.stringify(storyboard, null, 2))
  return filePath
}

export async function readStoryboard(storyboardId: string): Promise<any> {
  const filePath = path.join(STORYBOARDS_DIR, `${storyboardId}.json`)
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

export async function readFile(filePath: string): Promise<Buffer> {
  return await fs.readFile(filePath)
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map(p => deleteFile(p)))
}

export async function downloadFile(url: string, outputPath?: string): Promise<string> {
  if (!url) {
    throw new Error('Cannot download file: URL is undefined or empty')
  }
  
  // Handle local file paths
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api/')) {
    // Check if it's a local file path
    try {
      const stats = await fs.stat(url)
      if (stats.isFile()) {
        console.log('[Storage] Using local file path:', url)
        if (outputPath) {
          // Copy file to output path
          const content = await fs.readFile(url)
          await fs.writeFile(outputPath, content)
          return outputPath
        }
        return url
      }
    } catch {
      // Not a valid local path, continue with download
    }
  }
  
  // Handle relative API URLs by converting to absolute
  let absoluteUrl = url
  if (url.startsWith('/api/')) {
    // For API endpoints, we need to read from the filesystem or make an internal request
    // Check if it's a /api/watch/ endpoint
    if (url.startsWith('/api/watch/')) {
      const videoId = url.split('/api/watch/')[1]
      // Read video from videos.json and get the actual URL
      try {
        const videosFile = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')
        let content: string
        try {
          content = await fs.readFile(videosFile, 'utf-8')
        } catch (fileError: any) {
          if (fileError.code === 'ENOENT') {
            throw new Error(`Videos database not found. The video with ID ${videoId} may not exist.`)
          }
          throw fileError
        }
        
        const videos = JSON.parse(content)
        const video = videos.find((v: any) => v.id === videoId)
        if (video && video.url) {
          // Use the actual video URL (S3 or local path)
          absoluteUrl = video.url
          console.log('[Storage] Resolved API URL to video URL:', absoluteUrl)
        } else {
          throw new Error(`Video not found for ID: ${videoId}. Available videos: ${videos.length}`)
        }
      } catch (error: any) {
        throw new Error(`Failed to resolve API URL ${url}: ${error.message}`)
      }
    } else if (url.startsWith('/api/assets/')) {
      // Handle asset API endpoints
      const filename = url.split('/api/assets/')[1]
      const assetPath = path.join(ASSETS_DIR, filename)
      try {
        const stats = await fs.stat(assetPath)
        if (stats.isFile()) {
          if (outputPath) {
            const content = await fs.readFile(assetPath)
            await fs.writeFile(outputPath, content)
            return outputPath
          }
          return assetPath
        }
      } catch {
        throw new Error(`Asset file not found: ${filename}`)
      }
    } else {
      throw new Error(`Unsupported API endpoint: ${url}`)
    }
  }
  
  // Handle HTTP/HTTPS URLs (S3, Replicate, etc.)
  if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
    try {
      const response = await fetch(absoluteUrl)
      if (!response.ok) {
        throw new Error(`Failed to download file from ${absoluteUrl}: ${response.status} ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Failed to get file buffer from ${absoluteUrl}: response body is empty`)
      }
      const fileBuffer = Buffer.from(buffer)
      
      if (outputPath) {
        await fs.writeFile(outputPath, fileBuffer)
        return outputPath
      }
      
      // Determine file extension from URL or Content-Type
      const contentType = response.headers.get('content-type') || ''
      let extension = 'tmp'
      if (contentType.includes('video')) {
        extension = 'mp4'
      } else if (contentType.includes('audio')) {
        extension = 'mp3'
      } else if (url.includes('.')) {
        extension = url.split('.').pop() || 'tmp'
      }
      
      return await saveAsset(fileBuffer, extension)
    } catch (error: any) {
      throw new Error(`Failed to download from ${absoluteUrl}: ${error.message}`)
    }
  }
  
  // If we get here, it's likely a local file path that doesn't exist
  throw new Error(`Cannot download file: Invalid URL or file not found: ${url}`)
}

// Job storage functions for persistent job tracking
export interface StoryboardJob {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: any
  error?: string
  createdAt?: number
  updatedAt?: number
}

export async function saveJob(jobId: string, job: StoryboardJob): Promise<string> {
  await ensureDirectories()
  const filePath = path.join(JOBS_DIR, `${jobId}.json`)
  const jobWithTimestamps = {
    ...job,
    updatedAt: Date.now(),
    createdAt: job.createdAt || Date.now(),
  }
  await fs.writeFile(filePath, JSON.stringify(jobWithTimestamps, null, 2))
  return filePath
}

export async function loadJob(jobId: string): Promise<StoryboardJob | null> {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}.json`)
    await fs.unlink(filePath)
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

