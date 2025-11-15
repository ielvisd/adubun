import { callReplicateMCP } from '../utils/mcp-client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { predictionId } = body

  if (!predictionId) {
    throw createError({
      statusCode: 400,
      message: 'Prediction ID is required',
    })
  }

  try {
    const status = await callReplicateMCP('check_prediction_status', {
      predictionId,
    })

    return status
  } catch (error: any) {
    console.error('[Check Prediction Status] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to check prediction status',
    })
  }
})

