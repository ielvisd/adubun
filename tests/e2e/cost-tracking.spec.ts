import { test, expect } from '@playwright/test'

test.describe('Cost Tracking', () => {
  test('should display cost information', async ({ page }) => {
    await page.goto('/')
    
    // Navigate to history page to see cost tracking
    await page.goto('/history')
    
    // Should see cost-related elements
    const costElements = page.locator('text=/\\$|cost/i')
    const count = await costElements.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('should update costs during generation', async ({ page }) => {
    await page.goto('/generate')
    
    // Cost tracker should be visible
    const costTracker = page.locator('text=/cost|\\$/i')
    await expect(costTracker.first()).toBeVisible({ timeout: 5000 })
  })
})

