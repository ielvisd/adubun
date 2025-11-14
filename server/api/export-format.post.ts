import { exportFormatSchema } from '../utils/validation'
import { exportToFormat } from '../utils/ffmpeg'
import { downloadFile, saveAsset } from '../utils/storage'
import { nanoid } from 'nanoid'
import path from 'path'

export default defineEventHandler(async (event) => {
  const { videoUrl, format } = exportFormatSchema.parse(await readBody(event))

  try {
    // Download video
    const inputPath = await downloadFile(videoUrl)

    // Determine output extension
    const extensions: Record<string, string> = {
      webm: 'webm',
      gif: 'gif',
      hls: 'm3u8',
    }

    const outputPath = path.join(
      process.env.MCP_FILESYSTEM_ROOT || './data',
      'videos',
      `${nanoid()}.${extensions[format]}`
    )

    // Export to format
    await exportToFormat(inputPath, outputPath, format)

    return {
      url: outputPath,
      format,
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: `Export failed: ${error.message}`,
    })
  }
})

