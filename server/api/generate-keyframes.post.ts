import { generateKeyframesForSegment, waitForKeyframeCompletion } from '../utils/keyframe-generator'
import { trackCost } from '../utils/cost-tracker'
import { generateKeyframesSchema } from '../utils/validation'

/**
 * API Endpoint: Generate Keyframes
 * 
 * POST /api/generate-keyframes
 * 
 * Generates first and last frame keyframes for a video segment using
 * the GPT-4o-mini → Seedream 4 pipeline.
 */

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate with Zod schema
    const validated = generateKeyframesSchema.parse(body)

    const {
      segment,
      segmentIndex,
      productName,
      productImages,
      aspectRatio,
      resolution,
      story,
      allSegments,
      waitForCompletion,
    } = validated

    console.log('[Generate Keyframes API] Generating keyframes for segment:', {
      segmentIndex,
      segmentType: segment.type,
      productName,
      productImageCount: productImages.length,
      aspectRatio,
      resolution,
      waitForCompletion,
    })

    // Generate both keyframes
    const result = await generateKeyframesForSegment(
      segment,
      segmentIndex,
      {
        story,
        productName,
        productImages,
        aspectRatio,
        resolution,
        allSegments,
      }
    )

    console.log('[Generate Keyframes API] Keyframes initiated:', {
      firstFramePredictionId: result.first.predictionId,
      lastFramePredictionId: result.last.predictionId,
    })

    // Track costs asynchronously (GPT-4o-mini + Seedream x2)
    setImmediate(async () => {
      try {
        // GPT-4o-mini enhancement: ~$0.015 per call x2 (first and last)
        await trackCost('enhance-composition-prompt', 0.03, {
          segmentType: segment.type,
          productName,
          count: 2,
        })
        
        // Seedream 4 generation cost based on resolution
        const seedreamCost = resolution === '4K' ? 0.03 : resolution === '1K' ? 0.016 : 0.02
        await trackCost('generate-keyframe', seedreamCost * 2, {
          segmentType: segment.type,
          resolution,
          count: 2,
        })
      } catch (e) {
        console.error('Failed to track cost for keyframe generation:', e)
      }
    })

    // If client wants to wait for completion, poll until done
    if (waitForCompletion) {
      console.log('[Generate Keyframes API] Waiting for keyframe completion...')

      const [firstImageUrl, lastImageUrl] = await Promise.all([
        waitForKeyframeCompletion(result.first.predictionId),
        waitForKeyframeCompletion(result.last.predictionId),
      ])

      console.log('[Generate Keyframes API] Keyframes completed:', {
        firstImageUrl,
        lastImageUrl,
      })

      return {
        first: {
          ...result.first,
          imageUrl: firstImageUrl,
          status: 'completed',
        },
        last: {
          ...result.last,
          imageUrl: lastImageUrl,
          status: 'completed',
        },
      }
    }

    // Return immediately with prediction IDs for async polling
    return {
      first: {
        predictionId: result.first.predictionId,
        enhancedPrompt: result.first.enhancedPrompt,
        type: 'first',
        generatedAt: result.first.generatedAt,
        status: 'processing',
      },
      last: {
        predictionId: result.last.predictionId,
        enhancedPrompt: result.last.enhancedPrompt,
        type: 'last',
        generatedAt: result.last.generatedAt,
        status: 'processing',
      },
    }
  } catch (error: any) {
    console.error('[Generate Keyframes API] Error:', error)

    // Handle Zod validation errors
    if (error.name === 'ZodError' || error.issues) {
      throw createError({
        statusCode: 400,
        message: 'Invalid input for keyframe generation',
        data: error.errors || error.issues,
      })
    }

    // Handle validation errors
    if (error.statusCode === 400) {
      throw error
    }

    // Handle MCP errors
    if (error.message?.includes('MCP') || error.message?.includes('OpenAI') || error.message?.includes('Replicate')) {
      throw createError({
        statusCode: 502,
        message: `External service error: ${error.message}`,
      })
    }

    // Generic error
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate keyframes',
    })
  }
})

