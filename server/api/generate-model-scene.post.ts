import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { SKIN_IMPERFECTION_EXCLUSION_TEXT, SKIN_QUALITY_POSITIVE_INSTRUCTION } from '../utils/negative-prompts'

const generateSceneSchema = z.object({
  modelImageUrl: z.string().url(),
  modelDescription: z.string(),
  scenePrompt: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { modelImageUrl, modelDescription, scenePrompt } = generateSceneSchema.parse(body)

  console.log(`[Generate Scene] Starting generation for scene: "${scenePrompt}"`)

  // Construct prompt enforcing placeholder rules
  // Note: We use the model description again to reinforce the character's look, 
  // and we pass the modelImageUrl as image_input to Nano-banana.
  const prompt = `
    Photo of ${modelDescription}. 
    Action: ${scenePrompt}. 
    IMPORTANT: Any product or object held must be a PLAIN WHITE PLACEHOLDER OBJECT. 
    Pure white matte finish. No logos, no text, no labels, no branding. 
    Minimalist white prop.
    ${SKIN_QUALITY_POSITIVE_INSTRUCTION}.
    ${SKIN_IMPERFECTION_EXCLUSION_TEXT}.
    Photorealistic, 8k, highly detailed, cinematic lighting.
  `.trim().replace(/\s+/g, ' ')

  console.log(`[Generate Scene] Prompt: ${prompt}`)

  try {
    const result = await callReplicateMCP('generate_image', {
      model: 'google/nano-banana-pro',
      prompt: prompt,
      image_input: [modelImageUrl], // Pass model image as reference
      aspect_ratio: '9:16',
      output_format: 'jpg',
    })

    // Handle response - logic similar to other endpoints
    let predictionId = result.predictionId || result.id
    let imageUrl = null

    if (!predictionId && result.output) {
        imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
    }
    
    if (predictionId && !imageUrl) {
      let status = 'starting'
      let attempts = 0
      const maxAttempts = 30 
      
      while (status !== 'succeeded' && status !== 'failed' && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000))
        const check = await callReplicateMCP('check_prediction_status', { predictionId })
        status = check.status
        
        if (status === 'succeeded') {
           const final = await callReplicateMCP('get_prediction_result', { predictionId })
           imageUrl = final.videoUrl || final.url || (Array.isArray(final.output) ? final.output[0] : final.output)
        } else if (status === 'failed') {
            throw new Error(`Generation failed: ${check.error || 'Unknown error'}`)
        }
        attempts++
      }
    }

    if (!imageUrl) {
        throw new Error('Failed to generate scene image')
    }

    return {
      success: true,
      imageUrl: imageUrl,
      prompt: prompt
    }

  } catch (error: any) {
    console.error('[Generate Scene] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate scene'
    })
  }
})

