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
    const result = await callReplicateMCP('get_prediction_result', {
      predictionId,
    })

    return result
  } catch (error: any) {
    console.error('[Get Prediction Result] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get prediction result',
    })
  }
})

