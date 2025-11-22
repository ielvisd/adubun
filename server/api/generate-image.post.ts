import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { sanitizeVideoPrompt } from '../utils/prompt-sanitizer'

const generateImageSchema = z.object({
  prompt: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', 'match_input_image']).optional().default('16:9'),
  model: z.string().optional().default('google/nano-banana'),
  outputFormat: z.enum(['jpg', 'png']).optional().default('jpg'),
  modelReference: z.string().optional(), // Specifically for character/object structure
  styleReference: z.string().optional() // For style guidance
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  try {
    const { prompt, aspectRatio, model, outputFormat, modelReference, styleReference } = generateImageSchema.parse(body)
    
    console.log('[API] Generating image:', { 
      prompt, 
      aspectRatio, 
      model, 
      hasModelRef: !!modelReference, 
      hasStyleRef: !!styleReference 
    })
    
    // Track cost (estimated)
    await trackCost('image-generation', 0.04, {
      model,
      aspectRatio
    })

    // Prepare args based on model capabilities
    let args: any = {
      model,
      prompt, // Initial attempt with raw prompt
      aspect_ratio: aspectRatio,
      output_format: outputFormat
    }

    // Handle Reference Images
    const imageInputs: string[] = []
    if (modelReference) imageInputs.push(modelReference)
    if (styleReference) imageInputs.push(styleReference)
    if (imageInputs.length > 0) args.image_input = imageInputs

    // First attempt
    let result = await callReplicateMCP('generate_image', args)
    let predictionId = result.predictionId || result.id

    // If immediate failure (E005 in initial response), retry immediately
    if (!predictionId && result.error && (result.error.includes('E005') || result.error.toLowerCase().includes('sensitive'))) {
       console.warn('[API] Initial generation flagged as sensitive (E005). Retrying with sanitized prompt.')
       args.prompt = sanitizeVideoPrompt(prompt) + ", professional, safe for work, standard lighting"
       result = await callReplicateMCP('generate_image', args)
       predictionId = result.predictionId || result.id
    }

    if (!predictionId) {
        if (result.url || result.videoUrl || result.audioUrl) {
             return { url: result.url || result.videoUrl || result.audioUrl, status: 'completed' }
        }
        // If still failed after retry
        if (result.error) throw new Error(`Generation failed: ${result.error}`)
        throw new Error('No prediction ID returned from generation')
    }

    console.log('[API] Polling for image completion:', predictionId)

    // Poll loop
    let status = result.status
    let imageUrl = null
    let attempts = 0
    let retryAttempted = false
    const maxAttempts = 30 

    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000))
      const check = await callReplicateMCP('check_prediction_status', { predictionId })
      const data = typeof check === 'string' ? JSON.parse(check) : check
      status = data.status
      
      // Check for sensitivity error during polling
      if (status === 'failed' && !retryAttempted) {
          const errorMsg = data.error || ''
          if (errorMsg.includes('E005') || errorMsg.toLowerCase().includes('sensitive') || errorMsg.toLowerCase().includes('flagged')) {
              console.warn(`[API] Generation flagged as sensitive during polling: ${errorMsg}. Retrying with sanitized prompt.`)
              retryAttempted = true
              
              // Sanitize and modify prompt for safety
              args.prompt = sanitizeVideoPrompt(prompt) + ", professional, safe content, standard lighting, high quality"
              
              // Create NEW prediction
              const retryResult = await callReplicateMCP('generate_image', args)
              const newId = retryResult.predictionId || retryResult.id
              if (newId) {
                  predictionId = newId
                  status = 'starting' // Reset status loop
                  attempts = 0 // Reset attempts
                  console.log('[API] Started retry prediction:', predictionId)
                  continue // Continue loop with new ID
              }
          }
      }

      if (status === 'succeeded') {
         const finalRes = await callReplicateMCP('get_prediction_result', { predictionId })
         imageUrl = finalRes.url || finalRes.videoUrl || finalRes.audioUrl
         if (!imageUrl && data.output) {
             imageUrl = Array.isArray(data.output) ? data.output[0] : data.output
         }
      }
      attempts++
    }

    if (status !== 'succeeded' || !imageUrl) {
       throw new Error(`Generation failed or timed out. Status: ${status}`)
    }
    
    return {
      url: imageUrl,
      predictionId,
      status: 'completed'
    }

  } catch (error: any) {
    console.error('Image generation error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate image'
    })
  }
})
