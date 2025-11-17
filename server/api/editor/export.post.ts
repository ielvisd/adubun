import { readMultipartFormData, getRequestURL } from 'h3'
import { downloadFile, saveVideo, cleanupTempFiles, saveAsset } from '../../utils/storage'
import { composeVideo } from '../../utils/ffmpeg'
import { nanoid } from 'nanoid'
import path from 'path'
import { promises as fs } from 'fs'
import type { Video } from '../../../app/types/generation'

const VIDEOS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')

interface EditorClipPayload {
  videoUrl?: string
  fileField?: string
  trimStart: number
  trimEnd: number
  transitionBefore?: 'cut' | 'crossfade'
  transitionAfter?: 'cut' | 'crossfade'
  muted?: boolean
}

async function saveVideoMetadata(video: Video) {
  let videos: Video[] = []
  try {
    const content = await fs.readFile(VIDEOS_FILE, 'utf-8')
    videos = JSON.parse(content)
  } catch {
    // File doesn't exist
  }

  videos.push(video)
  await fs.mkdir(path.dirname(VIDEOS_FILE), { recursive: true })
  await fs.writeFile(VIDEOS_FILE, JSON.stringify(videos, null, 2))
}

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({
        statusCode: 400,
        message: 'No data provided',
      })
    }

    // Parse clips
    const clipsField = formData.find(f => f.name === 'clips')
    if (!clipsField || !clipsField.data) {
      throw createError({
        statusCode: 400,
        message: 'No clips data provided',
      })
    }

    const clips: EditorClipPayload[] = JSON.parse(clipsField.data.toString())
    if (!Array.isArray(clips) || clips.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Invalid clips data',
      })
    }

    // Get audio file if provided
    const audioField = formData.find(f => f.name === 'audio')
    const audioVolume = formData.find(f => f.name === 'audioVolume')
    const volume = audioVolume ? parseFloat(audioVolume.data.toString()) : 70

    const outputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'videos',
      `${nanoid()}.mp4`
    )

    const tempPaths: string[] = []

    try {
      const fileFieldMap = new Map<string, (typeof formData)[number]>()
      for (const field of formData) {
        if (field.name && field.filename && field.data) {
          fileFieldMap.set(field.name, field)
        }
      }
      
      const requestUrl = getRequestURL(event)

      // Download and process clips
      const localClips = await Promise.all(
        clips.map(async (clip, idx) => {
          console.log(`[Editor Export] Processing clip ${idx}:`, clip.videoUrl)
          
          let videoPath: string
          
          if (clip.fileField) {
            const fileField = fileFieldMap.get(clip.fileField)
            if (!fileField || !fileField.data) {
              throw new Error(`Missing video data for ${clip.fileField}`)
            }
            const extension = getFileExtension(fileField.filename) || 'mp4'
            videoPath = await saveAsset(Buffer.from(fileField.data), extension)
          } else if (clip.videoUrl) {
            const resolvedUrl = resolveVideoUrl(requestUrl.origin, clip.videoUrl)
            videoPath = await downloadFile(resolvedUrl)
          } else {
            throw new Error(`Clip ${idx} missing video source`)
          }
          
          tempPaths.push(videoPath)

          // Trim video to get exact segment
          const processedPath = await trimVideo(videoPath, clip.trimStart, clip.trimEnd)
          tempPaths.push(processedPath)

          // Calculate timing
          const clipDuration = clip.trimEnd - clip.trimStart
          const startTime = clips.slice(0, idx).reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0)

          return {
            localPath: processedPath,
            voicePath: undefined, // Editor doesn't use voice tracks
            startTime,
            endTime: startTime + clipDuration,
            type: 'editor',
          }
        })
      )

      // Compose video
      await composeVideo(localClips, {
        transition: 'fade',
        musicVolume: volume,
        outputPath,
      })

      // Add background music if provided
      if (audioField && audioField.data) {
        await addBackgroundMusic(outputPath, audioField.data, volume)
      }

      // Read composed video
      const videoBuffer = await fs.readFile(outputPath)
      const videoId = nanoid()
      const finalPath = await saveVideo(videoBuffer, `${videoId}.mp4`)

      // Calculate duration
      const duration = clips.reduce((sum, clip) => sum + (clip.trimEnd - clip.trimStart), 0)

      // Save metadata
      const video: Video = {
        id: videoId,
        url: finalPath,
        duration,
        resolution: '1920x1080',
        aspectRatio: '16:9',
        generationCost: 0,
        createdAt: Date.now(),
        storyboardId: '',
        jobId: '',
      }
      await saveVideoMetadata(video)

      // Cleanup
      await cleanupTempFiles(tempPaths)
      await fs.unlink(outputPath).catch(() => {})

      return {
        videoUrl: `/api/watch/${videoId}`,
        videoId,
      }
    } catch (error: any) {
      await cleanupTempFiles(tempPaths)
      throw error
    }
  } catch (error: any) {
    console.error('[Editor Export] Error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to export video',
    })
  }
})

async function trimVideo(videoPath: string, startTime: number, endTime: number): Promise<string> {
  const outputPath = path.join(
    process.env.MCP_FILESYSTEM_ROOT || './data',
    'assets',
    `${nanoid()}.mp4`
  )

  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg')
    ffmpeg(videoPath)
      .seekInput(startTime)
      .duration(endTime - startTime)
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-preset fast',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
}

function resolveVideoUrl(origin: string, videoUrl: string): string {
  if (!videoUrl) {
    throw new Error('Video URL is empty')
  }
  
  if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl
  }
  
  return new URL(videoUrl, origin).toString()
}

function getFileExtension(filename?: string | null): string {
  if (!filename) return 'mp4'
  const ext = filename.split('.').pop()
  if (!ext) return 'mp4'
  return ext.toLowerCase()
}

async function addBackgroundMusic(
  videoPath: string,
  audioBuffer: Buffer,
  volume: number
): Promise<void> {
  const audioPath = path.join(
    process.env.MCP_FILESYSTEM_ROOT || './data',
    'assets',
    `${nanoid()}.mp3`
  )

  await fs.writeFile(audioPath, audioBuffer)

  const outputPath = path.join(
    process.env.MCP_FILESYSTEM_ROOT || './data',
    'videos',
    `${nanoid()}.mp4`
  )

  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg')
    const volumePercent = volume / 100

    ffmpeg(videoPath)
      .input(audioPath)
      .complexFilter([
        `[1:a]volume=${volumePercent}[audio]`,
      ])
      .outputOptions([
        '-c:v copy',
        '-map 0:v:0',
        '-map [audio]',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', async () => {
        await fs.copyFile(outputPath, videoPath)
        await fs.unlink(outputPath).catch(() => {})
        await fs.unlink(audioPath).catch(() => {})
        resolve()
      })
      .on('error', reject)
      .run()
  })
}

