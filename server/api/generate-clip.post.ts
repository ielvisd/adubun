import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { saveAsset, saveVideo } from '../utils/storage'
import { nanoid } from 'nanoid'

const generateClipSchema = z.object({
  prompt: z.string().min(1),
  duration: z.number().min(1).max(10).default(5),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  model: z.string().default('google/veo-3.1'),
  modelReference: z.string().optional(), // Character/Object structure
  styleReference: z.string().optional() // Style guidance
})

// Helper to prepare image for Replicate (upload local or pass URL)
async function prepareImage(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http')) return imageUrl
  return imageUrl
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  try {
    const { prompt, duration, firstFrame, lastFrame, aspectRatio, model, modelReference, styleReference } = generateClipSchema.parse(body)
    
    console.log('[API] Generating clip:', { 
      prompt, 
      duration, 
      hasFirstFrame: !!firstFrame, 
      hasLastFrame: !!lastFrame, 
      hasModelRef: !!modelReference,
      hasStyleRef: !!styleReference
    })

    // Track cost
    await trackCost('video-generation', 0.15, {
      model,
      duration
    })

    // Prepare inputs
    const input: any = {
      model,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      resolution: '1080p',
      generate_audio: true
    }

    if (firstFrame) {
      input.image = firstFrame // Veo uses 'image' for start frame
    }
    
    if (lastFrame) {
      input.last_frame = lastFrame
    }

    // Handle Reference Images for Veo 3.1
    // 'subject_reference' is best for character consistency (Model Reference)
    if (modelReference) {
      input.subject_reference = modelReference
    }
    
    // 'reference_images' is an array for general style/consistency
    // NOTE: Veo 3.1 doesn't allow BOTH 'image' (Start Frame) AND 'reference_images' to be set.
    // Since First Frame is critical for continuity, we prioritize it.
    // Only add styleReference if we DON'T have a firstFrame.
    const referenceImages: string[] = []
    if (styleReference && !firstFrame) {
      referenceImages.push(styleReference)
    }
    
    if (referenceImages.length > 0) {
      input.reference_images = referenceImages
    }

    // Generate Video
    const result = await callReplicateMCP('generate_video', input)

    let predictionId = result.predictionId
    if (!predictionId) throw new Error('No prediction ID returned')

    console.log('[API] Polling for clip completion:', predictionId)
    
    // Poll loop
    let status = result.status
    let videoUrl = null
    let attempts = 0
    const maxAttempts = 60 // 2 mins (2s interval)

    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000))
      const check = await callReplicateMCP('check_prediction_status', { predictionId })
      
      // Parse inner content from MCP
      const data = typeof check === 'string' ? JSON.parse(check) : check
      status = data.status
      
      if (status === 'succeeded') {
         // Get result URL
         const finalRes = await callReplicateMCP('get_prediction_result', { predictionId })
         videoUrl = finalRes.videoUrl || finalRes.url
      }
      attempts++
    }

    if (status !== 'succeeded' || !videoUrl) {
       throw new Error(`Generation failed or timed out. Status: ${status}`)
    }

    // Download and Save to S3/Local to persist
    const videoBuffer = Buffer.from(await (await fetch(videoUrl)).arrayBuffer())
    const filename = `clip-${nanoid()}.mp4`
    const savedUrl = await saveVideo(videoBuffer, filename, 'ai_videos')

    return {
      url: savedUrl,
      status: 'completed',
      predictionId
    }

  } catch (error: any) {
    console.error('Clip generation error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate clip'
    })
  }
})
