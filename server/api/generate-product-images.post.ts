import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { checkPredictionStatus, getPredictionResult } from '../utils/replicate-upload'

const generateProductImagesSchema = z.object({
  prompt: z.string().min(1),
  existingImages: z.array(z.string()).max(10),
  targetCount: z.number().min(1).max(10).default(10),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { prompt, existingImages = [], targetCount = 10 } = generateProductImagesSchema.parse(body)

    const currentCount = existingImages.length
    const neededCount = Math.max(0, targetCount - currentCount)

    if (neededCount === 0) {
      return {
        images: existingImages,
        generated: [],
        total: existingImages.length,
      }
    }

    // Extract product name from prompt for angle-specific prompts
    const productMatch = prompt.match(/for\s+([^.,!?]+)/i) || prompt.match(/ad\s+for\s+([^.,!?]+)/i)
    const productName = productMatch ? productMatch[1].trim() : 'product'

    // Define angles to generate
    const angles = [
      'front view, centered, well-lit',
      'side view, profile angle',
      'back view, rear perspective',
      'top view, overhead angle',
      'three-quarter view, angled perspective',
      'close-up detail shot',
      'wide shot with context',
      'low angle, looking up',
      'high angle, looking down',
      'dramatic angle with depth',
    ]

    const generatedImages: string[] = []
    const predictionIds: string[] = []

    // Generate images for each needed angle
    for (let i = 0; i < neededCount && i < angles.length; i++) {
      const anglePrompt = `${productName}, ${angles[i]}, professional product photography, high quality, detailed`
      
      // Use existing images as reference for consistency
      const imageInput = existingImages.length > 0 ? existingImages.slice(0, 3) : undefined

      try {
        // Use seedream-4 for product image generation
        const result = await callReplicateMCP('generate_image', {
          model: 'bytedance/seedream-4',
          prompt: anglePrompt,
          image_input: imageInput,
          size: '2K',
          aspect_ratio: 'match_input_image',
          enhance_prompt: true,
        })

        const predictionId = result.predictionId || result.id
        if (predictionId) {
          predictionIds.push(predictionId)
        }
      } catch (error: any) {
        console.error(`[Generate Product Images] Error generating image ${i + 1}:`, error)
        // Continue with other images even if one fails
      }
    }

    // Poll for results
    const results: string[] = []
    for (const predictionId of predictionIds) {
      try {
        // Poll until complete (max 2 minutes per image)
        let status = 'starting'
        let attempts = 0
        const maxAttempts = 60 // 2 minutes with 2 second intervals

        while (status !== 'succeeded' && status !== 'failed' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
          
          const statusResult = await callReplicateMCP('check_prediction_status', {
            predictionId,
          })

          status = statusResult.status || 'starting'
          attempts++

          if (status === 'succeeded') {
            const result = await callReplicateMCP('get_prediction_result', {
              predictionId,
            })

            if (result.output && Array.isArray(result.output) && result.output[0]) {
              results.push(result.output[0])
            } else if (result.output && typeof result.output === 'string') {
              results.push(result.output)
            }
            break
          } else if (status === 'failed') {
            console.error(`[Generate Product Images] Prediction ${predictionId} failed`)
            break
          }
        }
      } catch (error: any) {
        console.error(`[Generate Product Images] Error polling prediction ${predictionId}:`, error)
      }
    }

    // Track cost (estimate: ~$0.01 per image)
    await trackCost('generate-product-images', 0.01 * results.length, {
      prompt,
      generatedCount: results.length,
    })

    const allImages = [...existingImages, ...results].slice(0, targetCount)

    return {
      images: allImages,
      generated: results,
      total: allImages.length,
      predictionIds, // Return for client-side polling if needed
    }
  } catch (error: any) {
    console.error('[Generate Product Images] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate product images',
    })
  }
})


