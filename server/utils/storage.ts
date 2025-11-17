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
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download file from ${url}: ${response.status} ${response.statusText}`)
  }
  const buffer = await response.arrayBuffer()
  if (!buffer) {
    throw new Error(`Failed to get file buffer from ${url}: response body is empty`)
  }
  const fileBuffer = Buffer.from(buffer)
  
  if (outputPath) {
    await fs.writeFile(outputPath, fileBuffer)
    return outputPath
  }
  
  return await saveAsset(fileBuffer, url.split('.').pop() || 'tmp')
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

