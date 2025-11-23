import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'

const generateModelSchema = z.object({
  name: z.string().min(1),
  gender: z.string().min(1),
  ageRange: z.string().min(1),
  description: z.string().min(10),
  lookStyle: z.string().min(1),
  categories: z.string().optional(), // Comma separated or just a string
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, gender, ageRange, description, lookStyle, categories } = generateModelSchema.parse(body)

  console.log(`[Generate Model] Starting generation for: ${name} (${gender}, ${ageRange})`)

  // Construct a detailed prompt for Nano-banana
  // "Professional portrait of a [ageRange] year old [gender], [description]. Style: [lookStyle]. Context: [categories]. Photorealistic, 8k, highly detailed, neutral background."
  const prompt = `Professional portrait of a ${ageRange} year old ${gender}. ${description}. Style: ${lookStyle}. ${categories ? `Vibe: ${categories}.` : ''} Hands by side, holding nothing, empty hands, neutral pose. Raw photo, f/1.8, 85mm, realistic skin texture, hyper-realistic, 8k, highly detailed, studio lighting, neutral background.`

  console.log(`[Generate Model] Prompt: ${prompt}`)

  try {
    const result = await callReplicateMCP('generate_image', {
      model: 'google/nano-banana',
      prompt: prompt,
      aspect_ratio: '9:16', // Portrait aspect ratio for model generation
      output_format: 'jpg',
    })

    // Handle response - check for prediction ID or direct output
    let predictionId = result.predictionId || result.id
    let imageUrl = null

    // If we got a direct output (sometimes happens depending on MCP/model version)
    if (!predictionId && result.output) {
        imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
    }
    
    // If we have a prediction ID, we need to poll (or return it for frontend to poll, 
    // but typically our endpoints poll internally for simplicity unless long-running)
    // Given Nano-banana is fast, we can poll here.
    if (predictionId && !imageUrl) {
      let status = 'starting'
      let attempts = 0
      const maxAttempts = 30 // 60 seconds
      
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
        throw new Error('Failed to generate image or timeout')
    }

    return {
      success: true,
      imageUrl: imageUrl,
      prompt: prompt
    }

  } catch (error: any) {
    console.error('[Generate Model] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate model'
    })
  }
})

