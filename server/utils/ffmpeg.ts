import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
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
}

export async function composeVideo(
  clips: Clip[],
  options: CompositionOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()

    // Add video inputs
    clips.forEach((clip) => {
      command.input(clip.localPath)
      if (clip.voicePath) {
        command.input(clip.voicePath)
      }
    })

    // Build filter complex
    const filterComplex = buildFilterComplex(clips, options)
    command.complexFilter(filterComplex)

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
      .on('end', () => resolve(options.outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

function buildFilterComplex(clips: Clip[], options: CompositionOptions): string[] {
  const filters: string[] = []
  
  // Scale and pad all video inputs
  clips.forEach((clip, idx) => {
    filters.push(
      `[${idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${idx}]`
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
  const audioInputs: string[] = []
  clips.forEach((clip, idx) => {
    if (clip.voicePath) {
      const audioIdx = clips.length + idx
      filters.push(`[${audioIdx}:a]volume=${options.musicVolume / 100}[a${idx}]`)
      audioInputs.push(`[a${idx}]`)
    }
  })

  if (audioInputs.length > 0) {
    filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[outa]`)
  } else {
    // No audio, create silent track
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000[outa]`)
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

