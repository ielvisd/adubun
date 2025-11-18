import { readMultipartFormData } from 'h3'
import { cleanupTempFiles, saveAsset } from '../../utils/storage'
import { composeVideo } from '../../utils/ffmpeg'
import { nanoid } from 'nanoid'
import path from 'path'
import { promises as fs } from 'fs'
import ffmpeg from 'fluent-ffmpeg'

interface EditorClipPayload {
  videoUrl?: string
  fileField?: string
  trimStart: number
  trimEnd: number
  transitionBefore?: 'cut' | 'crossfade'
  transitionAfter?: 'cut' | 'crossfade'
  muted?: boolean
}

export default defineEventHandler(async (event) => {
  try {
    console.log('[Editor Export] Starting export...')
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({
        statusCode: 400,
        message: 'No data provided',
      })
    }

    console.log('[Editor Export] Form data fields:', formData.map(f => ({ name: f.name, hasData: !!f.data, filename: f.filename })))

    // Parse clips
    const clipsField = formData.find(f => f.name === 'clips')
    if (!clipsField || !clipsField.data) {
      throw createError({
        statusCode: 400,
        message: 'No clips data provided',
      })
    }

    const clips: EditorClipPayload[] = JSON.parse(clipsField.data.toString())
    console.log('[Editor Export] Parsed clips:', clips)
    
    if (!Array.isArray(clips) || clips.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Invalid clips data',
      })
    }

    // Get aspect ratio
    const aspectRatioField = formData.find(f => f.name === 'aspectRatio')
    const aspectRatio = aspectRatioField?.data?.toString() || '16:9'
    console.log('[Editor Export] Aspect ratio:', aspectRatio)

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

      // Process clips (all must be uploaded files - editor is fully local)
      const localClips = await Promise.all(
        clips.map(async (clip, idx) => {
          console.log(`[Editor Export] Processing clip ${idx}:`, { 
            hasFileField: !!clip.fileField, 
            videoUrl: clip.videoUrl,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd
          })
          
          let videoPath: string
          
          if (clip.fileField) {
            const fileField = fileFieldMap.get(clip.fileField)
            if (!fileField || !fileField.data) {
              throw new Error(`Missing video data for ${clip.fileField}`)
            }
            console.log(`[Editor Export] Using uploaded file for clip ${idx}`)
            const extension = getFileExtension(fileField.filename) || 'mp4'
            videoPath = await saveAsset(Buffer.from(fileField.data), extension)
          } else {
            // Editor is fully local - all clips must have file data
            throw new Error(`Clip ${idx} missing file data. Editor requires all videos to be uploaded as files.`)
          }
          
          console.log(`[Editor Export] Clip ${idx} saved to: ${videoPath}`)
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

      // Calculate output dimensions based on aspect ratio
      let outputWidth: number
      let outputHeight: number
      if (aspectRatio === '16:9') {
        outputWidth = 1920
        outputHeight = 1080
      } else {
        outputWidth = 1080
        outputHeight = 1920
      }
      console.log(`[Editor Export] Output resolution: ${outputWidth}x${outputHeight}`)

      // Compose video
      await composeVideo(localClips, {
        transition: 'fade',
        musicVolume: volume,
        outputPath,
        outputWidth,
        outputHeight,
      })

      // Add background music if provided
      if (audioField && audioField.data) {
        await addBackgroundMusic(outputPath, audioField.data, volume)
      }

      console.log('[Editor Export] Video composed successfully:', outputPath)

      // Read the composed video into memory
      const videoBuffer = await fs.readFile(outputPath)
      
      // Cleanup all temp files immediately (no server storage)
      await cleanupTempFiles(tempPaths)
      await fs.unlink(outputPath).catch(() => {})

      console.log('[Editor Export] Video ready for download, no server storage used')

      // Return video as binary data for immediate download
      // Set headers for download
      setHeader(event, 'Content-Type', 'video/mp4')
      setHeader(event, 'Content-Disposition', `attachment; filename="adubun-export-${Date.now()}.mp4"`)
      setHeader(event, 'Content-Length', videoBuffer.length.toString())
      
      return videoBuffer
    } catch (error: any) {
      await cleanupTempFiles(tempPaths)
      throw error
    }
  } catch (error: any) {
    console.error('[Editor Export] Error:', error)
    console.error('[Editor Export] Error stack:', error.stack)
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
    console.log(`[Trim] Trimming video from ${startTime}s to ${endTime}s (duration: ${endTime - startTime}s)`)
    
    ffmpeg(videoPath)
      .inputOptions([
        '-accurate_seek',  // Enable accurate seeking to prevent black frames
      ])
      .seekInput(startTime)
      .duration(endTime - startTime)
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-preset fast',
        '-crf 18', // High quality to prevent artifacts
        '-g 30', // GOP size - keyframe every 30 frames (1s at 30fps)
        '-keyint_min 30', // Minimum GOP size
        '-sc_threshold 0', // Disable scene change detection for consistent GOPs
        '-force_key_frames expr:gte(t,0)', // Force keyframe at start (t=0) to ensure first frame is valid
        '-movflags +faststart', // Enable fast start for web playback
        '-avoid_negative_ts make_zero', // Ensure timestamps start at 0
        '-fflags +genpts', // Generate presentation timestamps for smooth playback
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('[Trim] FFmpeg command:', cmd)
      })
      .on('end', () => {
        console.log('[Trim] Trimming complete:', outputPath)
        resolve(outputPath)
      })
      .on('error', (err) => {
        console.error('[Trim] Error:', err)
        reject(err)
      })
      .run()
  })
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

