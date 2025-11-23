
import { z } from 'zod'
import { createSplitScreenVideo } from '../utils/ffmpeg'
import { downloadFile, saveVideo, cleanupTempFiles } from '../utils/storage'
import path from 'path'
import { nanoid } from 'nanoid'
import { promises as fs } from 'fs'

const generateSplitScreenSchema = z.object({
  leftVideoUrl: z.string().min(1),
  rightVideoUrl: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const tempFiles: string[] = []

  try {
    const { leftVideoUrl, rightVideoUrl } = generateSplitScreenSchema.parse(body)

    console.log('[API] Generating split screen video')
    console.log('Left:', leftVideoUrl)
    console.log('Right:', rightVideoUrl)

    // 1. Download source videos locally
    const leftPath = await downloadFile(leftVideoUrl)
    tempFiles.push(leftPath)
    
    const rightPath = await downloadFile(rightVideoUrl)
    tempFiles.push(rightPath)

    // 2. Create temporary output path
    const tempOutputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'assets',
      `split_${nanoid()}.mp4`
    )
    tempFiles.push(tempOutputPath)

    // 3. Generate split screen video
    await createSplitScreenVideo(leftPath, rightPath, tempOutputPath)

    // 4. Save/Upload result
    // Read the generated file into buffer
    const fileBuffer = await fs.readFile(tempOutputPath)
    // Use saveVideo to handle storage and S3 upload
    const resultUrl = await saveVideo(fileBuffer, `split-${nanoid()}.mp4`, 'split-screen')

    return {
      url: resultUrl,
      status: 'completed'
    }

  } catch (error: any) {
    console.error('Split screen generation error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate split screen video'
    })
  } finally {
    // 5. Cleanup
    await cleanupTempFiles(tempFiles)
  }
})

