import { callOpenAIMCP } from '../utils/mcp-client'
import { saveStoryboard } from '../utils/storage'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const jobId = body.id || body.jobId
  const meta = body.meta || {}

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

