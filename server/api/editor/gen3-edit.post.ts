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
        // Use input seeking for frame-accurate cuts
        .inputOptions([
          '-ss', startOffset.toString(),
          '-accurate_seek'  // Frame-accurate seeking to prevent black frames
        ])
        .setDuration(clipDuration)
        // Black frame prevention: force keyframes, consistent pixel format, proper encoding
        .outputOptions([
          // Video encoding
          '-c:v libx264',
          '-preset fast',
          '-crf 18',                    // High quality to prevent artifacts
          '-pix_fmt yuv420p',           // Consistent pixel format (critical for browser playback)
          '-g 30',                      // GOP size - keyframe every 30 frames (1s at 30fps)
          '-keyint_min 30',             // Minimum GOP size
          '-sc_threshold 0',            // Disable scene change detection to maintain keyframe interval
          '-force_key_frames expr:gte(t,0)', // Force keyframe at start (t=0) to prevent black frames
          
          // Audio encoding (preserve audio from source)
          '-c:a aac',                   // AAC audio codec
          '-b:a 192k',                  // Audio bitrate
          '-ar 48000',                  // Audio sample rate
          
          // Optimization
          '-movflags +faststart',       // Enable fast start for web playback
          '-avoid_negative_ts make_zero' // Fix potential timestamp issues
        ])
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
    
    // Extract audio from trimmed video (to stitch back later)
    const audioPath = path.join(
      path.dirname(trimmedPath),
      `audio-${nanoid()}.aac`
    )
    
    console.log('[AI Edit] Extracting audio from trimmed video...')
    let hasAudio = false
    
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(trimmedPath)
          .outputOptions([
            '-vn',              // No video
            '-acodec', 'aac',   // AAC audio codec
            '-b:a', '192k',     // Audio bitrate
            '-ar', '48000'      // Audio sample rate
          ])
          .output(audioPath)
          .on('end', () => {
            console.log('[AI Edit] Audio extracted successfully')
            hasAudio = true
            resolve()
          })
          .on('error', (err) => {
            // If extraction fails, video likely has no audio - continue without it
            console.log('[AI Edit] No audio track found in source video')
            hasAudio = false
            resolve() // Don't reject - continue without audio
          })
          .run()
      })
    } catch (err) {
      console.log('[AI Edit] Could not extract audio, continuing without it')
      hasAudio = false
    }

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
    
    // Stitch audio back into RunwayML output
    let finalVideoPath = editedLocalPath
    
    if (hasAudio) {
      console.log('[AI Edit] Stitching audio back into edited video...')
      
      const videoWithAudioPath = path.join(
        path.dirname(editedLocalPath),
        `final-${nanoid()}.mp4`
      )
      
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(editedLocalPath)
            .input(audioPath)
            .outputOptions([
              '-c:v copy',           // Copy video stream (no re-encoding)
              '-c:a aac',            // Re-encode audio to AAC
              '-b:a 192k',           // Audio bitrate
              '-map 0:v:0',          // Map video from first input
              '-map 1:a:0',          // Map audio from second input
              '-shortest',           // Match shortest stream duration
              '-movflags +faststart' // Fast start for web
            ])
            .output(videoWithAudioPath)
            .on('end', () => {
              console.log('[AI Edit] Audio stitched successfully')
              finalVideoPath = videoWithAudioPath
              resolve()
            })
            .on('error', (err) => {
              console.error('[AI Edit] Audio stitching error:', err)
              console.log('[AI Edit] Continuing with video-only output')
              resolve() // Don't fail the whole operation
            })
            .run()
        })
        
        // Clean up audio file
        await fs.unlink(audioPath).catch(() => {})
      } catch (err) {
        console.error('[AI Edit] Failed to stitch audio:', err)
        console.log('[AI Edit] Returning video without audio')
      }
    }
    
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
    
    // Return video (with audio)
    const videoBuffer = await fs.readFile(finalVideoPath)
    await fs.unlink(finalVideoPath).catch(() => {})
    
    // Clean up intermediate files if audio stitching created them
    if (finalVideoPath !== editedLocalPath) {
      await fs.unlink(editedLocalPath).catch(() => {})
    }

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

