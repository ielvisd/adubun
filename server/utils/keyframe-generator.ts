import { callOpenAIMCP } from './mcp-client'
import { callReplicateMCP } from './mcp-client'
import type { Segment, Story } from '~/types/generation'

/**
 * Keyframe Generator Utility
 * 
 * Orchestrates the GPT-4o-mini → Seedream 4 pipeline for generating
 * first and last frame keyframes for video segments.
 */

export interface KeyframeGenerationOptions {
  /** Story narrative for context */
  story?: Story
  /** Product name */
  productName: string
  /** Product reference images (1-10 images) */
  productImages: string[]
  /** Target aspect ratio */
  aspectRatio: '16:9' | '9:16' | '1:1'
  /** Output resolution */
  resolution?: '1K' | '2K' | '4K'
  /** All segments for context */
  allSegments: Segment[]
}

export interface KeyframeResult {
  /** Generated keyframe image URL */
  imageUrl: string
  /** Enhanced prompt used for generation */
  enhancedPrompt: string
  /** Prediction ID from Replicate */
  predictionId: string
  /** Type of keyframe */
  type: 'first' | 'last'
  /** Timestamp of generation */
  generatedAt: number
}

/**
 * Generate the first frame keyframe for a segment
 * 
 * @param segment - The segment to generate a keyframe for
 * @param segmentIndex - Index of the segment in the storyboard
 * @param options - Generation options
 * @returns Keyframe result with image URL and metadata
 */
export async function generateFirstFrame(
  segment: Segment,
  segmentIndex: number,
  options: KeyframeGenerationOptions
): Promise<KeyframeResult> {
  console.log('[Keyframe Generator] Generating first frame for segment:', segmentIndex, segment.type)

  // Step 1: Enhance the visual prompt with GPT-4o-mini
  const storyNarrative = options.story?.narrative || ''
  const previousSegment = segmentIndex > 0 ? options.allSegments[segmentIndex - 1] : undefined
  const nextSegment = segmentIndex < options.allSegments.length - 1 ? options.allSegments[segmentIndex + 1] : undefined

  console.log('[Keyframe Generator] Calling GPT-4o-mini for prompt enhancement...')
  const enhancementResult = await callOpenAIMCP('enhance_composition_prompt', {
    visualPrompt: segment.visualPrompt,
    segmentType: segment.type,
    segmentDescription: segment.description,
    storyNarrative,
    productName: options.productName,
    productImages: options.productImages,
    previousSegmentDescription: previousSegment?.description || '',
    nextSegmentDescription: nextSegment?.description || '',
    aspectRatio: options.aspectRatio,
    duration: segment.endTime - segment.startTime,
  })

  // Parse the enhanced prompt from MCP response
  let enhancedPrompt: string
  if (typeof enhancementResult === 'string') {
    enhancedPrompt = enhancementResult
  } else if (enhancementResult && typeof enhancementResult === 'object') {
    if ('content' in enhancementResult && typeof enhancementResult.content === 'string') {
      enhancedPrompt = enhancementResult.content
    } else if ('enhancedPrompt' in enhancementResult) {
      enhancedPrompt = (enhancementResult as any).enhancedPrompt
    } else {
      enhancedPrompt = JSON.stringify(enhancementResult)
    }
  } else {
    throw new Error('Invalid enhancement result from OpenAI MCP')
  }

  console.log('[Keyframe Generator] Enhanced prompt:', enhancedPrompt.substring(0, 100) + '...')

  // Step 2: Generate keyframe with Seedream 4
  console.log('[Keyframe Generator] Calling Seedream 4 for keyframe generation...')
  const keyframeResult = await callReplicateMCP('generate_keyframe', {
    enhancedPrompt,
    productImages: options.productImages,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution || '2K',
  })

  // Parse the Replicate response
  let predictionData: any
  if (typeof keyframeResult === 'string') {
    predictionData = JSON.parse(keyframeResult)
  } else if (keyframeResult && typeof keyframeResult === 'object') {
    if ('content' in keyframeResult && typeof keyframeResult.content === 'string') {
      predictionData = JSON.parse(keyframeResult.content)
    } else {
      predictionData = keyframeResult
    }
  } else {
    throw new Error('Invalid keyframe result from Replicate MCP')
  }

  console.log('[Keyframe Generator] Keyframe prediction created:', predictionData.predictionId)

  return {
    imageUrl: '', // Will be populated when prediction completes
    enhancedPrompt,
    predictionId: predictionData.predictionId || predictionData.id,
    type: 'first',
    generatedAt: Date.now(),
  }
}

/**
 * Generate the last frame keyframe for a segment
 * 
 * This considers the next segment for smooth transitions.
 * 
 * @param segment - The segment to generate a keyframe for
 * @param segmentIndex - Index of the segment in the storyboard
 * @param options - Generation options
 * @returns Keyframe result with image URL and metadata
 */
export async function generateLastFrame(
  segment: Segment,
  segmentIndex: number,
  options: KeyframeGenerationOptions
): Promise<KeyframeResult> {
  console.log('[Keyframe Generator] Generating last frame for segment:', segmentIndex, segment.type)

  // For last frame, emphasize transition to next segment
  const storyNarrative = options.story?.narrative || ''
  const previousSegment = segmentIndex > 0 ? options.allSegments[segmentIndex - 1] : undefined
  const nextSegment = segmentIndex < options.allSegments.length - 1 ? options.allSegments[segmentIndex + 1] : undefined

  // Modify the visual prompt to emphasize the end state and transition
  let lastFramePrompt = segment.visualPrompt
  if (nextSegment) {
    lastFramePrompt += ` The composition should set up a smooth transition to the next scene: ${nextSegment.description}. Maintain visual continuity while preparing for the shift in focus.`
  } else {
    // Final segment - emphasize closure
    lastFramePrompt += ` This is the final frame. The composition should provide visual closure and reinforce the call-to-action.`
  }

  console.log('[Keyframe Generator] Calling GPT-4o-mini for last frame enhancement...')
  const enhancementResult = await callOpenAIMCP('enhance_composition_prompt', {
    visualPrompt: lastFramePrompt,
    segmentType: segment.type,
    segmentDescription: `End of segment: ${segment.description}`,
    storyNarrative,
    productName: options.productName,
    productImages: options.productImages,
    previousSegmentDescription: previousSegment?.description || '',
    nextSegmentDescription: nextSegment?.description || '',
    aspectRatio: options.aspectRatio,
    duration: segment.endTime - segment.startTime,
  })

  // Parse the enhanced prompt
  let enhancedPrompt: string
  if (typeof enhancementResult === 'string') {
    enhancedPrompt = enhancementResult
  } else if (enhancementResult && typeof enhancementResult === 'object') {
    if ('content' in enhancementResult && typeof enhancementResult.content === 'string') {
      enhancedPrompt = enhancementResult.content
    } else if ('enhancedPrompt' in enhancementResult) {
      enhancedPrompt = (enhancementResult as any).enhancedPrompt
    } else {
      enhancedPrompt = JSON.stringify(enhancementResult)
    }
  } else {
    throw new Error('Invalid enhancement result from OpenAI MCP')
  }

  console.log('[Keyframe Generator] Enhanced last frame prompt:', enhancedPrompt.substring(0, 100) + '...')

  // Generate last frame keyframe
  console.log('[Keyframe Generator] Calling Seedream 4 for last frame generation...')
  const keyframeResult = await callReplicateMCP('generate_keyframe', {
    enhancedPrompt,
    productImages: options.productImages,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution || '2K',
  })

  // Parse the Replicate response
  let predictionData: any
  if (typeof keyframeResult === 'string') {
    predictionData = JSON.parse(keyframeResult)
  } else if (keyframeResult && typeof keyframeResult === 'object') {
    if ('content' in keyframeResult && typeof keyframeResult.content === 'string') {
      predictionData = JSON.parse(keyframeResult.content)
    } else {
      predictionData = keyframeResult
    }
  } else {
    throw new Error('Invalid keyframe result from Replicate MCP')
  }

  console.log('[Keyframe Generator] Last frame prediction created:', predictionData.predictionId)

  return {
    imageUrl: '', // Will be populated when prediction completes
    enhancedPrompt,
    predictionId: predictionData.predictionId || predictionData.id,
    type: 'last',
    generatedAt: Date.now(),
  }
}

/**
 * Generate both first and last frame keyframes for a segment
 * 
 * @param segment - The segment to generate keyframes for
 * @param segmentIndex - Index of the segment in the storyboard
 * @param options - Generation options
 * @returns Object with first and last keyframe results
 */
export async function generateKeyframesForSegment(
  segment: Segment,
  segmentIndex: number,
  options: KeyframeGenerationOptions
): Promise<{ first: KeyframeResult; last: KeyframeResult }> {
  console.log('[Keyframe Generator] Generating both keyframes for segment:', segmentIndex)

  // Generate both keyframes
  const [firstFrame, lastFrame] = await Promise.all([
    generateFirstFrame(segment, segmentIndex, options),
    generateLastFrame(segment, segmentIndex, options),
  ])

  return { first: firstFrame, last: lastFrame }
}

/**
 * Generate keyframes for all segments in a storyboard
 * 
 * @param segments - All segments to generate keyframes for
 * @param options - Generation options
 * @returns Array of keyframe results for each segment
 */
export async function generateKeyframesForAllSegments(
  segments: Segment[],
  options: Omit<KeyframeGenerationOptions, 'allSegments'>
): Promise<Array<{ first: KeyframeResult; last: KeyframeResult }>> {
  console.log('[Keyframe Generator] Generating keyframes for', segments.length, 'segments')

  const fullOptions: KeyframeGenerationOptions = {
    ...options,
    allSegments: segments,
  }

  // Generate keyframes for all segments in parallel
  const results = await Promise.all(
    segments.map((segment, index) =>
      generateKeyframesForSegment(segment, index, fullOptions)
    )
  )

  console.log('[Keyframe Generator] All keyframes generated successfully')

  return results
}

/**
 * Wait for a keyframe prediction to complete and return the image URL
 * 
 * @param predictionId - Replicate prediction ID
 * @param maxWaitTime - Maximum time to wait in milliseconds (default: 60000 = 1 minute)
 * @returns Image URL when prediction completes
 */
export async function waitForKeyframeCompletion(
  predictionId: string,
  maxWaitTime: number = 60000
): Promise<string> {
  const startTime = Date.now()
  const pollInterval = 2000 // Poll every 2 seconds

  console.log('[Keyframe Generator] Waiting for prediction:', predictionId)

  while (Date.now() - startTime < maxWaitTime) {
    const statusResult = await callReplicateMCP('get_prediction_result', {
      predictionId,
    })

    let predictionData: any
    if (typeof statusResult === 'string') {
      predictionData = JSON.parse(statusResult)
    } else if (statusResult && typeof statusResult === 'object') {
      if ('content' in statusResult && typeof statusResult.content === 'string') {
        predictionData = JSON.parse(statusResult.content)
      } else {
        predictionData = statusResult
      }
    }

    if (predictionData.status === 'succeeded') {
      const imageUrl = Array.isArray(predictionData.output) 
        ? predictionData.output[0] 
        : predictionData.output

      console.log('[Keyframe Generator] Prediction completed:', imageUrl)
      return imageUrl
    }

    if (predictionData.status === 'failed') {
      throw new Error(`Keyframe generation failed: ${predictionData.error || 'Unknown error'}`)
    }

    // Still processing, wait and poll again
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Keyframe generation timed out after ${maxWaitTime}ms`)
}

