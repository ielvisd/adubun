import { z } from 'zod'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import type { Storyboard, Segment } from '~/types/generation'

const generateFramesSchema = z.object({
  storyboard: z.object({
    id: z.string(),
    segments: z.array(z.object({
      type: z.enum(['hook', 'body', 'cta']),
      description: z.string(),
      visualPrompt: z.string(),
      startTime: z.number(),
      endTime: z.number(),
    })),
    meta: z.object({
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      mode: z.enum(['demo', 'production']).optional(),
    }),
  }),
  productImages: z.array(z.string()).optional(),
  story: z.object({
    description: z.string(),
    hook: z.string(),
    bodyOne: z.string(),
    bodyTwo: z.string(),
    callToAction: z.string(),
  }),
  mode: z.enum(['demo', 'production']).optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    console.log(`[Generate Frames] Raw body received - productImages type:`, typeof body.productImages)
    console.log(`[Generate Frames] Raw body received - productImages is array:`, Array.isArray(body.productImages))
    console.log(`[Generate Frames] Raw body received - productImages length:`, body.productImages?.length || 0)
    if (body.productImages && body.productImages.length > 0) {
      console.log(`[Generate Frames] Raw body received - first 3 productImages:`, body.productImages.slice(0, 3))
    }
    
    const { storyboard, productImages = [], story, mode } = generateFramesSchema.parse(body)
    
    console.log(`[Generate Frames] After parsing - productImages type:`, typeof productImages)
    console.log(`[Generate Frames] After parsing - productImages is array:`, Array.isArray(productImages))
    console.log(`[Generate Frames] After parsing - productImages length:`, productImages.length)
    if (productImages.length > 0) {
      console.log(`[Generate Frames] After parsing - first 3 productImages:`, productImages.slice(0, 3))
    }
    
    // Determine mode: use explicit mode param, then storyboard meta, then default to production
    const generationMode = mode || storyboard.meta.mode || 'production'
    console.log(`[Generate Frames] Mode: ${generationMode}`)

    // According to PRD, we need to generate 5 frame images:
    // 1. Hook first frame (using hook paragraph + story description)
    // 2. Hook last frame (using hook + body1 paragraphs)
    // 3. Body1 last frame (using body1 + body2 paragraphs)
    // 4. Body2 last frame (using body2 + CTA paragraphs)
    // 5. CTA frame (using CTA paragraph)

    // But actually, looking at the PRD more carefully, it seems like we need:
    // - Hook first frame (for hook scene start)
    // - Hook last frame (for hook scene end, transition to body1)
    // - Body1 last frame (for body1 scene end, transition to body2)
    // - Body2 last frame (for body2 scene end, transition to CTA)
    // - CTA frame (for CTA scene)

    // However, the PRD mentions "5 frame images" so let's generate:
    // 1. Hook first frame
    // 2. Hook last frame (transition to body1)
    // 3. Body1 last frame (transition to body2)
    // 4. Body2 last frame (transition to CTA)
    // 5. CTA frame

    const frames: Array<{ 
      segmentIndex: number; 
      frameType: 'first' | 'last'; 
      imageUrl: string; 
      modelSource?: 'nano-banana' | 'seedream-4';
      nanoImageUrl?: string;
      seedreamImageUrl?: string;
    }> = []
    const aspectRatio = storyboard.meta.aspectRatio

    // Determine image dimensions based on aspect ratio
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

    const dimensions = getDimensions(aspectRatio)

    // Log product images
    console.log(`[Generate Frames] Product images: ${productImages.length} images`)
    if (productImages.length > 0) {
      console.log(`[Generate Frames] Product image URLs:`, productImages)
    }
    
    // Use all available reference images (up to model limit of 10)
    const referenceImages = productImages.length > 0 ? productImages.slice(0, 10) : []

    // Helper function to build prompts that emphasize matching reference images
    const buildNanoPrompt = (storyText: string, visualPrompt: string, isTransition: boolean = false, transitionText?: string, transitionVisual?: string) => {
      const hasReferenceImages = referenceImages.length > 0
      
      // Build the base prompt parts with full scene context for continuity
      let basePrompt = ''
      if (isTransition && transitionText && transitionVisual) {
        // Include both current scene AND full next scene for continuity
        basePrompt = `Current scene: ${storyText}, ${visualPrompt}. Transitioning to next scene: ${transitionText}, ${transitionVisual}`
      } else {
        basePrompt = `${storyText}, ${visualPrompt}`
      }
      
      // Add product consistency and reference image instructions if we have reference images
      if (hasReferenceImages) {
        const productConsistencyInstruction = `CRITICAL INSTRUCTIONS: Do not add new products to the scene. Only enhance existing products shown in the reference images. Keep product design and style exactly as shown in references. The reference images provided are the EXACT product you must recreate. You MUST copy the product from the reference images with pixel-perfect accuracy. Do NOT create a different product, do NOT use different colors, do NOT change the design, do NOT hallucinate new products. The product in your generated image must be visually IDENTICAL to the product in the reference images. Study every detail: exact color codes, exact design patterns, exact text/fonts, exact materials, exact textures, exact proportions, exact placement. The reference images are your ONLY source of truth for the product appearance. Ignore any text in the prompt that contradicts the reference images - the reference images take absolute priority. Generate the EXACT same product as shown in the reference images. `
        return `${productConsistencyInstruction}${basePrompt}, professional product photography, high quality, product must be pixel-perfect match to reference images, product appearance must be identical to reference images`
      } else {
        return `${basePrompt}, professional product photography, high quality`
      }
    }

    // Frame 1: Hook first frame
    // Use Nano-banana first, then enhance with Seedream-4
    const hookSegment = storyboard.segments.find(s => s.type === 'hook')
    if (hookSegment) {
      try {
        // Step 1: Generate with Nano-banana
        const nanoPrompt = buildNanoPrompt(story.hook, hookSegment.visualPrompt)
        console.log(`[Generate Frames] Generating hook first frame with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Reference images being sent: ${referenceImages.length} images`)
        console.log(`[Generate Frames] Reference image URLs:`, referenceImages)
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: referenceImages.length > 0 ? referenceImages : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (nanoPredictionId) {
          // Poll for Nano-banana result
          let nanoStatus = 'starting'
          let nanoAttempts = 0
          while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
            nanoStatus = statusResult.status || 'starting'
            nanoAttempts++

            if (nanoStatus === 'succeeded') {
              const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
              const nanoImageUrl = nanoResultData.videoUrl

              if (nanoImageUrl) {
                console.log(`[Generate Frames] Nano-banana succeeded for hook first frame: ${nanoImageUrl}`)
                
                // Step 2: Enhance with Seedream-4
                // Preserve human anatomy from nano-banana while enhancing colors and product
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
                const seedreamPrompt = `${referenceMatchInstruction}${hookSegment.visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images, ${aspectRatio} aspect ratio`
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
                  console.log(`[Generate Frames] Starting seedream-4 enhancement for hook first frame...`)
                  const seedreamResult = await callReplicateMCP('generate_image', {
                    model: 'bytedance/seedream-4',
                    prompt: seedreamPrompt,
                    image_input: [nanoImageUrl],
                    size: '2K',
                    aspect_ratio: 'match_input_image',
                    enhance_prompt: true,
                  })

                  const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
                  if (seedreamPredictionId) {
                    // Poll for Seedream-4 result with timeout (2 minutes = 60 attempts * 2 seconds)
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
                    const maxAttempts = 60
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                        const seedreamResultUrl = seedreamResultData.videoUrl
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                          console.log(`[Generate Frames] Seedream-4 succeeded for hook first frame: ${seedreamImageUrl}`)
                        }
                      } else if (seedreamStatus === 'failed') {
                        console.warn(`[Generate Frames] Seedream-4 failed for hook first frame, using nano-banana fallback`)
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                      console.warn(`[Generate Frames] Seedream-4 timed out for hook first frame after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
                  }
                } catch (seedreamError: any) {
                  console.error(`[Generate Frames] Seedream-4 error for hook first frame:`, seedreamError)
                  console.log(`[Generate Frames] Using nano-banana fallback for hook first frame`)
                }
                
                // Add frame with model source indicator
                frames.push({
                  segmentIndex: 0,
                  frameType: 'first',
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
                })
                console.log(`[Generate Frames] Added hook first frame (${modelSource}): ${finalImageUrl}`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error generating hook first frame:', error)
      }
    }

    // Frame 2: Hook last frame (transition to body1)
    // Get body segments properly - filter all body type segments
    const bodySegments = storyboard.segments.filter(s => s.type === 'body')
    const body1Segment = bodySegments[0]
    console.log(`[Generate Frames] Found ${bodySegments.length} body segments`)
    console.log(`[Generate Frames] Body1 segment:`, body1Segment ? 'Found' : 'Not found')
    
    if (hookSegment && body1Segment) {
      try {
        const nanoPrompt = buildNanoPrompt(story.hook, hookSegment.visualPrompt, true, story.bodyOne, body1Segment.visualPrompt)
        console.log(`[Generate Frames] Generating hook last frame with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Reference images being sent: ${referenceImages.length} images`)
        console.log(`[Generate Frames] Reference image URLs:`, referenceImages)
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: referenceImages.length > 0 ? referenceImages : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (nanoPredictionId) {
          let nanoStatus = 'starting'
          let nanoAttempts = 0
          while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
            nanoStatus = statusResult.status || 'starting'
            nanoAttempts++

            if (nanoStatus === 'succeeded') {
              const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
              const nanoImageUrl = nanoResultData.videoUrl

              if (nanoImageUrl) {
                console.log(`[Generate Frames] Nano-banana succeeded for hook last frame: ${nanoImageUrl}`)
                
                // Preserve human anatomy from nano-banana while enhancing colors and product with scene continuity
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
                const seedreamPrompt = `${referenceMatchInstruction}Current scene: ${story.hook}, ${hookSegment.visualPrompt}. Transitioning to next scene: ${story.bodyOne}, ${body1Segment.visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images`
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
                  console.log(`[Generate Frames] Starting seedream-4 enhancement for hook last frame...`)
                  const seedreamResult = await callReplicateMCP('generate_image', {
                    model: 'bytedance/seedream-4',
                    prompt: seedreamPrompt,
                    image_input: [nanoImageUrl],
                    size: '2K',
                    aspect_ratio: 'match_input_image',
                    enhance_prompt: true,
                  })

                  const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
                  if (seedreamPredictionId) {
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
                    const maxAttempts = 60
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                        const seedreamResultUrl = seedreamResultData.videoUrl
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                          console.log(`[Generate Frames] Seedream-4 succeeded for hook last frame: ${seedreamImageUrl}`)
                        }
                      } else if (seedreamStatus === 'failed') {
                        console.warn(`[Generate Frames] Seedream-4 failed for hook last frame, using nano-banana fallback`)
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                      console.warn(`[Generate Frames] Seedream-4 timed out for hook last frame after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
                  }
                } catch (seedreamError: any) {
                  console.error(`[Generate Frames] Seedream-4 error for hook last frame:`, seedreamError)
                  console.log(`[Generate Frames] Using nano-banana fallback for hook last frame`)
                }
                
                // Add frame with model source indicator
                frames.push({
                  segmentIndex: 0,
                  frameType: 'last',
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
                })
                console.log(`[Generate Frames] Added hook last frame (${modelSource}): ${finalImageUrl}`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error generating hook last frame:', error)
      }
    }

    // In demo mode, only generate hook frames, skip the rest
    // Return AFTER both hook frames are generated (or attempted)
    if (generationMode === 'demo') {
      console.log('[Generate Frames] Demo mode: Hook frames completed, skipping body1, body2, and CTA')
      console.log(`[Generate Frames] Demo mode: Generated ${frames.length} frame(s)`)
      // Track cost for demo mode (only 2 frames)
      await trackCost('generate-frames', 0.05 * frames.length, {
        frameCount: frames.length,
        storyboardId: storyboard.id,
        mode: 'demo',
      })
      return {
        frames,
        mode: 'demo',
        storyboardId: storyboard.id,
      }
    }

    // Frame 3: Body1 last frame (transition to body2)
    const body2Segment = bodySegments[1]
    console.log(`[Generate Frames] Body2 segment:`, body2Segment ? 'Found' : 'Not found')
    
    if (body1Segment && body2Segment) {
      try {
        const nanoPrompt = buildNanoPrompt(story.bodyOne, body1Segment.visualPrompt, true, story.bodyTwo, body2Segment.visualPrompt)
        console.log(`[Generate Frames] Generating body1 last frame with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Reference images being sent: ${referenceImages.length} images`)
        console.log(`[Generate Frames] Reference image URLs:`, referenceImages)
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: referenceImages.length > 0 ? referenceImages : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (nanoPredictionId) {
          let nanoStatus = 'starting'
          let nanoAttempts = 0
          while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
            nanoStatus = statusResult.status || 'starting'
            nanoAttempts++

            if (nanoStatus === 'succeeded') {
              const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
              const nanoImageUrl = nanoResultData.videoUrl

              if (nanoImageUrl) {
                console.log(`[Generate Frames] Nano-banana succeeded for body1 last frame: ${nanoImageUrl}`)
                
                // Preserve human anatomy from nano-banana while enhancing colors and product with scene continuity
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
                const seedreamPrompt = `${referenceMatchInstruction}Current scene: ${story.bodyOne}, ${body1Segment.visualPrompt}. Transitioning to next scene: ${story.bodyTwo}, ${body2Segment.visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images`
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
                  console.log(`[Generate Frames] Starting seedream-4 enhancement for body1 last frame...`)
                  const seedreamResult = await callReplicateMCP('generate_image', {
                    model: 'bytedance/seedream-4',
                    prompt: seedreamPrompt,
                    image_input: [nanoImageUrl],
                    size: '2K',
                    aspect_ratio: 'match_input_image',
                    enhance_prompt: true,
                  })

                  const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
                  if (seedreamPredictionId) {
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
                    const maxAttempts = 60
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                        const seedreamResultUrl = seedreamResultData.videoUrl
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                          console.log(`[Generate Frames] Seedream-4 succeeded for body1 last frame: ${seedreamImageUrl}`)
                        }
                      } else if (seedreamStatus === 'failed') {
                        console.warn(`[Generate Frames] Seedream-4 failed for body1 last frame, using nano-banana fallback`)
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                      console.warn(`[Generate Frames] Seedream-4 timed out for body1 last frame after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
                  }
                } catch (seedreamError: any) {
                  console.error(`[Generate Frames] Seedream-4 error for body1 last frame:`, seedreamError)
                  console.log(`[Generate Frames] Using nano-banana fallback for body1 last frame`)
                }
                
                // Add frame with model source indicator
                frames.push({
                  segmentIndex: 1,
                  frameType: 'last',
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
                })
                console.log(`[Generate Frames] Added body1 last frame (${modelSource}): ${finalImageUrl}`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error generating body1 last frame:', error)
      }
    }

    // Frame 4: Body2 last frame (transition to CTA)
    const ctaSegment = storyboard.segments.find(s => s.type === 'cta')
    if (body2Segment && ctaSegment) {
      try {
        const nanoPrompt = buildNanoPrompt(story.bodyTwo, body2Segment.visualPrompt, true, story.callToAction, ctaSegment.visualPrompt)
        console.log(`[Generate Frames] Generating body2 last frame with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Reference images being sent: ${referenceImages.length} images`)
        console.log(`[Generate Frames] Reference image URLs:`, referenceImages)
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: referenceImages.length > 0 ? referenceImages : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (nanoPredictionId) {
          let nanoStatus = 'starting'
          let nanoAttempts = 0
          while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
            nanoStatus = statusResult.status || 'starting'
            nanoAttempts++

            if (nanoStatus === 'succeeded') {
              const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
              const nanoImageUrl = nanoResultData.videoUrl

              if (nanoImageUrl) {
                console.log(`[Generate Frames] Nano-banana succeeded for body2 last frame: ${nanoImageUrl}`)
                
                // Preserve human anatomy from nano-banana while enhancing colors and product with scene continuity
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
                const seedreamPrompt = `${referenceMatchInstruction}Current scene: ${story.bodyTwo}, ${body2Segment.visualPrompt}. Transitioning to next scene: ${story.callToAction}, ${ctaSegment.visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images`
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
                  console.log(`[Generate Frames] Starting seedream-4 enhancement for body2 last frame...`)
                  const seedreamResult = await callReplicateMCP('generate_image', {
                    model: 'bytedance/seedream-4',
                    prompt: seedreamPrompt,
                    image_input: [nanoImageUrl],
                    size: '2K',
                    aspect_ratio: 'match_input_image',
                    enhance_prompt: true,
                  })

                  const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
                  if (seedreamPredictionId) {
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
                    const maxAttempts = 60
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                        const seedreamResultUrl = seedreamResultData.videoUrl
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                          console.log(`[Generate Frames] Seedream-4 succeeded for body2 last frame: ${seedreamImageUrl}`)
                        }
                      } else if (seedreamStatus === 'failed') {
                        console.warn(`[Generate Frames] Seedream-4 failed for body2 last frame, using nano-banana fallback`)
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                      console.warn(`[Generate Frames] Seedream-4 timed out for body2 last frame after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
                  }
                } catch (seedreamError: any) {
                  console.error(`[Generate Frames] Seedream-4 error for body2 last frame:`, seedreamError)
                  console.log(`[Generate Frames] Using nano-banana fallback for body2 last frame`)
                }
                
                // Add frame with model source indicator
                frames.push({
                  segmentIndex: 2,
                  frameType: 'last',
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
                })
                console.log(`[Generate Frames] Added body2 last frame (${modelSource}): ${finalImageUrl}`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error generating body2 last frame:', error)
      }
    }

    // Frame 5: CTA frame
    if (ctaSegment) {
      try {
        const nanoPrompt = buildNanoPrompt(story.callToAction, ctaSegment.visualPrompt)
        console.log(`[Generate Frames] Generating CTA frame with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Reference images being sent: ${referenceImages.length} images`)
        console.log(`[Generate Frames] Reference image URLs:`, referenceImages)
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: referenceImages.length > 0 ? referenceImages : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (nanoPredictionId) {
          let nanoStatus = 'starting'
          let nanoAttempts = 0
          while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
            nanoStatus = statusResult.status || 'starting'
            nanoAttempts++

            if (nanoStatus === 'succeeded') {
              const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
              const nanoImageUrl = nanoResultData.videoUrl

              if (nanoImageUrl) {
                console.log(`[Generate Frames] Nano-banana succeeded for CTA frame: ${nanoImageUrl}`)
                
                // Preserve human anatomy from nano-banana while enhancing colors and product (final frame, no next scene)
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
                const seedreamPrompt = `${referenceMatchInstruction}${ctaSegment.visualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images, ${aspectRatio} aspect ratio`
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
                  console.log(`[Generate Frames] Starting seedream-4 enhancement for CTA frame...`)
                  const seedreamResult = await callReplicateMCP('generate_image', {
                    model: 'bytedance/seedream-4',
                    prompt: seedreamPrompt,
                    image_input: [nanoImageUrl],
                    size: '2K',
                    aspect_ratio: 'match_input_image',
                    enhance_prompt: true,
                  })

                  const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
                  if (seedreamPredictionId) {
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
                    const maxAttempts = 60
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                        const seedreamResultUrl = seedreamResultData.videoUrl
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                          console.log(`[Generate Frames] Seedream-4 succeeded for CTA frame: ${seedreamImageUrl}`)
                        }
                      } else if (seedreamStatus === 'failed') {
                        console.warn(`[Generate Frames] Seedream-4 failed for CTA frame, using nano-banana fallback`)
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                      console.warn(`[Generate Frames] Seedream-4 timed out for CTA frame after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
                  }
                } catch (seedreamError: any) {
                  console.error(`[Generate Frames] Seedream-4 error for CTA frame:`, seedreamError)
                  console.log(`[Generate Frames] Using nano-banana fallback for CTA frame`)
                }
                
                // Add frame with model source indicator
                frames.push({
                  segmentIndex: 3,
                  frameType: 'first',
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
                })
                console.log(`[Generate Frames] Added CTA frame (${modelSource}): ${finalImageUrl}`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error generating CTA frame:', error)
      }
    }

    // Track cost (estimate: ~$0.05 per frame with both models)
    await trackCost('generate-frames', 0.05 * frames.length, {
      frameCount: frames.length,
      storyboardId: storyboard.id,
    })

    return {
      frames,
      storyboardId: storyboard.id,
    }
  } catch (error: any) {
    console.error('[Generate Frames] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate frames',
    })
  }
})


