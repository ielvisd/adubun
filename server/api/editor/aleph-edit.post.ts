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
    console.log('[Aleph Edit] Received request')
    
    const formData = await readMultipartFormData(event)
    
    if (!formData) {
      console.error('[Aleph Edit] No form data provided')
      throw createError({
        statusCode: 400,
        message: 'No form data provided',
      })
    }
    
    console.log('[Aleph Edit] Form data items:', formData.map(item => ({ name: item.name, hasData: !!item.data })))
    
    // Parse form data
    let videoFile: Buffer | null = null
    let videoUrl: string | null = null
    let startOffset = 0
    let endOffset = 0
    let originalDuration = 0
    let prompt = ''
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
      } else if (item.name === 'referenceImageFile' && item.data) {
        referenceImageFile = item.data
      }
    }
    
    if (!prompt) {
      console.error('[Aleph Edit] No prompt provided')
      throw createError({
        statusCode: 400,
        message: 'Prompt is required',
      })
    }
    
    console.log('[Aleph Edit] Starting video edit')
    console.log('[Aleph Edit] Prompt:', prompt)
    console.log('[Aleph Edit] Start offset:', startOffset)
    console.log('[Aleph Edit] End offset:', endOffset)
    console.log('[Aleph Edit] Original duration:', originalDuration)
    console.log('[Aleph Edit] Has video file:', !!videoFile)
    console.log('[Aleph Edit] Has video URL:', !!videoUrl)
    console.log('[Aleph Edit] Has reference image:', !!referenceImageFile)
    
    // Step 1: Get the video file (either uploaded or download from URL)
    let localVideoPath: string
    
    if (videoFile) {
      const tempId = nanoid()
      localVideoPath = await saveAsset(videoFile, `temp-${tempId}.mp4`)
      console.log('[Aleph Edit] Saved uploaded video:', localVideoPath)
    } else if (videoUrl) {
      localVideoPath = await downloadFile(videoUrl)
      console.log('[Aleph Edit] Downloaded video from URL:', localVideoPath)
    } else {
      throw createError({
        statusCode: 400,
        message: 'Either videoFile or videoUrl must be provided',
      })
    }
    
    // Step 2: Trim the video to the specified range
    const trimmedPath = path.join(
      path.dirname(localVideoPath),
      `trimmed-${nanoid()}.mp4`
    )
    
    const clipDuration = originalDuration - startOffset - endOffset
    
    console.log('[Aleph Edit] Trimming video...')
    console.log('[Aleph Edit] Clip duration:', clipDuration)
    
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
          console.log('[Aleph Edit] Trimming complete')
          resolve()
        })
        .on('error', (err) => {
          console.error('[Aleph Edit] Trimming error:', err)
          reject(err)
        })
        .run()
    })
    
    console.log(`[Aleph Edit] Trimmed video to ${clipDuration}s: ${trimmedPath}`)
    
    // Step 2.5: Extract audio from trimmed video (to stitch back later)
    const audioPath = path.join(
      path.dirname(trimmedPath),
      `audio-${nanoid()}.aac`
    )
    
    console.log('[Aleph Edit] Extracting audio from trimmed video...')
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
            console.log('[Aleph Edit] Audio extracted successfully')
            hasAudio = true
            resolve()
          })
          .on('error', (err) => {
            // If extraction fails, video likely has no audio - continue without it
            console.log('[Aleph Edit] No audio track found in source video')
            hasAudio = false
            resolve() // Don't reject - continue without audio
          })
          .run()
      })
    } catch (err) {
      console.log('[Aleph Edit] Could not extract audio, continuing without it')
      hasAudio = false
    }
    
    // Step 3: Upload trimmed video to Replicate
    console.log('[Aleph Edit] Uploading to Replicate...')
    const replicateVideoUrl = await uploadFileToReplicate(trimmedPath)
    console.log(`[Aleph Edit] Uploaded to Replicate: ${replicateVideoUrl}`)
    
    // Step 3.5: Upload reference image if provided
    let referenceImageUrl: string | undefined
    if (referenceImageFile) {
      console.log('[Aleph Edit] Uploading reference image...')
      const refImageId = nanoid()
      const refImagePath = await saveAsset(referenceImageFile, `ref-${refImageId}.jpg`)
      referenceImageUrl = await uploadFileToReplicate(refImagePath)
      console.log(`[Aleph Edit] Reference image uploaded: ${referenceImageUrl}`)
      // Clean up temp reference image
      await fs.unlink(refImagePath).catch(() => {})
    }
    
    // Step 4: Call Aleph via MCP
    console.log('[Aleph Edit] Calling Aleph MCP...')
    const alephResult = await callReplicateMCP('edit_video_aleph', {
      video: replicateVideoUrl,
      prompt: prompt,
      reference_image: referenceImageUrl,
      aspect_ratio: '16:9', // You can make this dynamic based on video
    })
    
    // alephResult is already parsed by callReplicateMCP
    const { predictionId } = alephResult
    console.log(`[Aleph Edit] Prediction created: ${predictionId}`)
    
    // Step 5: Poll for completion
    let editedVideoUrl: string | null = null
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max (5s intervals)
    
    console.log('[Aleph Edit] Polling for completion...')
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      const statusResult = await callReplicateMCP('get_prediction_result', {
        predictionId: predictionId,
      })
      
      // statusResult is already parsed by callReplicateMCP
      if (statusResult.videoUrl) {
        editedVideoUrl = statusResult.videoUrl
        console.log('[Aleph Edit] Video ready!')
        break
      }
      
      attempts++
      console.log(`[Aleph Edit] Polling attempt ${attempts}/${maxAttempts}`)
    }
    
    if (!editedVideoUrl) {
      throw new Error('Aleph editing timed out after 5 minutes')
    }
    
    console.log(`[Aleph Edit] Edited video ready: ${editedVideoUrl}`)
    
    // Step 6: Download and save the edited video
    const editedLocalPath = await downloadFile(editedVideoUrl)
    console.log('[Aleph Edit] Downloaded edited video:', editedLocalPath)
    
    // Get duration of edited video
    const editedDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(editedLocalPath, (err, metadata) => {
        if (err) {
          console.error('[Aleph Edit] ffprobe error:', err)
          reject(err)
        } else {
          const duration = metadata.format.duration || clipDuration
          console.log('[Aleph Edit] Edited video duration:', duration)
          resolve(duration)
        }
      })
    })
    
    // Step 6.5: Stitch audio back into RunwayML output
    let finalVideoPath = editedLocalPath
    
    if (hasAudio) {
      console.log('[Aleph Edit] Stitching audio back into edited video...')
      
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
              console.log('[Aleph Edit] Audio stitched successfully')
              finalVideoPath = videoWithAudioPath
              resolve()
            })
            .on('error', (err) => {
              console.error('[Aleph Edit] Audio stitching error:', err)
              console.log('[Aleph Edit] Continuing with video-only output')
              resolve() // Don't fail the whole operation
            })
            .run()
        })
        
        // Clean up audio file
        await fs.unlink(audioPath).catch(() => {})
      } catch (err) {
        console.error('[Aleph Edit] Failed to stitch audio:', err)
        console.log('[Aleph Edit] Returning video without audio')
      }
    }
    
    // Step 7: Track cost
    await trackCost({
      operation: 'aleph-video-edit',
      provider: 'replicate',
      model: 'runwayml/gen4-aleph',
      cost: 0.50, // Estimate - adjust based on actual pricing
      metadata: {
        duration: clipDuration,
        prompt: prompt,
      },
    })
    
    console.log('[Aleph Edit] Cost tracked')
    
    // Step 8: Clean up temp files
    await fs.unlink(localVideoPath).catch(() => {})
    await fs.unlink(trimmedPath).catch(() => {})
    
    console.log('[Aleph Edit] Cleanup complete')
    
    // Step 9: Return edited video (with audio) as binary data for immediate download
    const videoBuffer = await fs.readFile(finalVideoPath)
    await fs.unlink(finalVideoPath).catch(() => {}) // Clean up the final file
    
    // Clean up intermediate files if audio stitching created them
    if (finalVideoPath !== editedLocalPath) {
      await fs.unlink(editedLocalPath).catch(() => {})
    }

    setHeader(event, 'Content-Type', 'video/mp4')
    setHeader(event, 'X-Video-Duration', editedDuration.toString())
    setHeader(event, 'X-Clip-Id', nanoid()) // Generate new clip ID for client

    return videoBuffer
  } catch (error: any) {
    console.error('[Aleph Edit] Error:', error)
    console.error('[Aleph Edit] Error stack:', error.stack)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to edit video with Aleph',
    })
  }
})








