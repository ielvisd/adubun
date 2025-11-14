import { trackCost } from '../../utils/cost-tracker'
import { z } from 'zod'

const trackSchema = z.object({
  operation: z.string(),
  amount: z.number(),
  metadata: z.record(z.any()).optional(),
})

export default defineEventHandler(async (event) => {
  const body = trackSchema.parse(await readBody(event))

  await trackCost(body.operation, body.amount, body.metadata)

  return {
    success: true,
    tracked: {
      operation: body.operation,
      amount: body.amount,
    },
  }
})

