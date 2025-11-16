import { ref, computed } from 'vue'
import type { Segment, Story } from '~/types/generation'

export interface KeyframeGenerationOptions {
  segment: Segment
  segmentIndex: number
  productName: string
  productImages: string[]
  aspectRatio: '16:9' | '9:16' | '1:1'
  resolution?: '1K' | '2K' | '4K'
  story?: Story
  allSegments: Segment[]
  waitForCompletion?: boolean
}

export interface KeyframeResult {
  first: {
    predictionId: string
    enhancedPrompt: string
    type: 'first'
    generatedAt: number
    status: string
    imageUrl?: string
  }
  last: {
    predictionId: string
    enhancedPrompt: string
    type: 'last'
    generatedAt: number
    status: string
    imageUrl?: string
  }
}

export function useKeyframeGeneration() {
  const isGenerating = ref(false)
  const error = ref<string | null>(null)
  const progress = ref(0)

  /**
   * Generate keyframes for a single segment
   */
  async function generateKeyframes(
    options: KeyframeGenerationOptions
  ): Promise<KeyframeResult | null> {
    isGenerating.value = true
    error.value = null
    progress.value = 0

    try {
      console.log('[useKeyframeGeneration] Generating keyframes:', options.segment.type)

      const response = await $fetch<KeyframeResult>('/api/generate-keyframes', {
        method: 'POST',
        body: {
          segment: options.segment,
          segmentIndex: options.segmentIndex,
          productName: options.productName,
          productImages: options.productImages,
          aspectRatio: options.aspectRatio,
          resolution: options.resolution || '2K',
          story: options.story,
          allSegments: options.allSegments,
          waitForCompletion: options.waitForCompletion || false,
        },
      })

      progress.value = 100
      console.log('[useKeyframeGeneration] Keyframes generated successfully')

      return response
    } catch (err: any) {
      console.error('[useKeyframeGeneration] Generation failed:', err)
      error.value = err.message || 'Failed to generate keyframes'
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Generate keyframes for all segments in a storyboard
   */
  async function generateAllKeyframes(
    segments: Segment[],
    options: Omit<KeyframeGenerationOptions, 'segment' | 'segmentIndex' | 'allSegments'>
  ): Promise<Map<number, KeyframeResult>> {
    isGenerating.value = true
    error.value = null
    progress.value = 0

    const results = new Map<number, KeyframeResult>()

    try {
      console.log('[useKeyframeGeneration] Generating keyframes for', segments.length, 'segments')

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        
        // Skip if keyframes already exist
        if (segment.firstFrameUrl && segment.lastFrameUrl && segment.keyframeStatus === 'completed') {
          console.log(`[useKeyframeGeneration] Segment ${i} already has keyframes, skipping`)
          progress.value = Math.round(((i + 1) / segments.length) * 100)
          continue
        }

        const result = await generateKeyframes({
          segment,
          segmentIndex: i,
          allSegments: segments,
          ...options,
        })

        if (result) {
          results.set(i, result)
        }

        progress.value = Math.round(((i + 1) / segments.length) * 100)
      }

      console.log('[useKeyframeGeneration] All keyframes generated:', results.size)
      return results
    } catch (err: any) {
      console.error('[useKeyframeGeneration] Bulk generation failed:', err)
      error.value = err.message || 'Failed to generate all keyframes'
      return results
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Poll for keyframe completion
   */
  async function pollKeyframeStatus(
    predictionId: string,
    maxAttempts: number = 30,
    interval: number = 2000
  ): Promise<string | null> {
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        // Use the Replicate status endpoint
        const result = await $fetch<any>('/api/get-prediction-result', {
          method: 'POST',
          body: { predictionId },
        })

        if (result.status === 'succeeded') {
          const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output
          console.log('[useKeyframeGeneration] Keyframe completed:', imageUrl)
          return imageUrl
        }

        if (result.status === 'failed') {
          throw new Error(result.error || 'Keyframe generation failed')
        }

        // Still processing, wait and retry
        await new Promise(resolve => setTimeout(resolve, interval))
        attempts++
      } catch (err: any) {
        console.error('[useKeyframeGeneration] Poll error:', err)
        throw err
      }
    }

    throw new Error('Keyframe generation timed out')
  }

  /**
   * Retry keyframe generation for a failed segment
   */
  async function retryKeyframe(
    options: KeyframeGenerationOptions
  ): Promise<KeyframeResult | null> {
    console.log('[useKeyframeGeneration] Retrying keyframe generation')
    return generateKeyframes(options)
  }

  // Computed state
  const hasError = computed(() => error.value !== null)
  const isComplete = computed(() => progress.value === 100 && !isGenerating.value)

  return {
    // State
    isGenerating,
    error,
    progress,
    hasError,
    isComplete,

    // Methods
    generateKeyframes,
    generateAllKeyframes,
    pollKeyframeStatus,
    retryKeyframe,
  }
}

