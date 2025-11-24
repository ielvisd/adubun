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
    
    // Generate storyboard with OpenAI MCP (or direct API fallback in serverless environments)
    // The MCP client will automatically use direct API on Vercel/serverless
    let storyboardData: any
    try {
      storyboardData = await callOpenAIMCP('plan_storyboard', {
        parsed,
        duration: parsed.meta.duration,
        style: parsed.meta.style,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        adType: parsed.meta.adType,
      })
    } catch (mcpError: any) {
      console.error('[Plan Storyboard] MCP call failed:', mcpError)
      // The MCP client should have already tried direct API fallback
      // If we get here, both MCP and direct API failed
      throw new Error(`Failed to plan storyboard: ${mcpError.message || 'Unknown error'}. Please check your OPENAI_API_KEY environment variable.`)
    }
    
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
        mode: parsed.meta.mode || 'production',
      },
      createdAt: Date.now(),
    }

    // Save to local storage (non-critical, will fail gracefully on Vercel)
    try {
      await saveStoryboard(storyboard)
    } catch (saveError: any) {
      // Don't fail the request if saving fails (e.g., on Vercel)
      console.warn('[Plan Storyboard] Failed to save storyboard to disk:', saveError.message)
    }

    return storyboard
  } catch (error: any) {
    console.error('[Plan Storyboard] Error:', error)
    console.error('[Plan Storyboard] Error message:', error.message)
    console.error('[Plan Storyboard] Error code:', error.code)
    console.error('[Plan Storyboard] Error stack:', error.stack)
    
    // Check for MCP/child process errors
    if (error.message?.includes('MCP') || 
        error.message?.includes('spawn') || 
        error.message?.includes('child process') ||
        error.code === 'EPIPE' ||
        error.code === 'ENOENT') {
      throw createError({
        statusCode: 500,
        message: `Storyboard planning failed: MCP server unavailable. This may be a serverless environment limitation. Please check server logs.`,
        data: {
          originalError: error.message,
          code: error.code,
        },
      })
    }
    
    throw createError({
      statusCode: 500,
      message: `Failed to plan storyboard: ${error.message}`,
      data: {
        originalError: error.message,
        code: error.code,
      },
    })
  }
})

