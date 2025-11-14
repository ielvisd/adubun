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
    // Generate storyboard with OpenAI MCP
    const storyboardData = await callOpenAIMCP('plan_storyboard', {
      parsed,
      duration: parsed.meta.duration,
      style: parsed.meta.style,
    })
    
    // Ensure storyboardData is an object
    const data = typeof storyboardData === 'string' ? JSON.parse(storyboardData) : storyboardData
    
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

