import { composeVideoSchema } from '../utils/validation'
import { composeVideo } from '../utils/ffmpeg'
import { downloadFile, saveVideo, cleanupTempFiles } from '../utils/storage'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'
import path from 'path'
import { promises as fs } from 'fs'
import type { Video } from '../../app/types/generation'

const VIDEOS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'videos.json')

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
  const { clips, options } = composeVideoSchema.parse(await readBody(event))
  const outputPath = path.join(
    process.env.MCP_FILESYSTEM_ROOT || './data',
    'videos',
    `${nanoid()}.mp4`
  )

  const tempPaths: string[] = []

  try {
    // Download clips
    const localClips = await Promise.all(
      clips.map(async (clip) => {
        const videoPath = await downloadFile(clip.videoUrl)
        tempPaths.push(videoPath)

        let voicePath: string | undefined
        if (clip.voiceUrl) {
          voicePath = await downloadFile(clip.voiceUrl)
          tempPaths.push(voicePath)
        }

        return {
          localPath: videoPath,
          voicePath,
          startTime: clip.startTime,
          endTime: clip.endTime,
          type: clip.type,
        }
      })
    )

    // Compose video
    await composeVideo(localClips, {
      ...options,
      outputPath,
    })

    // Read composed video
    const videoBuffer = await fs.readFile(outputPath)
    const videoId = nanoid()
    const finalPath = await saveVideo(videoBuffer, `${videoId}.mp4`)

    // Calculate duration
    const duration = Math.max(...clips.map(c => c.endTime))

    // Save video metadata
    const video: Video = {
      id: videoId,
      url: finalPath,
      duration,
      resolution: '1920x1080',
      aspectRatio: '16:9', // Default, could be calculated
      generationCost: 0, // Will be calculated from cost tracker
      createdAt: Date.now(),
      storyboardId: '',
      jobId: '',
    }
    await saveVideoMetadata(video)

    // Track cost
    await trackCost('video-composition', 0.10, {
      videoId,
      duration,
      clipsCount: clips.length,
    })

    // Cleanup temp files
    await cleanupTempFiles(tempPaths)

    return {
      videoUrl: finalPath,
      videoId,
    }
  } catch (error: any) {
    // Cleanup on error
    await cleanupTempFiles(tempPaths)
    throw createError({
      statusCode: 500,
      message: `Video composition failed: ${error.message}`,
    })
  }
})

