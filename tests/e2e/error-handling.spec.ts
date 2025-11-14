import { test, expect } from '@playwright/test'

test.describe('Error Handling', () => {
  test('should display error messages for API failures', async ({ page }) => {
    // Intercept API calls and force error
    await page.route('**/api/parse-prompt', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.goto('/')
    
    await page.fill('textarea', 'Test prompt')
    await page.click('button[type="submit"]')
    
    // Should show error notification
    await expect(page.locator('text=/error|failed/i')).toBeVisible({ timeout: 5000 })
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Block network requests
    await page.route('**/*', route => route.abort())

    await page.goto('/')
    
    // Page should still load (with cached resources)
    await expect(page.locator('body')).toBeVisible()
  })
})

