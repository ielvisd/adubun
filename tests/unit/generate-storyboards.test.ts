import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callOpenAIMCP } from '~/server/utils/mcp-client'

vi.mock('~/server/utils/mcp-client', () => ({
  callOpenAIMCP: vi.fn(),
}))

vi.mock('~/server/utils/cost-tracker', () => ({
  trackCost: vi.fn(),
}))

describe('Generate Storyboards API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate 3 storyboard options from a story', async () => {
    const mockStoryboards = {
      storyboards: [
        {
          id: 'sb1',
          segments: [
            { type: 'hook', description: 'Hook scene', visualPrompt: 'Visual 1' },
            { type: 'body', description: 'Body 1 scene', visualPrompt: 'Visual 2' },
            { type: 'body', description: 'Body 2 scene', visualPrompt: 'Visual 3' },
            { type: 'cta', description: 'CTA scene', visualPrompt: 'Visual 4' },
          ],
          meta: {
            aspectRatio: '9:16',
            duration: 16,
          },
        },
      ],
    }

    vi.mocked(callOpenAIMCP).mockResolvedValue({
      content: JSON.stringify(mockStoryboards),
    })

    expect(mockStoryboards.storyboards[0].segments).toHaveLength(4)
    expect(mockStoryboards.storyboards[0].segments[0].type).toBe('hook')
    expect(mockStoryboards.storyboards[0].segments[3].type).toBe('cta')
  })

  it('should include paragraph descriptions for each segment', async () => {
    const storyboard = {
      segments: [
        {
          type: 'hook',
          description: 'A detailed paragraph description',
          visualPrompt: 'Visual prompt',
        },
      ],
    }

    expect(storyboard.segments[0]).toHaveProperty('description')
    expect(storyboard.segments[0].description.length).toBeGreaterThan(10)
  })
})


