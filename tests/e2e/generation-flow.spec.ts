import { test, expect } from '@playwright/test'

test.describe('Video Generation Flow', () => {
  test('should generate video from prompt', async ({ page }) => {
    // Navigate to home page
    await page.goto('/')
    
    // Fill in prompt
    await page.fill('textarea[placeholder*="Describe"]', 
      'Create a 30s Instagram ad for luxury watches with elegant gold aesthetics'
    )
    
    // Select duration
    await page.selectOption('select', { index: 1 }) // 30 seconds
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Wait for generation page
    await expect(page).toHaveURL(/\/generate/, { timeout: 10000 })
    
    // Check progress indicator appears
    await expect(page.locator('[role="progressbar"], .progress, [class*="progress"]')).toBeVisible({ timeout: 5000 })
  })

  test('should handle invalid prompts', async ({ page }) => {
    await page.goto('/')
    
    // Try to submit empty form
    await page.click('button[type="submit"]')
    
    // Should show validation error or prevent submission
    // This depends on form validation implementation
    const errorVisible = await page.locator('text=/required|invalid|error/i').isVisible().catch(() => false)
    expect(errorVisible).toBeTruthy()
  })
})

