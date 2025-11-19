import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import type { Storyboard, Character } from '~/types/generation'

const enhanceFramesSchema = z.object({
  storyboard: z.object({
    id: z.string(),
    segments: z.array(z.object({
      type: z.enum(['hook', 'body', 'cta']),
      description: z.string(),
      visualPrompt: z.string(),
      firstFrameImage: z.string().optional(),
      lastFrameImage: z.string().optional(),
    })),
    characters: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string(),
      gender: z.enum(['male', 'female', 'non-binary', 'unspecified']),
      age: z.string().optional(),
      physicalFeatures: z.string().optional(),
      clothing: z.string().optional(),
      role: z.string(),
    })).optional(),
    meta: z.object({
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
    }),
  }),
})

const getDimensions = (aspectRatio: string) => {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 }
    case '16:9':
      return { width: 1920, height: 1080 }
    case '1:1':
      return { width: 1080, height: 1080 }
    default:
      return { width: 1080, height: 1920 }
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { storyboard } = enhanceFramesSchema.parse(body)
    
    console.log(`[Enhance Frames] Starting enhancement for storyboard: ${storyboard.id}`)
    
    const aspectRatio = storyboard.meta.aspectRatio
    const dimensions = getDimensions(aspectRatio)
    const characters: Character[] = storyboard.characters || []
    
    // Collect all frames that need enhancement
    const framesToEnhance: Array<{
      segmentIndex: number
      frameType: 'first' | 'last'
      nanoImageUrl: string
      visualPrompt: string
    }> = []
    
    storyboard.segments.forEach((segment, index) => {
      if (segment.firstFrameImage) {
        framesToEnhance.push({
          segmentIndex: index,
          frameType: 'first',
          nanoImageUrl: segment.firstFrameImage,
          visualPrompt: segment.visualPrompt,
        })
      }
      if (segment.lastFrameImage) {
        framesToEnhance.push({
          segmentIndex: index,
          frameType: 'last',
          nanoImageUrl: segment.lastFrameImage,
          visualPrompt: segment.visualPrompt,
        })
      }
    })
    
    console.log(`[Enhance Frames] Found ${framesToEnhance.length} frames to enhance`)
    
    if (framesToEnhance.length === 0) {
      return {
        success: false,
        error: 'No frames found to enhance',
        enhancedFrames: [],
      }
    }
    
    // Helper function to enhance a single frame with seedream-4
    const enhanceSingleFrame = async (
      segmentIndex: number,
      frameType: 'first' | 'last',
      nanoImageUrl: string,
      visualPrompt: string
    ): Promise<{
      segmentIndex: number
      frameType: 'first' | 'last'
      imageUrl: string
      modelSource: 'seedream-4' | 'nano-banana'
      nanoImageUrl: string
      seedreamImageUrl?: string
      error?: string
    }> => {
      try {
        console.log(`[Enhance Frames] Enhancing segment ${segmentIndex} ${frameType} frame`)
        
        // Build seedream prompt with character preservation
        const characterPreservationInstruction = characters.length > 0
          ? `PRESERVE CHARACTER APPEARANCE: Maintain exact character appearance from input image - same gender, age, physical features (hair color/style, build), and clothing for each character. Do not alter character appearance in any way. The same characters from previous scenes must appear with identical appearance. `
          : ''
        
        const referenceMatchInstruction = 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. '
        
        const seedreamPrompt = `${characterPreservationInstruction}${referenceMatchInstruction}${visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images, limit scene to 3-4 people maximum, sharp faces, clear facial features, detailed faces, professional portrait quality, avoid large groups or crowds, ${aspectRatio} aspect ratio`
        
        console.log(`[Enhance Frames] Starting seedream-4 for segment ${segmentIndex} ${frameType}`)
        
        const seedreamResult = await callReplicateMCP('generate_image', {
          model: 'bytedance/seedream-4',
          prompt: seedreamPrompt,
          image_input: [nanoImageUrl],
          size: 'custom',
          width: dimensions.width,
          height: dimensions.height,
          aspect_ratio: aspectRatio,
          enhance_prompt: true,
        })
        
        const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
        if (!seedreamPredictionId) {
          throw new Error('Seedream-4 did not return a prediction ID')
        }
        
        console.log(`[Enhance Frames] Seedream-4 prediction ID: ${seedreamPredictionId}`)
        
        // Poll for Seedream-4 result with timeout (3 minutes)
        let seedreamStatus = 'starting'
        let seedreamAttempts = 0
        const maxAttempts = 90
        
        while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
          seedreamStatus = statusResult.status || 'starting'
          seedreamAttempts++
          
          if (seedreamAttempts % 10 === 0) {
            console.log(`[Enhance Frames] Polling attempt ${seedreamAttempts}/${maxAttempts}, status: ${seedreamStatus}`)
          }
          
          if (seedreamStatus === 'succeeded') {
            const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
            const seedreamResultUrl = seedreamResultData.videoUrl || seedreamResultData.output || seedreamResultData.url
            
            if (seedreamResultUrl) {
              console.log(`[Enhance Frames] Seedream-4 succeeded for segment ${segmentIndex} ${frameType}`)
              return {
                segmentIndex,
                frameType,
                imageUrl: seedreamResultUrl,
                modelSource: 'seedream-4',
                nanoImageUrl,
                seedreamImageUrl: seedreamResultUrl,
              }
            } else {
              throw new Error('Seedream-4 result does not contain a valid URL')
            }
          } else if (seedreamStatus === 'failed') {
            const errorMessage = statusResult.error || 'Unknown error'
            throw new Error(`Seedream-4 failed: ${errorMessage}`)
          }
        }
        
        if (seedreamAttempts >= maxAttempts) {
          throw new Error('Seedream-4 timed out after 3 minutes')
        }
        
        // This shouldn't be reached, but just in case
        throw new Error('Seedream-4 enhancement failed unexpectedly')
        
      } catch (error: any) {
        console.error(`[Enhance Frames] Error enhancing segment ${segmentIndex} ${frameType}:`, error.message)
        // Return original nano-banana image as fallback
        return {
          segmentIndex,
          frameType,
          imageUrl: nanoImageUrl,
          modelSource: 'nano-banana',
          nanoImageUrl,
          error: error.message || 'Enhancement failed',
        }
      }
    }
    
    // Enhance all frames (can be done in parallel for speed)
    console.log(`[Enhance Frames] Starting parallel enhancement of ${framesToEnhance.length} frames`)
    const enhancementPromises = framesToEnhance.map(frame => 
      enhanceSingleFrame(frame.segmentIndex, frame.frameType, frame.nanoImageUrl, frame.visualPrompt)
    )
    
    const enhancedFrames = await Promise.all(enhancementPromises)
    
    // Count successes and failures
    const successCount = enhancedFrames.filter(f => f.modelSource === 'seedream-4').length
    const failureCount = enhancedFrames.filter(f => f.error).length
    
    console.log(`[Enhance Frames] Enhancement complete: ${successCount} succeeded, ${failureCount} failed`)
    
    // Track cost (estimate ~$0.03 per seedream enhancement)
    await trackCost('enhance-frames', 0.03 * successCount, {
      frameCount: enhancedFrames.length,
      successCount,
      failureCount,
      storyboardId: storyboard.id,
    })
    
    return {
      success: true,
      enhancedFrames,
      summary: {
        total: enhancedFrames.length,
        enhanced: successCount,
        failed: failureCount,
      },
    }
  } catch (error: any) {
    console.error('[Enhance Frames] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to enhance frames',
    })
  }
})

