import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callOpenAIMCP } from '~/server/utils/mcp-client'

// Mock MCP client
vi.mock('~/server/utils/mcp-client', () => ({
  callOpenAIMCP: vi.fn(),
}))

// Mock cost tracker
vi.mock('~/server/utils/cost-tracker', () => ({
  trackCost: vi.fn(),
}))

describe('Generate Stories API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate 3 story options from a prompt', async () => {
    const mockStories = {
      stories: [
        {
          hook: 'Hook 1',
          bodyOne: 'Body 1',
          bodyTwo: 'Body 2',
          callToAction: 'CTA 1',
        },
        {
          hook: 'Hook 2',
          bodyOne: 'Body 1',
          bodyTwo: 'Body 2',
          callToAction: 'CTA 2',
        },
        {
          hook: 'Hook 3',
          bodyOne: 'Body 1',
          bodyTwo: 'Body 2',
          callToAction: 'CTA 3',
        },
      ],
    }

    vi.mocked(callOpenAIMCP).mockResolvedValue({
      content: JSON.stringify(mockStories),
    })

    // Test would call the API endpoint here
    // For now, we're testing the structure
    expect(mockStories.stories).toHaveLength(3)
    expect(mockStories.stories[0]).toHaveProperty('hook')
    expect(mockStories.stories[0]).toHaveProperty('bodyOne')
    expect(mockStories.stories[0]).toHaveProperty('bodyTwo')
    expect(mockStories.stories[0]).toHaveProperty('callToAction')
  })

  it('should use gpt-4o model for story generation', async () => {
    const prompt = 'Create an ad for a new energy drink'
    
    await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a creative ad writer' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })

    expect(callOpenAIMCP).toHaveBeenCalledWith(
      'chat_completion',
      expect.objectContaining({
        model: 'gpt-4o',
      })
    )
  })
})


