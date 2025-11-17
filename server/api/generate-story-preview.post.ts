import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'

const generatePreviewSchema = z.object({
  hookText: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const { hookText, aspectRatio = '16:9' } = generatePreviewSchema.parse(await readBody(event))

    console.log('[Generate Preview] Generating preview image for hook:', hookText.substring(0, 50))

    // Build nano-banana prompt
    const nanoPrompt = `${hookText}, professional product photography, cinematic lighting, high quality, detailed scene`

    // Generate preview image using nano-banana
    const nanoResult = await callReplicateMCP('generate_image', {
      model: 'google/nano-banana',
      prompt: nanoPrompt,
      aspect_ratio: aspectRatio,
      output_format: 'jpg',
      seed: Math.floor(Math.random() * 1000000),
    })

    // Parse result
    let prediction
    if (nanoResult.content && Array.isArray(nanoResult.content) && nanoResult.content[0]?.text) {
      prediction = JSON.parse(nanoResult.content[0].text)
    } else if (typeof nanoResult === 'object' && nanoResult.id) {
      prediction = nanoResult
    } else {
      throw new Error('Unexpected response format from nano-banana')
    }

    console.log('[Generate Preview] Nano-banana prediction ID:', prediction.id)

    // Poll for result (simplified polling)
    let attempts = 0
    const maxAttempts = 30 // 30 seconds max
    let imageUrl: string | null = null

    while (attempts < maxAttempts && !imageUrl) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second

      const statusResult = await callReplicateMCP('get_prediction', {
        prediction_id: prediction.id,
      })

      let status
      if (statusResult.content && Array.isArray(statusResult.content) && statusResult.content[0]?.text) {
        status = JSON.parse(statusResult.content[0].text)
      } else {
        status = statusResult
      }

      if (status.status === 'succeeded') {
        imageUrl = Array.isArray(status.output) ? status.output[0] : status.output
        break
      } else if (status.status === 'failed') {
        throw new Error(`Preview generation failed: ${status.error}`)
      }

      attempts++
    }

    if (!imageUrl) {
      throw new Error('Preview generation timed out')
    }

    // Track cost (nano-banana is ~$0.0025 per image)
    await trackCost('generate-story-preview', 0.0025, { hookText: hookText.substring(0, 50) })

    console.log('[Generate Preview] Preview image generated:', imageUrl)

    return {
      previewUrl: imageUrl,
    }
  } catch (error: any) {
    console.error('[Generate Preview] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to generate preview image',
    })
  }
})

