import { callOpenAIMCP } from '../utils/mcp-client'
import { saveStoryboard } from '../utils/storage'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  // Support both GET (with query params) and POST (with body) for backward compatibility
  const method = getMethod(event)
  let jobId: string
  let meta: any = {}

  if (method === 'POST') {
    const body = await readBody(event)
    jobId = body.id || body.jobId
    meta = body.meta || {}
  } else {
    const query = getQuery(event)
    jobId = query.id as string
    // For GET, only parse meta if it's small enough (backward compatibility)
    if (query.meta && typeof query.meta === 'string' && query.meta.length < 1000) {
      try {
        meta = JSON.parse(query.meta)
      } catch (e) {
        // Ignore parse errors for backward compatibility
      }
    }
  }

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Job ID is required',
    })
  }

  try {
    // Check job status via MCP
    const statusData = await callOpenAIMCP('check_storyboard_status', {
      jobId,
    })

    // Ensure statusData is an object
    const data = typeof statusData === 'string' ? JSON.parse(statusData) : statusData

    // If job is completed, process the result
    if (data.status === 'completed' && data.result) {
      const segments = data.result.segments || []

      const storyboard = {
        id: nanoid(),
        segments,
        meta: {
          ...meta,
          mode: meta.mode || 'production',
        },
        createdAt: Date.now(),
      }

      // Save to local storage
      await saveStoryboard(storyboard)

      return {
        status: 'completed',
        storyboard,
      }
    }

    // Return current status
    return {
      status: data.status,
      error: data.error,
    }
  } catch (error: any) {
    console.error('Check storyboard status error:', error)
    throw createError({
      statusCode: 500,
      message: `Failed to check storyboard status: ${error.message}`,
    })
  }
})

