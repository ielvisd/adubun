import { getCostSummary } from '../../utils/cost-tracker'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const startTime = query.startTime ? parseInt(query.startTime as string) : undefined
  const endTime = query.endTime ? parseInt(query.endTime as string) : undefined

  // Get cost summary from last 24 hours if not specified
  const start = startTime || Date.now() - 24 * 60 * 60 * 1000
  const end = endTime || Date.now()

  const summary = await getCostSummary(start, end)

  return {
    current: summary.total,
    estimated: summary.total * 1.2, // Add 20% buffer
    breakdown: summary.byOperation,
    count: summary.count,
  }
})

