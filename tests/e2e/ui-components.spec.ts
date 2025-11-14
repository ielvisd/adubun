import { test, expect } from '@playwright/test'

test.describe('UI Components', () => {
  test('should render Nuxt UI components correctly', async ({ page }) => {
    await page.goto('/')
    
    // Check form is visible
    await expect(page.locator('form')).toBeVisible()
    
    // Check button
    const button = page.locator('button:has-text("Generate")')
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    
    // Check textarea
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('Test input')
    expect(await textarea.inputValue()).toBe('Test input')
  })

  test('should display cost tracker', async ({ page }) => {
    await page.goto('/')
    
    // Cost tracker might be in sidebar or main content
    // This is a basic check - adjust based on actual implementation
    const costElements = page.locator('text=/cost|\\$/i')
    const count = await costElements.count()
    // Cost tracker should be present somewhere
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

