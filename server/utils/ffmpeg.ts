import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { promises as fs } from 'fs'
import { saveAsset } from './storage'
import type { Clip } from './types'

export interface Clip {
  localPath: string
  voicePath?: string
  startTime: number
  endTime: number
  type: string
}

export interface CompositionOptions {
  transition: 'fade' | 'dissolve' | 'wipe' | 'none'
  musicVolume: number
  outputPath: string
  backgroundMusicPath?: string
  outputWidth?: number
  outputHeight?: number
}

export async function composeVideo(
  clips: Clip[],
  options: CompositionOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg] Starting video composition')
    console.log('[FFmpeg] Clips count:', clips.length)
    console.log('[FFmpeg] Clips with audio:', clips.filter(c => c.voicePath).length)
    console.log('[FFmpeg] Background music:', options.backgroundMusicPath || 'none')
    console.log('[FFmpeg] Options:', JSON.stringify(options, null, 2))
    
    const command = ffmpeg()

    // Add video inputs
    clips.forEach((clip, idx) => {
      console.log(`[FFmpeg] Adding input ${idx}: video=${clip.localPath}, audio=${clip.voicePath || 'none'}`)
      command.input(clip.localPath)
      if (clip.voicePath) {
        command.input(clip.voicePath)
      }
    })

    // Add background music if provided
    if (options.backgroundMusicPath) {
      console.log(`[FFmpeg] Adding background music: ${options.backgroundMusicPath}`)
      command.input(options.backgroundMusicPath)
    }

    // Build filter complex
    const filterComplex = buildFilterComplex(clips, options)
    console.log('[FFmpeg] Filter complex:', filterComplex)
    command.complexFilter(filterComplex)

    // Note: Output resolution is already set in the complex filter via scale and pad operations
    // Do not use command.size() here as it conflicts with complexFilter

    // Output settings
    command
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
        '-map [outv]',
        '-map [outa]',
      ])
      .output(options.outputPath)
      .on('start', (commandLine) => {
        console.log('[FFmpeg] Command started:', commandLine)
      })
      .on('progress', (progress) => {
        console.log('[FFmpeg] Progress:', JSON.stringify(progress, null, 2))
      })
      .on('end', () => {
        console.log('[FFmpeg] Composition completed successfully')
        resolve(options.outputPath)
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg] Error occurred:', err.message)
        console.error('[FFmpeg] Stdout:', stdout)
        console.error('[FFmpeg] Stderr:', stderr)
        reject(err)
      })
      .run()
  })
}

function buildFilterComplex(clips: Clip[], options: CompositionOptions): string[] {
  const filters: string[] = []
  
  // Calculate total video duration from clips
  const totalDuration = Math.max(...clips.map(c => c.endTime), 0)
  console.log('[FFmpeg] Total video duration calculated:', totalDuration, 'seconds')
  
  // Output resolution (default to 1080×1920 for 9:16)
  const outputWidth = options.outputWidth || 1080
  const outputHeight = options.outputHeight || 1920
  
  // Scale and pad all video inputs to output resolution
  clips.forEach((clip, idx) => {
    filters.push(
      `[${idx}:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${idx}]`
    )
  })

  // Add transitions
  if (options.transition === 'fade') {
    clips.forEach((clip, idx) => {
      if (idx > 0) {
        filters.push(`[v${idx}]fade=t=in:st=0:d=0.5[v${idx}f]`)
      } else {
        filters.push(`[v${idx}]copy[v${idx}f]`)
      }
    })
  } else {
    clips.forEach((clip, idx) => {
      filters.push(`[v${idx}]copy[v${idx}f]`)
    })
  }

  // Concatenate videos
  const videoInputs = clips.map((_, idx) => `[v${idx}f]`).join('')
  filters.push(`${videoInputs}concat=n=${clips.length}:v=1:a=0[outv]`)

  // Audio mixing
  // Calculate audio input indices:
  // - Video inputs: 0, 1, 2, 3 (4 clips) - each video may have embedded audio at [idx:a]
  // - Voiceover audio: separate inputs after video inputs (if voicePath exists)
  // - Background music: last input (if provided)
  const audioInputs: string[] = []
  let audioInputIndex = clips.length // Start after video inputs
  
  // Add audio from clips - prefer separate voiceover, fallback to embedded video audio
  clips.forEach((clip, idx) => {
    if (clip.voicePath) {
      // Use separate voiceover audio file
      const volume = 1.0 // Full volume for voiceover
      console.log(`[FFmpeg] Adding voiceover audio from clip ${idx}, audio index ${audioInputIndex}, volume ${volume}`)
      filters.push(`[${audioInputIndex}:a]volume=${volume}[vo${idx}]`)
      audioInputs.push(`[vo${idx}]`)
      audioInputIndex++
    } else {
      // Extract audio from embedded video stream
      console.log(`[FFmpeg] Using embedded audio from video ${idx}`)
      filters.push(`[${idx}:a]volume=1.0[vo${idx}]`)
      audioInputs.push(`[vo${idx}]`)
    }
  })

  // Add background music if provided
  if (options.backgroundMusicPath) {
    const musicVolume = options.musicVolume / 100 // Convert percentage to decimal (0.0-1.0)
    console.log(`[FFmpeg] Adding background music, audio index ${audioInputIndex}, volume ${musicVolume}, duration: ${totalDuration}s`)
    // Loop and trim background music to match video duration
    if (totalDuration > 0) {
      filters.push(`[${audioInputIndex}:a]volume=${musicVolume},aloop=loop=-1:size=2e+09,atrim=0:${totalDuration}[bgm]`)
    } else {
      // Fallback if duration is 0 (shouldn't happen, but safety check)
      filters.push(`[${audioInputIndex}:a]volume=${musicVolume}[bgm]`)
    }
    audioInputs.push(`[bgm]`)
  }

  if (audioInputs.length > 0) {
    console.log(`[FFmpeg] Mixing ${audioInputs.length} audio inputs (video audio/voiceover + background music)`)
    // Use duration=longest to match video duration, not infinite
    filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=2[outa]`)
  } else {
    // No audio at all - create silent track with duration matching video
    console.log('[FFmpeg] No audio inputs found, creating silent track with duration:', totalDuration)
    if (totalDuration > 0) {
      filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000:duration=${totalDuration}[outa]`)
    } else {
      // Fallback: estimate from clip count (each clip is typically ~4 seconds)
      const estimatedDuration = clips.length * 4
      console.log('[FFmpeg] Using estimated duration:', estimatedDuration)
      filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000:duration=${estimatedDuration}[outa]`)
    }
  }

  return filters
}

export async function exportToFormat(
  inputPath: string,
  outputPath: string,
  format: 'webm' | 'gif' | 'hls'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)

    switch (format) {
      case 'webm':
        command
          .outputOptions(['-c:v libvpx-vp9', '-c:a libopus'])
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run()
        break

      case 'gif':
        command
          .outputOptions(['-vf', 'fps=10,scale=320:-1:flags=lanczos'])
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run()
        break

      case 'hls':
        command
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            '-hls_time 10',
            '-hls_playlist_type vod',
            '-hls_segment_filename',
            path.join(path.dirname(outputPath), 'segment_%03d.ts'),
          ])
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run()
        break

      default:
        reject(new Error(`Unsupported format: ${format}`))
    }
  })
}

/**
 * Extracts the very last frame from a video
 * @param videoPath - Path to the video file
 * @param duration - Duration of the video in seconds
 * @returns Array with single frame file path (the last frame at the end of the video)
 */
export async function extractFramesFromVideo(
  videoPath: string,
  duration: number
): Promise<string[]> {
  // Extract only the very last frame at the end of the video
  const timestamp = duration
  
  console.log(`[FFmpeg] Extracting last frame from video: ${videoPath}`)
  console.log(`[FFmpeg] Video duration: ${duration}s`)
  console.log(`[FFmpeg] Extracting frame at timestamp: ${timestamp}s (end of video)`)
  
  const framePath = await new Promise<string>((resolve, reject) => {
    // Create a temporary frame file path
    const tempFramePath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'assets',
      `frame_${Date.now()}_last.jpg`
    )
    
    // Ensure directory exists
    fs.mkdir(path.dirname(tempFramePath), { recursive: true })
      .then(() => {
        const command = ffmpeg(videoPath)
          .seekInput(timestamp)
          .outputOptions([
            '-vframes', '1',        // Extract only 1 frame
            '-q:v', '2',           // High quality JPEG
            '-f', 'image2',        // Output format
          ])
          .output(tempFramePath)
          .on('start', (commandLine) => {
            console.log(`[FFmpeg] Extracting last frame at ${timestamp}s:`, commandLine)
          })
          .on('end', async () => {
            try {
              // Read the frame file and save it properly
              const frameBuffer = await fs.readFile(tempFramePath)
              const savedPath = await saveAsset(frameBuffer, 'jpg')
              // Clean up temp file
              await fs.unlink(tempFramePath).catch(() => {})
              console.log(`[FFmpeg] Last frame saved to: ${savedPath}`)
              resolve(savedPath)
            } catch (error: any) {
              reject(new Error(`Failed to save last frame: ${error.message}`))
            }
          })
          .on('error', (err, stdout, stderr) => {
            console.error(`[FFmpeg] Error extracting last frame:`, err.message)
            console.error(`[FFmpeg] Stdout:`, stdout)
            console.error(`[FFmpeg] Stderr:`, stderr)
            reject(new Error(`Failed to extract last frame at ${timestamp}s: ${err.message}`))
          })
          .run()
      })
      .catch(reject)
  })
  
  console.log(`[FFmpeg] Successfully extracted last frame`)
  return [framePath]
}

/**
 * Get video duration in seconds
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      const duration = metadata.format.duration || 0
      resolve(duration)
    })
  })
}

