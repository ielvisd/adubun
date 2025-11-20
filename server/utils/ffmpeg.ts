import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { promises as fs } from 'fs'
import { saveAsset } from './storage'
import type { Clip } from './types'

export interface CompositionOptions {
  transition: 'fade' | 'dissolve' | 'wipe' | 'none'
  musicVolume: number
  outputPath: string
  backgroundMusicPath?: string
  outputWidth?: number
  outputHeight?: number
}

// Helper function to check if a video has an audio stream
async function hasAudioStream(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.log(`[FFmpeg] Could not probe ${videoPath}, assuming no audio`)
        resolve(false)
        return
      }
      const hasAudio = metadata.streams.some(s => s.codec_type === 'audio')
      resolve(hasAudio)
    })
  })
}

export async function composeVideo(
  clips: Clip[],
  options: CompositionOptions
): Promise<string> {
  // Detect which clips have audio streams before processing
  console.log('[FFmpeg] Detecting audio streams in clips...')
  const audioCheckPromises = clips.map((clip, idx) => 
    hasAudioStream(clip.localPath).then(hasAudio => ({ idx, hasAudio }))
  )
  const audioChecks = await Promise.all(audioCheckPromises)
  const clipsWithAudio = audioChecks.filter(c => c.hasAudio).map(c => c.idx)
  
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg] Starting video composition')
    console.log('[FFmpeg] Clips count:', clips.length)
    console.log('[FFmpeg] Clips with voiceover:', clips.filter(c => c.voicePath).length)
    console.log('[FFmpeg] Clips with embedded audio:', clipsWithAudio)
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
    const filterComplex = buildFilterComplex(clips, options, clipsWithAudio)
    console.log('[FFmpeg] Filter complex:', filterComplex)
    command.complexFilter(filterComplex)

    // Note: Output resolution is already set in the complex filter via scale and pad operations
    // Do not use command.size() here as it conflicts with complexFilter

    // Output settings
    command
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 18', // Higher quality to prevent artifacts
        '-profile:v high', // High profile for better quality
        '-level 4.1', // Compatibility level
        '-pix_fmt yuv420p', // Ensure consistent pixel format
        '-g 30', // GOP size - keyframe every 1 second at 30fps
        '-keyint_min 30', // Minimum GOP size
        '-sc_threshold 0', // Disable scene change detection
        '-force_key_frames expr:gte(t,n_forced*1)', // Force keyframe every 1 second
        '-c:a aac',
        '-b:a 192k',
        '-ar 48000', // Audio sample rate
        '-movflags +faststart', // Enable fast start for web playback
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

function buildFilterComplex(clips: Clip[], options: CompositionOptions, clipsWithAudio: number[]): string[] {
  const filters: string[] = []
  
  // Calculate total video duration from clips
  const totalDuration = Math.max(...clips.map(c => c.endTime), 0)
  console.log('[FFmpeg] Total video duration calculated:', totalDuration, 'seconds')
  
  // Output resolution (default to 1080×1920 for 9:16)
  const outputWidth = options.outputWidth || 1080
  const outputHeight = options.outputHeight || 1920
  
  // Scale, trim, and pad all video inputs to output resolution
  clips.forEach((clip, idx) => {
    const duration = clip.endTime - clip.startTime
    // For trim filter, we need source video timestamps (0-based for each file)
    // Not timeline positions. So we trim from 0 to the duration we want.
    // Add format filter to ensure consistent pixel format and prevent black frames
    filters.push(
      `[${idx}:v]trim=duration=${duration},setpts=PTS-STARTPTS,format=yuv420p,scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${idx}]`
    )
  })

  // No transitions - direct copy for all clips (zero effects)
    clips.forEach((clip, idx) => {
      filters.push(`[v${idx}]copy[v${idx}f]`)
    })

  // Concatenate videos
  const videoInputs = clips.map((_, idx) => `[v${idx}f]`).join('')
  filters.push(`${videoInputs}concat=n=${clips.length}:v=1:a=0[outv]`)

  // Audio mixing
  // Calculate audio input indices:
  // - Video inputs: 0, 1, 2, 3 (4 clips) - may contain embedded audio
  // - Speech audio: separate inputs after video inputs (if voicePath exists, for legacy support)
  // - Background music: last input (if provided)
  const audioInputs: string[] = []
  let audioInputIndex = clips.length // Start after video inputs
  
  // Add audio from clips - prioritize embedded audio from videos, fallback to separate voicePath
  clips.forEach((clip, idx) => {
    const duration = clip.endTime - clip.startTime
    const segmentStartTime = clip.startTime
    const volume = 1.0 // Full volume for speech
    
    // Check if video has embedded audio
    if (clipsWithAudio.includes(idx)) {
      // Use embedded audio from video
      console.log(`[FFmpeg] Adding embedded audio from clip ${idx} video, volume ${volume}, start time ${segmentStartTime}s`)
      
      // Extract audio from video input (video inputs are at index idx)
      // Trim to segment duration starting from 0 to match video trim, and delay to match segment start time
      filters.push(`[${idx}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${segmentStartTime * 1000}|${segmentStartTime * 1000}[vo${idx}]`)
      audioInputs.push(`[vo${idx}]`)
    } else if (clip.voicePath) {
      // Fallback: Use separate speech audio file (legacy support)
      // Check for timing hints in clip metadata
      const timingHints = (clip as any).timingHints as Array<{ startTime: number; endTime: number; text: string }> | undefined
      
      if (timingHints && timingHints.length > 0) {
        // Apply timing hints - create multiple audio segments with proper timing
        console.log(`[FFmpeg] Adding speech audio from clip ${idx} with ${timingHints.length} timing hints`)
        
        // For each timing hint, create a trimmed and positioned audio segment
        timingHints.forEach((hint, hintIdx) => {
          const hintDuration = hint.endTime - hint.startTime
          const filterLabel = `vo${idx}_${hintIdx}`
          
          // Trim audio to match hint duration starting from 0, and position it at the correct time
          filters.push(`[${audioInputIndex}:a]atrim=0:${hintDuration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${hint.startTime * 1000}|${hint.startTime * 1000}[${filterLabel}]`)
          audioInputs.push(`[${filterLabel}]`)
        })
      } else {
        // No timing hints - use full duration, positioned at segment start
        console.log(`[FFmpeg] Adding speech audio from clip ${idx}, audio index ${audioInputIndex}, volume ${volume}, start time ${segmentStartTime}s`)
        
        // Trim to segment duration starting from 0 to match video trim, and delay to match segment start time
        filters.push(`[${audioInputIndex}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${segmentStartTime * 1000}|${segmentStartTime * 1000}[vo${idx}]`)
        audioInputs.push(`[vo${idx}]`)
      }
      
      audioInputIndex++
    } else {
      console.log(`[FFmpeg] Clip ${idx} has no audio track (embedded or separate), skipping`)
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

/**
 * Get video dimensions (width and height)
 * @param videoPath - Path to the video file
 * @returns Object with width and height
 */
export async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video')
      if (!videoStream) {
        reject(new Error('No video stream found'))
        return
      }
      resolve({
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
      })
    })
  })
}

/**
 * Extract a single frame at specific timestamp
 * @param videoPath - Path to the video file
 * @param timestamp - Timestamp in seconds
 * @param index - Frame index for naming
 * @returns Path to extracted frame
 */
async function extractSingleFrame(
  videoPath: string,
  timestamp: number,
  index: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempFramePath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'assets',
      `frame_${Date.now()}_${index}.jpg`
    )
    
    fs.mkdir(path.dirname(tempFramePath), { recursive: true })
      .then(() => {
        ffmpeg(videoPath)
          .seekInput(timestamp)
          .outputOptions([
            '-vframes', '1',
            '-q:v', '2',
            '-f', 'image2',
          ])
          .output(tempFramePath)
          .on('end', () => {
            console.log(`[FFmpeg] Extracted frame ${index} at ${timestamp}s`)
            resolve(tempFramePath)
          })
          .on('error', (err) => {
            console.error(`[FFmpeg] Error extracting frame ${index}:`, err.message)
            reject(err)
          })
          .run()
      })
      .catch(reject)
  })
}

/**
 * Compare two frames using SSIM (Structural Similarity Index)
 * Returns similarity score 0-1 (1 = identical)
 * Falls back to pixel difference if SSIM fails
 */
async function compareFrames(
  frame1Path: string,
  frame2Path: string
): Promise<number> {
  console.log(`[FFmpeg] Comparing frames: ${path.basename(frame1Path)} vs ${path.basename(frame2Path)}`)
  
  return new Promise((resolve) => {
    let ssimOutput = ''
    
    // Try SSIM first - capture output from stderr
    const command = ffmpeg()
      .input(frame1Path)
      .input(frame2Path)
      .complexFilter([
        '[0:v][1:v]scale2ref[main][ref]',
        '[main][ref]ssim'  // Remove stats_file, capture from stderr
      ])
      .outputOptions(['-f', 'null'])
      .output('-')
      .on('stderr', (stderrLine) => {
        ssimOutput += stderrLine + '\n'
      })
      .on('end', async () => {
        try {
          console.log(`[FFmpeg] SSIM raw output (first 300 chars):`, ssimOutput.substring(0, 300))
          
          // Parse SSIM score from output
          // Look for patterns like: All:0.96 or SSIM All:0.96
          const patterns = [
            /All:([0-9.]+)/,
            /SSIM.*?All:([0-9.]+)/i,
            /ssim_avg:([0-9.]+)/i
          ]
          
          let similarity = null
          for (const pattern of patterns) {
            const match = ssimOutput.match(pattern)
            if (match) {
              similarity = parseFloat(match[1])
              console.log(`[FFmpeg] ✓ SSIM similarity found: ${similarity}`)
              break
            }
          }
          
          if (similarity !== null && !isNaN(similarity)) {
            resolve(similarity)
          } else {
            console.warn('[FFmpeg] ✗ Could not parse SSIM score from output, falling back to pixel difference')
            resolve(await compareFramesPixelDiff(frame1Path, frame2Path))
          }
        } catch (error: any) {
          console.warn('[FFmpeg] SSIM parsing failed, falling back to pixel difference:', error.message)
          resolve(await compareFramesPixelDiff(frame1Path, frame2Path))
        }
      })
      .on('error', async (err, stdout, stderr) => {
        console.warn('[FFmpeg] SSIM error:', err.message)
        if (stderr) {
          console.warn('[FFmpeg] SSIM stderr (first 300 chars):', stderr.substring(0, 300))
        }
        try {
          resolve(await compareFramesPixelDiff(frame1Path, frame2Path))
        } catch (fallbackError: any) {
          console.error('[FFmpeg] Both SSIM and fallback failed:', fallbackError.message)
          resolve(0.0)  // Return 0 instead of rejecting
        }
      })
    
    command.run()
  })
}

/**
 * Fallback: Compare frames using simple pixel difference
 */
async function compareFramesPixelDiff(
  frame1Path: string,
  frame2Path: string
): Promise<number> {
  console.log(`[FFmpeg] Using PSNR fallback for comparison`)
  
  return new Promise((resolve) => {
    let psnrOutput = ''
    
    ffmpeg()
      .input(frame1Path)
      .input(frame2Path)
      .complexFilter([
        '[0:v][1:v]scale2ref[main][ref]',
        '[main][ref]psnr'  // Remove stats_file, capture from stderr
      ])
      .outputOptions(['-f', 'null'])
      .output('-')
      .on('stderr', (stderrLine) => {
        psnrOutput += stderrLine + '\n'
      })
      .on('end', async () => {
        try {
          console.log(`[FFmpeg] PSNR raw output (first 300 chars):`, psnrOutput.substring(0, 300))
          
          // Parse PSNR score
          const patterns = [
            /psnr_avg:([0-9.]+)/i,
            /PSNR.*?average:([0-9.]+)/i,
            /average:([0-9.]+)/i,
            /psnr.*?y:([0-9.]+)/i
          ]
          
          let psnr = null
          for (const pattern of patterns) {
            const match = psnrOutput.match(pattern)
            if (match) {
              psnr = parseFloat(match[1])
              console.log(`[FFmpeg] ✓ PSNR value found: ${psnr} dB`)
              break
            }
          }
          
          if (psnr !== null && !isNaN(psnr)) {
            // Convert PSNR to similarity: normalize 20-50 dB range to 0-1
            const similarity = Math.min(Math.max((psnr - 20) / 30, 0), 1)
            console.log(`[FFmpeg] ✓ PSNR similarity: ${similarity} (${psnr} dB)`)
            resolve(similarity)
          } else {
            console.error('[FFmpeg] ✗ Could not parse PSNR score from output')
            resolve(0.0)  // Return 0 instead of default 0.5
          }
        } catch (error: any) {
          console.error('[FFmpeg] PSNR parsing failed:', error.message)
          resolve(0.0)
        }
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg] PSNR error:', err.message)
        if (stderr) {
          console.error('[FFmpeg] PSNR stderr (first 300 chars):', stderr.substring(0, 300))
        }
        resolve(0.0)
      })
      .run()
  })
}

/**
 * Find best stitch point by comparing last 30 frames of video to first frame of next clip
 * Always returns the best match found, even if similarity is low
 */
export async function findBestStitchPoint(
  videoPath: string,
  videoDuration: number,
  targetFramePath: string,
  numFramesToAnalyze: number = 30
): Promise<{ timestamp: number; similarity: number; frameIndex: number }> {
  console.log(`[FFmpeg] Finding best stitch point in last ${numFramesToAnalyze} frames of video`)
  console.log(`[FFmpeg] Video duration: ${videoDuration}s`)
  
  const fps = 30
  const searchWindowSeconds = numFramesToAnalyze / fps
  const startTime = Math.max(0, videoDuration - searchWindowSeconds)
  
  // Calculate safe end time (0.1s before actual end to avoid FFmpeg extraction errors)
  const safeEndTime = Math.max(startTime, videoDuration - 0.1)
  
  console.log(`[FFmpeg] Analyzing last ${numFramesToAnalyze} frames (${searchWindowSeconds.toFixed(2)}s) from ${startTime.toFixed(3)}s to ${safeEndTime.toFixed(3)}s`)
  
  let bestMatch = {
    timestamp: safeEndTime,
    similarity: 0,
    frameIndex: 0
  }
  
  const extractedFrames: string[] = []
  
  try {
    // Extract exactly numFramesToAnalyze frames from the end
    for (let i = 0; i < numFramesToAnalyze; i++) {
      const timestamp = startTime + (i / fps)
      
      // Stop if we're too close to the end (within 0.1s)
      if (timestamp >= safeEndTime) {
        console.log(`[FFmpeg] Stopping at frame ${i} (${timestamp.toFixed(3)}s too close to end)`)
        break
      }
      
      const framePath = await extractSingleFrame(videoPath, timestamp, i)
      extractedFrames.push(framePath)
      
      // Compare with target frame (first frame of next clip)
      const similarity = await compareFrames(framePath, targetFramePath)
      
      console.log(`[FFmpeg] Frame ${i + 1}/${numFramesToAnalyze} at ${timestamp.toFixed(3)}s: similarity ${similarity.toFixed(4)}`)
      
      if (similarity > bestMatch.similarity) {
        bestMatch = {
          timestamp,
          similarity,
          frameIndex: i
        }
      }
    }
    
    console.log(`[FFmpeg] ✓ Best match found: frame ${bestMatch.frameIndex + 1} at ${bestMatch.timestamp.toFixed(3)}s with similarity ${bestMatch.similarity.toFixed(4)}`)
    
    return bestMatch
  } finally {
    // Clean up extracted frames
    for (const framePath of extractedFrames) {
      await fs.unlink(framePath).catch(() => {})
    }
  }
}

export interface StitchAdjustment {
  clipIndex: number
  originalEndTime: number
  adjustedEndTime: number
  trimmedSeconds: number
  similarity: number
  transitionName: string
}

/**
 * Compose video with smart stitching - analyzes frame matches to find optimal stitch points
 * Analyzes last 30 frames of each clip and always applies the best match found
 * Returns both the output path and adjustment metadata
 */
export async function composeVideoWithSmartStitching(
  clips: Clip[],
  options: CompositionOptions
): Promise<{ outputPath: string; adjustments: StitchAdjustment[] }> {
  console.log('[FFmpeg] ========================================')
  console.log('[FFmpeg] Starting SMART VIDEO COMPOSITION')
  console.log('[FFmpeg] Analyzing', clips.length, 'clips for optimal stitch points')
  console.log('[FFmpeg] Will analyze last 30 frames of each clip')
  console.log('[FFmpeg] ========================================')
  
  const adjustments: StitchAdjustment[] = []
  const adjustedClips: Clip[] = []
  
  // Process each clip transition
  for (let i = 0; i < clips.length; i++) {
    const currentClip = clips[i]
    const nextClip = clips[i + 1]
    
    let adjustedClip = { ...currentClip }
    
    if (nextClip) {
      // Get transition name for logging
      const transitionName = `${currentClip.type} → ${nextClip.type}`
      
      console.log(`\n[FFmpeg] ----------------------------------------`)
      console.log(`[FFmpeg] Analyzing transition: ${transitionName}`)
      console.log(`[FFmpeg] ----------------------------------------`)
      
      try {
        // Get duration of current clip
        const currentDuration = await getVideoDuration(currentClip.localPath)
        console.log(`[FFmpeg] Current clip duration: ${currentDuration.toFixed(3)}s`)
        
        // Extract first frame of next clip (at t=0)
        console.log(`[FFmpeg] Extracting first frame of next clip...`)
        const nextClipFirstFrame = await extractSingleFrame(nextClip.localPath, 0, 0)
        
        // Find best stitch point in last 30 frames of current clip
        console.log(`[FFmpeg] Analyzing last 30 frames of current clip...`)
        const bestMatch = await findBestStitchPoint(
          currentClip.localPath,
          currentDuration,
          nextClipFirstFrame,
          30  // Analyze exactly 30 frames
        )
        
        // Clean up extracted frame
        await fs.unlink(nextClipFirstFrame).catch(() => {})
        
        // Always apply the best match found (no threshold)
        const trimmedSeconds = currentDuration - bestMatch.timestamp
        
        console.log(`[FFmpeg] ${transitionName}: Applying best match at ${bestMatch.timestamp.toFixed(3)}s`)
        console.log(`[FFmpeg] ${transitionName}: Similarity score: ${bestMatch.similarity.toFixed(4)}`)
        console.log(`[FFmpeg] ${transitionName}: Trimming ${trimmedSeconds.toFixed(3)}s from end`)
        
        // Adjust clip end time
        const clipDuration = currentClip.endTime - currentClip.startTime
        const adjustmentRatio = bestMatch.timestamp / currentDuration
        const newEndTime = currentClip.startTime + (clipDuration * adjustmentRatio)
        
        adjustedClip = {
          ...currentClip,
          endTime: newEndTime
        }
        
        adjustments.push({
          clipIndex: i,
          originalEndTime: currentClip.endTime,
          adjustedEndTime: newEndTime,
          trimmedSeconds,
          similarity: bestMatch.similarity,
          transitionName
        })
        
        console.log(`[FFmpeg] ${transitionName}: ✓ Adjustment applied successfully`)
      } catch (error: any) {
        console.error(`[FFmpeg] ${transitionName}: ✗ Error analyzing transition:`, error.message)
        console.error(`[FFmpeg] ${transitionName}: Stack trace:`, error.stack)
        console.log(`[FFmpeg] ${transitionName}: Keeping original timing due to error`)
        
        // Keep original clip timing when error occurs
        adjustedClip = { ...currentClip }
        
        adjustments.push({
          clipIndex: i,
          originalEndTime: currentClip.endTime,
          adjustedEndTime: currentClip.endTime,
          trimmedSeconds: 0,
          similarity: 0,
          transitionName
        })
      }
    }
    
    adjustedClips.push(adjustedClip)
  }
  
  // Log summary of adjustments
  console.log('\n[FFmpeg] ========================================')
  console.log('[FFmpeg] SMART STITCHING ANALYSIS COMPLETE')
  console.log('[FFmpeg] ========================================')
  adjustments.forEach(adj => {
    if (adj.trimmedSeconds > 0) {
      console.log(`  ✓ ${adj.transitionName}: Trimmed ${adj.trimmedSeconds.toFixed(3)}s (similarity: ${(adj.similarity * 100).toFixed(1)}%)`)
    } else {
      console.log(`  ✗ ${adj.transitionName}: No adjustment (error occurred)`)
    }
  })
  console.log('[FFmpeg] ========================================\n')
  
  // Compose video with adjusted clips using existing function
  console.log('[FFmpeg] Composing video with adjusted clips...')
  await composeVideo(adjustedClips, options)
  console.log('[FFmpeg] Video composition complete!')
  
  return {
    outputPath: options.outputPath,
    adjustments
  }
}

/**
 * Extract the first frame of a video
 */
export async function extractFirstFrame(videoPath: string): Promise<string> {
  return extractSingleFrame(videoPath, 0, 0)
}

/**
 * Extract all frames from the end of a video within a lookback window
 * @param videoPath - Path to the video file
 * @param duration - Duration of the video in seconds
 * @param lookbackSeconds - How many seconds from the end to extract frames from
 * @returns Array of paths to extracted frames
 */
export async function extractAllFramesFromEnd(
  videoPath: string,
  duration: number,
  lookbackSeconds: number
): Promise<string[]> {
  const fps = 30 // Assuming 30fps for now, could be dynamic
  const frameCount = Math.ceil(lookbackSeconds * fps)
  const startTime = Math.max(0, duration - lookbackSeconds)
  
  console.log(`[FFmpeg] Extracting ${frameCount} frames from last ${lookbackSeconds}s (start: ${startTime}s)`)
  
  const frames: string[] = []
  
  for (let i = 0; i < frameCount; i++) {
    const timestamp = startTime + (i / fps)
    // Avoid going past duration
    if (timestamp >= duration) break
    
    try {
      const framePath = await extractSingleFrame(videoPath, timestamp, i)
      frames.push(framePath)
    } catch (err) {
      console.warn(`[FFmpeg] Failed to extract frame at ${timestamp}s:`, err)
    }
  }
  
  return frames
}

/**
 * Trim video at a specific timestamp (keeping content before timestamp)
 */
export async function trimVideoAtTimestamp(
  videoPath: string,
  timestamp: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempOutputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'assets',
      `trimmed_${Date.now()}_${path.basename(videoPath)}`
    )
    
    ffmpeg(videoPath)
      .setDuration(timestamp)
      .output(tempOutputPath)
      .on('end', () => {
        console.log(`[FFmpeg] Trimmed video at ${timestamp}s`)
        resolve(tempOutputPath)
      })
      .on('error', (err) => {
        console.error(`[FFmpeg] Error trimming video:`, err.message)
        reject(err)
      })
      .run()
  })
}
