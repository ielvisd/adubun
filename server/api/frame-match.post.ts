import { composeVideo, composeVideoWithSmartStitching, getVideoDuration } from '../utils/ffmpeg'
import { saveAsset, saveVideo, cleanupTempFiles } from '../utils/storage'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'
import path from 'path'
import { promises as fs } from 'fs'
import type { Video } from '../../app/types/generation'
import type { StitchAdjustment } from '../utils/ffmpeg'

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
  console.log('[Frame Match] Starting frame matching process')
  
  const tempPaths: string[] = []

  try {
    // Parse multipart form data
    const formData = await readMultipartFormData(event)
    
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'No files uploaded',
      })
    }

    console.log('[Frame Match] Received', formData.length, 'files')

    // Extract and save uploaded clips
    const uploadedClips: { localPath: string; index: number }[] = []
    
    for (const field of formData) {
      const match = field.name?.match(/^clip(\d+)$/)
      if (match && field.data) {
        const index = parseInt(match[1])
        const filename = field.filename || `clip${index}.mp4`
        
        console.log(`[Frame Match] Processing clip ${index}: ${filename}`)
        
        // Save uploaded file
        const localPath = await saveAsset(field.data, filename)
        tempPaths.push(localPath)
        
        uploadedClips.push({ localPath, index })
        console.log(`[Frame Match] Clip ${index} saved to: ${localPath}`)
      }
    }

    // Validate we have 4 clips
    if (uploadedClips.length !== 4) {
      throw createError({
        statusCode: 400,
        message: `Expected 4 clips, received ${uploadedClips.length}`,
      })
    }

    // Sort clips by index
    uploadedClips.sort((a, b) => a.index - b.index)

    console.log('[Frame Match] All clips uploaded and sorted')

    // Get durations for each clip
    const clipDurations = await Promise.all(
      uploadedClips.map(async (clip) => {
        const duration = await getVideoDuration(clip.localPath)
        console.log(`[Frame Match] Clip ${clip.index} duration: ${duration}s`)
        return duration
      })
    )

    // Calculate cumulative times for clips
    let currentTime = 0
    const formattedClips = uploadedClips.map((clip, idx) => {
      const duration = clipDurations[idx]
      const startTime = currentTime
      const endTime = currentTime + duration
      currentTime = endTime

      return {
        localPath: clip.localPath,
        startTime,
        endTime,
        type: `clip${idx + 1}`,
      }
    })

    console.log('[Frame Match] Formatted clips:', JSON.stringify(formattedClips.map(c => ({
      type: c.type,
      startTime: c.startTime,
      endTime: c.endTime,
    })), null, 2))

    // Detect aspect ratio from first video
    console.log('[Frame Match] Detecting video dimensions from first clip...')
    const { getVideoDimensions } = await import('../utils/ffmpeg')
    const dimensions = await getVideoDimensions(formattedClips[0].localPath)
    console.log('[Frame Match] Detected dimensions:', dimensions)
    
    // Use the detected dimensions for output
    const outputWidth = dimensions.width
    const outputHeight = dimensions.height
    console.log('[Frame Match] Output resolution:', `${outputWidth}x${outputHeight}`)

    // Generate output paths
    const originalOutputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'videos',
      `${nanoid()}_original.mp4`
    )
    const smartOutputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'videos',
      `${nanoid()}_smart.mp4`
    )

    // Ensure output directory exists
    await fs.mkdir(path.dirname(originalOutputPath), { recursive: true })

    // Compose both versions in parallel
    console.log('[Frame Match] Starting parallel composition')
    const [_, smartResult] = await Promise.all([
      // Original composition
      composeVideo(formattedClips, {
        transition: 'none',
        musicVolume: 0,
        outputPath: originalOutputPath,
        outputWidth,
        outputHeight,
      }),
      // Smart composition with frame matching
      composeVideoWithSmartStitching(formattedClips, {
        transition: 'none',
        musicVolume: 0,
        outputPath: smartOutputPath,
        outputWidth,
        outputHeight,
      }),
    ])

    console.log('[Frame Match] Both compositions completed')
    console.log('[Frame Match] Smart stitching adjustments:', JSON.stringify(smartResult.adjustments, null, 2))

    // Read and save original video
    const originalVideoBuffer = await fs.readFile(originalOutputPath)
    const originalVideoId = nanoid()
    const originalFinalPath = await saveVideo(originalVideoBuffer, `${originalVideoId}_original.mp4`)
    console.log('[Frame Match] Original video saved:', originalFinalPath)

    // Read and save smart video
    const smartVideoBuffer = await fs.readFile(smartOutputPath)
    const smartVideoId = nanoid()
    const smartFinalPath = await saveVideo(smartVideoBuffer, `${smartVideoId}_smart.mp4`)
    console.log('[Frame Match] Smart video saved:', smartFinalPath)

    // Calculate total duration
    const totalDuration = formattedClips[formattedClips.length - 1].endTime

    // Save metadata for both videos
    const originalVideo: Video = {
      id: originalVideoId,
      url: originalFinalPath,
      duration: totalDuration,
      resolution: '1920x1080',
      aspectRatio: '16:9',
      generationCost: 0,
      createdAt: Date.now(),
      storyboardId: '',
      jobId: '',
    }
    await saveVideoMetadata(originalVideo)

    const smartVideo: Video = {
      id: smartVideoId,
      url: smartFinalPath,
      duration: totalDuration,
      resolution: '1920x1080',
      aspectRatio: '16:9',
      generationCost: 0,
      createdAt: Date.now(),
      storyboardId: '',
      jobId: '',
    }
    await saveVideoMetadata(smartVideo)

    // Track cost
    await trackCost('frame-matching', 0.20, {
      originalVideoId,
      smartVideoId,
      clipsCount: 4,
      adjustmentsCount: smartResult.adjustments.length,
    })

    // Cleanup temp files
    await cleanupTempFiles(tempPaths)
    // Also cleanup output files
    await fs.unlink(originalOutputPath).catch(() => {})
    await fs.unlink(smartOutputPath).catch(() => {})
    
    console.log('[Frame Match] Cleanup completed')

    // Return API URLs
    return {
      originalVideoUrl: `/api/watch/${originalVideoId}`,
      smartVideoUrl: `/api/watch/${smartVideoId}`,
      originalVideoId,
      smartVideoId,
      adjustments: smartResult.adjustments,
    }
  } catch (error: any) {
    console.error('[Frame Match] Error occurred:', error.message)
    console.error('[Frame Match] Error stack:', error.stack)
    
    // Cleanup on error
    await cleanupTempFiles(tempPaths)
    
    throw createError({
      statusCode: 500,
      message: `Frame matching failed: ${error.message}`,
    })
  }
})

