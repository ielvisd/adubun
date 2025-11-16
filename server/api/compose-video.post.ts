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
  
  console.log('[Compose Video] Starting composition')
  console.log('[Compose Video] Input clips count:', clips.length)
  console.log('[Compose Video] Clips:', JSON.stringify(clips.map(c => ({
    videoUrl: c.videoUrl,
    voiceUrl: c.voiceUrl,
    startTime: c.startTime,
    endTime: c.endTime,
    type: c.type,
  })), null, 2))
  console.log('[Compose Video] Options:', JSON.stringify(options, null, 2))
  
  // Determine output resolution based on aspect ratio (default to 9:16 for ads)
  const aspectRatio = options.aspectRatio || '9:16'
  const outputWidth = aspectRatio === '9:16' ? 1080 : aspectRatio === '16:9' ? 1920 : 1080
  const outputHeight = aspectRatio === '9:16' ? 1920 : aspectRatio === '16:9' ? 1080 : 1080
  
  const outputPath = path.join(
    process.env.MCP_FILESYSTEM_ROOT || './data',
    'videos',
    `${nanoid()}.mp4`
  )
  console.log('[Compose Video] Output path:', outputPath)
  console.log('[Compose Video] Output resolution:', `${outputWidth}x${outputHeight}`)

  const tempPaths: string[] = []

  try {
    // Download clips
    console.log('[Compose Video] Downloading clips...')
    const localClips = await Promise.all(
      clips.map(async (clip, idx) => {
        console.log(`[Compose Video] Downloading clip ${idx}:`, clip.videoUrl)
        const videoPath = await downloadFile(clip.videoUrl)
        tempPaths.push(videoPath)
        console.log(`[Compose Video] Clip ${idx} video downloaded to:`, videoPath)

        let voicePath: string | undefined
        if (clip.voiceUrl) {
          console.log(`[Compose Video] Downloading clip ${idx} audio:`, clip.voiceUrl)
          voicePath = await downloadFile(clip.voiceUrl)
          tempPaths.push(voicePath)
          console.log(`[Compose Video] Clip ${idx} audio downloaded to:`, voicePath)
        } else {
          console.log(`[Compose Video] Clip ${idx} has no audio (voiceUrl is missing)`)
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
    console.log('[Compose Video] All clips downloaded. Local clips:', JSON.stringify(localClips.map(c => ({
      localPath: c.localPath,
      voicePath: c.voicePath,
      hasAudio: !!c.voicePath,
    })), null, 2))

    // Download background music if provided
    let backgroundMusicPath: string | undefined
    if (options.backgroundMusicUrl) {
      console.log('[Compose Video] Downloading background music:', options.backgroundMusicUrl)
      backgroundMusicPath = await downloadFile(options.backgroundMusicUrl)
      tempPaths.push(backgroundMusicPath)
      console.log('[Compose Video] Background music downloaded to:', backgroundMusicPath)
    }

    // Compose video
    console.log('[Compose Video] Starting video composition with FFmpeg...')
    await composeVideo(localClips, {
      transition: options.transition,
      musicVolume: options.musicVolume,
      outputPath,
      backgroundMusicPath,
      outputWidth,
      outputHeight,
    })
    console.log('[Compose Video] Video composition completed')

    // Check if output file exists
    try {
      const stats = await fs.stat(outputPath)
      console.log('[Compose Video] Output file exists, size:', stats.size, 'bytes')
    } catch (statError) {
      console.error('[Compose Video] Output file does not exist or cannot be read:', outputPath)
    }

    // Read composed video
    const videoBuffer = await fs.readFile(outputPath)
    console.log('[Compose Video] Video buffer read, size:', videoBuffer.length, 'bytes')
    
    const videoId = nanoid()
    const finalPath = await saveVideo(videoBuffer, `${videoId}.mp4`)
    console.log('[Compose Video] Video saved, videoId:', videoId, 'finalPath:', finalPath)

    // Calculate duration
    const duration = Math.max(...clips.map(c => c.endTime))
    console.log('[Compose Video] Calculated duration:', duration, 'seconds')

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
    console.log('[Compose Video] Video metadata saved')

    // Track cost
    await trackCost('video-composition', 0.10, {
      videoId,
      duration,
      clipsCount: clips.length,
    })

    // Cleanup temp files
    await cleanupTempFiles(tempPaths)
    console.log('[Compose Video] Temp files cleaned up')

    // Return API URL instead of file path
    const apiUrl = `/api/watch/${videoId}`
    console.log('[Compose Video] Returning response:', {
      videoUrl: apiUrl,
      videoId,
      originalPath: finalPath,
    })

    return {
      videoUrl: apiUrl,
      videoId,
    }
  } catch (error: any) {
    console.error('[Compose Video] Error occurred:', error.message)
    console.error('[Compose Video] Error stack:', error.stack)
    console.error('[Compose Video] Error details:', JSON.stringify(error, null, 2))
    
    // Cleanup on error
    await cleanupTempFiles(tempPaths)
    throw createError({
      statusCode: 500,
      message: `Video composition failed: ${error.message}`,
    })
  }
})

