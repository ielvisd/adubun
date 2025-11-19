import { planStoryboardSchema } from '../utils/validation'
import { callOpenAIMCP } from '../utils/mcp-client'
import { saveStoryboard } from '../utils/storage'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { parsed } = planStoryboardSchema.parse(body)

  // Track cost
  await trackCost('plan-storyboard', 0.002, { duration: parsed.meta.duration })

  try {
    // Collect all reference images (firstFrameImage, subjectReference, image, referenceImages)
    const referenceImages: string[] = []
    
    if (parsed.meta.firstFrameImage) {
      referenceImages.push(parsed.meta.firstFrameImage)
    }
    if (parsed.meta.subjectReference) {
      referenceImages.push(parsed.meta.subjectReference)
    }
    if (parsed.meta.image) {
      referenceImages.push(parsed.meta.image)
    }
    if (parsed.meta.referenceImages && Array.isArray(parsed.meta.referenceImages)) {
      referenceImages.push(...parsed.meta.referenceImages)
    }
    
    console.log(`[Plan Storyboard] Found ${referenceImages.length} reference image(s) to analyze`)
    
    // Generate storyboard with OpenAI MCP (pass reference images for analysis)
    const storyboardData = await callOpenAIMCP('plan_storyboard', {
      parsed,
      duration: parsed.meta.duration,
      style: parsed.meta.style,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      adType: parsed.meta.adType,
    })
    
    // Ensure storyboardData is an object
    const data = typeof storyboardData === 'string' ? JSON.parse(storyboardData) : storyboardData
    
    // Check if this is an async response with jobId
    if (data.jobId && data.status === 'pending') {
      // Return job ID for polling with metadata for status endpoint
      return {
        jobId: data.jobId,
        status: 'pending',
        meta: parsed.meta, // Include metadata for status endpoint
      }
    }
    
    // Handle synchronous response (backward compatibility)
    // Keep all segments - in demo mode, we'll only generate the first one during asset generation
    const segments = data.segments || []

    const storyboard = {
      id: nanoid(),
      segments,
      meta: {
        ...parsed.meta,
        mode: parsed.meta.mode || 'demo',
      },
      createdAt: Date.now(),
    }

    // Save to local storage
    await saveStoryboard(storyboard)

    return storyboard
  } catch (error: any) {
    console.error('Plan storyboard error:', error)
    throw createError({
      statusCode: 500,
      message: `Failed to plan storyboard: ${error.message}`,
    })
  }
})

