import { promises as fs } from 'fs'
import path from 'path'
import type { CostEntry, CostSummary } from '../../app/types/generation'

const COSTS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'costs.json')

let costs: CostEntry[] = []

// Load costs from file
async function loadCosts() {
  try {
    const content = await fs.readFile(COSTS_FILE, 'utf-8')
    costs = JSON.parse(content)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      costs = []
      // Try to save, but don't fail if filesystem is read-only (e.g., Vercel)
      try {
        await saveCosts()
      } catch (saveError: any) {
        // Ignore filesystem errors in serverless environments
        console.warn('[Cost Tracker] Cannot save costs file (read-only filesystem):', saveError.message)
      }
    } else {
      // For other errors, just log and continue with empty costs array
      console.warn('[Cost Tracker] Cannot load costs file:', error.message)
      costs = []
    }
  }
}

// Save costs to file
async function saveCosts() {
  try {
    await fs.mkdir(path.dirname(COSTS_FILE), { recursive: true })
    await fs.writeFile(COSTS_FILE, JSON.stringify(costs, null, 2))
  } catch (error: any) {
    // In serverless environments (like Vercel), filesystem writes may fail
    // Log the error but don't throw - cost tracking is non-critical
    if (error.code === 'EROFS' || error.code === 'EACCES' || error.message?.includes('read-only')) {
      console.warn('[Cost Tracker] Cannot save costs (read-only filesystem):', error.message)
    } else {
      throw error
    }
  }
}

// Initialize on import - don't let failures prevent module from loading
loadCosts().catch((error) => {
  console.warn('[Cost Tracker] Failed to initialize:', error.message)
  costs = []
})

export async function trackCost(
  operation: string,
  amount: number,
  metadata?: Record<string, any>
): Promise<void> {
  const entry: CostEntry = {
    operation,
    amount,
    timestamp: Date.now(),
    metadata,
  }

  costs.push(entry)
  // Try to save, but don't fail if filesystem is read-only (e.g., Vercel)
  try {
    await saveCosts()
  } catch (error: any) {
    // In serverless environments, cost tracking may not be persistent
    // This is acceptable - cost tracking is non-critical
    console.warn('[Cost Tracker] Failed to save cost entry:', error.message)
  }
}

export async function getCostSummary(
  startTime?: number,
  endTime?: number
): Promise<CostSummary> {
  const start = startTime || 0
  const end = endTime || Date.now()

  const filtered = costs.filter(
    c => c.timestamp >= start && c.timestamp <= end
  )

  const byOperation = filtered.reduce((acc, cost) => {
    if (!acc[cost.operation]) {
      acc[cost.operation] = 0
    }
    acc[cost.operation] += cost.amount
    return acc
  }, {} as Record<string, number>)

  return {
    total: filtered.reduce((sum, c) => sum + c.amount, 0),
    byOperation,
    count: filtered.length,
  }
}

export async function getOperationCosts(operation?: string): Promise<{
  operation?: string
  total: number
  average: number
  count: number
  entries: CostEntry[]
}> {
  const filtered = operation
    ? costs.filter(c => c.operation === operation)
    : costs

  const total = filtered.reduce((sum, c) => sum + c.amount, 0)
  const average = total / (filtered.length || 1)

  return {
    operation,
    total,
    average,
    count: filtered.length,
    entries: filtered.slice(-10), // Last 10 entries
  }
}

export function getTotalCost(): number {
  return costs.reduce((sum, c) => sum + c.amount, 0)
}

