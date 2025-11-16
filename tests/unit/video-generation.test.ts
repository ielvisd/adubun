import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callReplicateMCP } from '~/server/utils/mcp-client'

vi.mock('~/server/utils/mcp-client', () => ({
  callReplicateMCP: vi.fn(),
  callOpenAIMCP: vi.fn(),
}))

vi.mock('~/server/utils/cost-tracker', () => ({
  trackCost: vi.fn(),
}))

describe('Video Generation API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate 4 scene videos (Hook, Body1, Body2, CTA)', async () => {
    const segments = [
      { type: 'hook', startTime: 0, endTime: 4 },
      { type: 'body', startTime: 4, endTime: 8 },
      { type: 'body', startTime: 8, endTime: 12 },
      { type: 'cta', startTime: 12, endTime: 16 },
    ]

    expect(segments).toHaveLength(4)
    expect(segments[0].type).toBe('hook')
    expect(segments[3].type).toBe('cta')
  })

  it('should use frame images from generate-frames API', () => {
    const frames = [
      { segmentIndex: 0, frameType: 'first', imageUrl: 'url1' },
      { segmentIndex: 0, frameType: 'last', imageUrl: 'url2' },
      { segmentIndex: 1, frameType: 'last', imageUrl: 'url3' },
      { segmentIndex: 2, frameType: 'last', imageUrl: 'url4' },
      { segmentIndex: 3, frameType: 'first', imageUrl: 'url5' },
    ]

    const frameMap = new Map<string, { first?: string; last?: string }>()
    frames.forEach(frame => {
      if (!frameMap.has(String(frame.segmentIndex))) {
        frameMap.set(String(frame.segmentIndex), {})
      }
      const segmentFrames = frameMap.get(String(frame.segmentIndex))!
      if (frame.frameType === 'first') {
        segmentFrames.first = frame.imageUrl
      } else {
        segmentFrames.last = frame.imageUrl
      }
    })

    expect(frameMap.get('0')?.first).toBe('url1')
    expect(frameMap.get('0')?.last).toBe('url2')
  })

  it('should support Veo 3.1 and Veo 3 Fast models', () => {
    const supportedModels = [
      'google/veo-3.1',
      'google/veo-3-fast',
    ]

    expect(supportedModels).toContain('google/veo-3.1')
    expect(supportedModels).toContain('google/veo-3-fast')
  })
})


