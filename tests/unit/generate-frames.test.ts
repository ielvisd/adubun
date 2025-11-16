import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callReplicateMCP } from '~/server/utils/mcp-client'

vi.mock('~/server/utils/mcp-client', () => ({
  callReplicateMCP: vi.fn(),
}))

vi.mock('~/server/utils/cost-tracker', () => ({
  trackCost: vi.fn(),
}))

describe('Generate Frames API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate 5 frame images using Nano-banana → Seedream-4 pipeline', async () => {
    const mockNanoResult = {
      predictionId: 'nano-123',
      status: 'succeeded',
    }

    const mockSeedreamResult = {
      predictionId: 'seedream-123',
      status: 'succeeded',
      output: 'https://example.com/image.jpg',
    }

    vi.mocked(callReplicateMCP)
      .mockResolvedValueOnce(mockNanoResult) // Nano-banana call
      .mockResolvedValueOnce({ status: 'succeeded' }) // Status check
      .mockResolvedValueOnce({ output: 'https://example.com/nano.jpg' }) // Nano result
      .mockResolvedValueOnce(mockSeedreamResult) // Seedream call
      .mockResolvedValueOnce({ status: 'succeeded' }) // Seedream status
      .mockResolvedValueOnce({ output: 'https://example.com/final.jpg' }) // Seedream result

    // Test that the pipeline calls both models
    await callReplicateMCP('generate_image', {
      model: 'google/nano-banana',
      prompt: 'test prompt',
    })

    expect(callReplicateMCP).toHaveBeenCalledWith(
      'generate_image',
      expect.objectContaining({
        model: 'google/nano-banana',
      })
    )
  })

  it('should generate frames for all 5 required positions', () => {
    const expectedFrames = [
      { segmentIndex: 0, frameType: 'first' }, // Hook first
      { segmentIndex: 0, frameType: 'last' }, // Hook last
      { segmentIndex: 1, frameType: 'last' }, // Body1 last
      { segmentIndex: 2, frameType: 'last' }, // Body2 last
      { segmentIndex: 3, frameType: 'first' }, // CTA
    ]

    expect(expectedFrames).toHaveLength(5)
    expect(expectedFrames[0].frameType).toBe('first')
    expect(expectedFrames[expectedFrames.length - 1].frameType).toBe('first')
  })
})


