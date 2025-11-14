import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/')
    
    // Tab through form elements
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['TEXTAREA', 'INPUT', 'BUTTON']).toContain(focused)
  })

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/')
    
    // Check form has labels
    const labels = page.locator('label')
    const count = await labels.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should have semantic HTML structure', async ({ page }) => {
    await page.goto('/')
    
    // Check for semantic elements
    const main = page.locator('main, [role="main"]')
    await expect(main.first()).toBeVisible()
  })
})

