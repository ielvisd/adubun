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
      await saveCosts()
    } else {
      throw error
    }
  }
}

// Save costs to file
async function saveCosts() {
  await fs.mkdir(path.dirname(COSTS_FILE), { recursive: true })
  await fs.writeFile(COSTS_FILE, JSON.stringify(costs, null, 2))
}

// Initialize on import
loadCosts().catch(console.error)

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
  await saveCosts()
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

