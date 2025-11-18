import { callReplicateMCP } from '../../utils/mcp-client'
import { trackCost } from '../../utils/cost-tracker'
import { saveAsset, downloadFile } from '../../utils/storage'
import { uploadFileToReplicate } from '../../utils/replicate-upload'
import path from 'path'
import { promises as fs } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  try {
    console.log('[AI Edit] Received request')
    
    const formData = await readMultipartFormData(event)
    
    if (!formData) {
      throw createError({
        statusCode: 400,
        message: 'No form data provided',
      })
    }
    
    // Parse form data
    let videoFile: Buffer | null = null
    let videoUrl: string | null = null
    let startOffset = 0
    let endOffset = 0
    let originalDuration = 0
    let prompt = ''
    let maskFile: Buffer | null = null
    let referenceImageFile: Buffer | null = null
    
    for (const item of formData) {
      if (item.name === 'videoFile' && item.data) {
        videoFile = item.data
      } else if (item.name === 'videoUrl' && item.data) {
        videoUrl = item.data.toString()
      } else if (item.name === 'startOffset' && item.data) {
        startOffset = parseFloat(item.data.toString())
      } else if (item.name === 'endOffset' && item.data) {
        endOffset = parseFloat(item.data.toString())
      } else if (item.name === 'originalDuration' && item.data) {
        originalDuration = parseFloat(item.data.toString())
      } else if (item.name === 'prompt' && item.data) {
        prompt = item.data.toString()
      } else if (item.name === 'maskFile' && item.data) {
        maskFile = item.data
      } else if (item.name === 'referenceImageFile' && item.data) {
        referenceImageFile = item.data
      }
    }
    
    if (!prompt) {
      throw createError({
        statusCode: 400,
        message: 'Prompt is required',
      })
    }
    
    console.log('[AI Edit] Starting video edit')
    console.log('[AI Edit] Prompt:', prompt)
    console.log('[AI Edit] Has mask:', !!maskFile)
    console.log('[AI Edit] Start offset:', startOffset)
    console.log('[AI Edit] End offset:', endOffset)
    console.log('[AI Edit] Original duration:', originalDuration)
    
    // Step 1: Get and trim video
    let localVideoPath: string
    if (videoFile) {
      localVideoPath = await saveAsset(videoFile, `temp-${nanoid()}.mp4`)
      console.log('[AI Edit] Saved uploaded video:', localVideoPath)
    } else if (videoUrl) {
      localVideoPath = await downloadFile(videoUrl)
      console.log('[AI Edit] Downloaded video from URL:', localVideoPath)
    } else {
      throw createError({
        statusCode: 400,
        message: 'Either videoFile or videoUrl must be provided',
      })
    }
    
    // Trim video
    const trimmedPath = path.join(path.dirname(localVideoPath), `trimmed-${nanoid()}.mp4`)
    const clipDuration = originalDuration - startOffset - endOffset
    
    console.log('[AI Edit] Trimming video...')
    console.log('[AI Edit] Clip duration:', clipDuration)
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(localVideoPath)
        .setStartTime(startOffset)
        .setDuration(clipDuration)
        .output(trimmedPath)
        .on('end', () => {
          console.log('[AI Edit] Trimming complete')
          resolve()
        })
        .on('error', (err) => {
          console.error('[AI Edit] Trimming error:', err)
          reject(err)
        })
        .run()
    })
    
    console.log(`[AI Edit] Trimmed video to ${clipDuration}s: ${trimmedPath}`)

    // Upload to Replicate
    console.log('[AI Edit] Uploading to Replicate...')
    const replicateVideoUrl = await uploadFileToReplicate(trimmedPath)
    console.log(`[AI Edit] Uploaded to Replicate: ${replicateVideoUrl}`)
    
    // Upload mask if provided
    let maskUrl: string | undefined
    if (maskFile) {
      console.log('[AI Edit] Mask file received')
      console.log('[AI Edit] Mask file size:', maskFile.length, 'bytes')
      
      // Try to get mask image dimensions using sharp or similar
      try {
        const sharp = await import('sharp').catch(() => null)
        if (sharp) {
          const metadata = await sharp.default(maskFile).metadata()
          console.log('[AI Edit] Mask image dimensions:', metadata.width, 'x', metadata.height)
          console.log('[AI Edit] Mask image format:', metadata.format)
          
          // Analyze mask pixels to verify it's not all black
          const { data, info } = await sharp.default(maskFile)
            .raw()
            .toBuffer({ resolveWithObject: true })
          
          let whitePixelCount = 0
          let blackPixelCount = 0
          const totalPixels = info.width * info.height
          
          // Check RGB values (assuming grayscale, check first channel)
          for (let i = 0; i < data.length; i += info.channels) {
            const pixelValue = data[i] // R channel (should be same for grayscale)
            if (pixelValue > 128) {
              whitePixelCount++
            } else {
              blackPixelCount++
            }
          }
          
          console.log('[AI Edit] Mask pixel analysis:')
          console.log('[AI Edit]   Total pixels:', totalPixels)
          console.log('[AI Edit]   White pixels (edit area):', whitePixelCount, `(${((whitePixelCount / totalPixels) * 100).toFixed(2)}%)`)
          console.log('[AI Edit]   Black pixels (preserve area):', blackPixelCount, `(${((blackPixelCount / totalPixels) * 100).toFixed(2)}%)`)
          
          if (whitePixelCount === 0) {
            console.error('[AI Edit] WARNING: Mask image is completely black! No edit area detected.')
            console.error('[AI Edit] This means the mask will not work - all pixels are set to preserve.')
          } else if (whitePixelCount === totalPixels) {
            console.warn('[AI Edit] WARNING: Mask image is completely white! Entire video will be edited.')
          } else {
            console.log('[AI Edit] Mask appears valid with both white (edit) and black (preserve) areas')
          }
        }
      } catch (err) {
        console.warn('[AI Edit] Could not analyze mask image (sharp not available or error):', err)
      }
      
      console.log('[AI Edit] Uploading mask to Replicate...')
      const maskPath = await saveAsset(maskFile, `mask-${nanoid()}.png`)
      maskUrl = await uploadFileToReplicate(maskPath)
      console.log(`[AI Edit] Mask uploaded: ${maskUrl}`)
      await fs.unlink(maskPath).catch(() => {})
    } else {
      console.log('[AI Edit] No mask file provided')
    }
    
    // Upload reference image if provided
    let referenceImageUrl: string | undefined
    if (referenceImageFile) {
      console.log('[AI Edit] Uploading reference image...')
      const refImagePath = await saveAsset(referenceImageFile, `ref-${nanoid()}.jpg`)
      referenceImageUrl = await uploadFileToReplicate(refImagePath)
      console.log(`[AI Edit] Reference image uploaded: ${referenceImageUrl}`)
      await fs.unlink(refImagePath).catch(() => {})
    }
    
    // Call Gen-4 Aleph via MCP
    console.log('[AI Edit] Calling Gen-4 Aleph MCP...')
    const gen3Result = await callReplicateMCP('edit_video_gen3', {
      video: replicateVideoUrl,
      prompt: prompt,
      mask: maskUrl,
      reference_image: referenceImageUrl,
      aspect_ratio: '16:9',
    })
    
    const { predictionId } = gen3Result
    console.log(`[AI Edit] Prediction created: ${predictionId}`)
    
    // Poll for completion
    let editedVideoUrl: string | null = null
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max (5s intervals)
    
    console.log('[AI Edit] Polling for completion...')
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      const statusResult = await callReplicateMCP('get_prediction_result', {
        predictionId: predictionId,
      })
      
      if (statusResult.videoUrl) {
        editedVideoUrl = statusResult.videoUrl
        console.log('[AI Edit] Video ready!')
        break
      }
      
      attempts++
      if (attempts % 10 === 0) {
        console.log(`[AI Edit] Polling attempt ${attempts}/${maxAttempts}`)
      }
    }
    
    if (!editedVideoUrl) {
      throw new Error('AI video editing timed out after 5 minutes')
    }
    
    console.log(`[AI Edit] Edited video ready: ${editedVideoUrl}`)
    
    // Download edited video
    const editedLocalPath = await downloadFile(editedVideoUrl)
    console.log('[AI Edit] Downloaded edited video:', editedLocalPath)
    
    // Get duration
    const editedDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(editedLocalPath, (err, metadata) => {
        if (err) {
          console.error('[AI Edit] ffprobe error:', err)
          reject(err)
        } else {
          const duration = metadata.format.duration || clipDuration
          console.log('[AI Edit] Edited video duration:', duration)
          resolve(duration)
        }
      })
    })
    
    // Track cost (Gen-4 Aleph)
    await trackCost({
      operation: 'aleph-video-edit',
      provider: 'replicate',
      model: 'runwayml/gen4-aleph',
      cost: 0.50, // Aleph cost per video edit
      metadata: {
        duration: clipDuration,
        prompt: prompt,
        hasMask: !!maskUrl,
      },
    })
    
    console.log('[AI Edit] Cost tracked')
    
    // Clean up
    await fs.unlink(localVideoPath).catch(() => {})
    await fs.unlink(trimmedPath).catch(() => {})
    
    // Return video
    const videoBuffer = await fs.readFile(editedLocalPath)
    await fs.unlink(editedLocalPath).catch(() => {})

    setHeader(event, 'Content-Type', 'video/mp4')
    setHeader(event, 'X-Video-Duration', editedDuration.toString())
    setHeader(event, 'X-Clip-Id', nanoid())

    return videoBuffer
  } catch (error: any) {
    console.error('[AI Edit] Error:', error)
    console.error('[AI Edit] Error stack:', error.stack)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to edit video with AI',
    })
  }
})

