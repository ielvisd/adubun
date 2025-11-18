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
        .setStartTime(startOffset)
        .setDuration(clipDuration)
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
    
    // Step 9: Return edited video as binary data for immediate download
    const videoBuffer = await fs.readFile(editedLocalPath)
    await fs.unlink(editedLocalPath).catch(() => {}) // Clean up the downloaded file immediately

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







