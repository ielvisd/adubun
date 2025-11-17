import { z } from 'zod'
import path from 'path'
import sharp from 'sharp'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { saveAsset, deleteFile } from '../utils/storage'
import { uploadFileToS3 } from '../utils/s3-upload'
import { createCharacterConsistencyInstruction, formatCharactersForPrompt } from '../utils/character-extractor'
import type { Storyboard, Segment, Character } from '~/types/generation'

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
      mode: z.enum(['demo', 'production']).optional(),
      mood: z.string().optional(),
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

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

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

const getExtensionFromUrl = (url: string): string => {
  const sanitized = url.split('?')[0]
  const ext = sanitized.split('.').pop()?.toLowerCase() || 'jpg'
  return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : 'jpg'
}

const getLocalAssetUrl = (filePath: string): string => {
  const assetId = path.basename(filePath)
  return `/api/assets/${assetId}`
}

const persistImageBuffer = async (buffer: Buffer, extension: string): Promise<string> => {
  const tempPath = await saveAsset(buffer, extension)
  try {
    const url = await uploadFileToS3(tempPath)
    await deleteFile(tempPath).catch(() => {})
    return url
  } catch (error: any) {
    console.warn('[Generate Frames] S3 upload unavailable, serving from local assets:', error.message)
    return getLocalAssetUrl(tempPath)
  }
}

const enforceImageResolution = async (
  imageUrl: string,
  width: number,
  height: number,
): Promise<string> => {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const resized = await sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .toBuffer()
    const extension = getExtensionFromUrl(imageUrl)
    return await persistImageBuffer(resized, extension)
  } catch (error) {
    console.error('[Generate Frames] Failed to enforce image resolution:', error)
    return imageUrl
  }
}

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
    
    // Extract mood from storyboard meta
    const mood = storyboard.meta.mood || 'professional'
    console.log(`[Generate Frames] Mood: ${mood}`)

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

    const dimensions = getDimensions(aspectRatio)

    // Log product images
    console.log(`[Generate Frames] Product images: ${productImages.length} images`)
    if (productImages.length > 0) {
      console.log(`[Generate Frames] Product image URLs:`, productImages)
    }
    
    // Use all available reference images (up to model limit of 10)
    const referenceImages = productImages.length > 0 ? productImages.slice(0, 10) : []

    // Get characters from storyboard for consistency
    const characters: Character[] = storyboard.characters || []

    // Helper function to build prompts that emphasize matching reference images
    const buildNanoPrompt = (
      storyText: string, 
      visualPrompt: string, 
      isTransition: boolean = false, 
      transitionText?: string, 
      transitionVisual?: string,
      previousFrameImage?: string  // NEW: Add previous frame as input
    ) => {
      const moodStyle = mood ? `${mood} style` : 'professional style'
      const hasReferenceImages = referenceImages.length > 0
      
      // Build the base prompt parts with full scene context for continuity
      let basePrompt = ''
      if (isTransition && transitionText && transitionVisual) {
        // Include both current scene AND full next scene for continuity
        basePrompt = `Current scene: ${storyText}, ${visualPrompt}. Transitioning to next scene: ${transitionText}, ${transitionVisual}`
      } else {
        basePrompt = `${storyText}, ${visualPrompt}`
      }
      
      // Add character consistency instructions if we have characters
      let characterInstruction = ''
      if (characters.length > 0) {
        const characterDescriptions = formatCharactersForPrompt(characters)
        characterInstruction = `CRITICAL CHARACTER CONSISTENCY: The exact same characters from previous scenes must appear with IDENTICAL appearance: ${characterDescriptions}. Maintain exact same gender, age, physical features (hair color/style, build), and clothing style for each character. Do NOT change character gender, age, or physical appearance. Use phrases like "the same [age] [gender] person with [features]" to ensure consistency. `
      }
      
      // Add previous frame continuity instruction if we have a previous frame
      let previousFrameInstruction = ''
      if (previousFrameImage) {
        previousFrameInstruction = `CRITICAL VISUAL CONTINUITY: Use the previous frame image as a visual reference to maintain continuity. Keep the same characters, same environment, same lighting style, and same overall composition. The scene should flow naturally from the previous frame. `
      }
      
      // Add product consistency and reference image instructions if we have reference images
      if (hasReferenceImages) {
        const productConsistencyInstruction = `CRITICAL INSTRUCTIONS: Do not add new products to the scene. Only enhance existing products shown in the reference images. Keep product design and style exactly as shown in references. The reference images provided are the EXACT product you must recreate. You MUST copy the product from the reference images with pixel-perfect accuracy. Do NOT create a different product, do NOT use different colors, do NOT change the design, do NOT hallucinate new products. The product in your generated image must be visually IDENTICAL to the product in the reference images. Study every detail: exact color codes, exact design patterns, exact text/fonts, exact materials, exact textures, exact proportions, exact placement. The reference images are your ONLY source of truth for the product appearance. Ignore any text in the prompt that contradicts the reference images - the reference images take absolute priority. Generate the EXACT same product as shown in the reference images. `
        return `${characterInstruction}${previousFrameInstruction}${productConsistencyInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality, product must be pixel-perfect match to reference images, product appearance must be identical to reference images`
      } else {
        return `${characterInstruction}${previousFrameInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality`
      }
    }

    // Helper function to generate a single frame (nano-banana → seedream-4 pipeline)
    const generateSingleFrame = async (
      frameName: string,
      nanoPrompt: string,
      segmentVisualPrompt: string,
      previousFrameImage?: string,  // NEW: Add previous frame image parameter
      currentSceneText?: string,
      isTransition: boolean = false,
      transitionText?: string,
      transitionVisual?: string
    ): Promise<{
      segmentIndex: number
      frameType: 'first' | 'last'
      imageUrl: string
      modelSource: 'nano-banana' | 'seedream-4'
      nanoImageUrl?: string
      seedreamImageUrl?: string
    } | null> => {
      try {
        console.log(`[Generate Frames] Generating ${frameName} with nano-banana...`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        
        // Build image input array: product images + previous frame (if available)
        const imageInputs: string[] = []
        
        // Add product images first
        if (referenceImages.length > 0) {
          imageInputs.push(...referenceImages)
        }
        
        // Add previous frame image for continuity (as per PRD specification)
        if (previousFrameImage) {
          imageInputs.push(previousFrameImage)
          console.log(`[Generate Frames] Including previous frame image for continuity: ${previousFrameImage}`)
        }
        
        console.log(`[Generate Frames] Total image inputs being sent: ${imageInputs.length} images (${referenceImages.length} product + ${previousFrameImage ? 1 : 0} previous frame)`)
        
        const nanoResult = await callReplicateMCP('generate_image', {
          model: 'google/nano-banana',
          prompt: nanoPrompt,
          image_input: imageInputs.length > 0 ? imageInputs : undefined,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
        })

        const nanoPredictionId = nanoResult.predictionId || nanoResult.id
        if (!nanoPredictionId) {
          console.error(`[Generate Frames] No prediction ID returned for ${frameName}`)
          return null
        }

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

            if (!nanoImageUrl) {
              console.error(`[Generate Frames] No image URL in nano-banana result for ${frameName}`)
              return null
            }

            console.log(`[Generate Frames] Nano-banana succeeded for ${frameName}: ${nanoImageUrl}`)
                
                // Step 2: Enhance with Seedream-4
                const referenceMatchInstruction = referenceImages.length > 0 
                  ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
                  : ''
            
            // Add character preservation instruction for seedream
            const characterPreservationInstruction = characters.length > 0
              ? `PRESERVE CHARACTER APPEARANCE: Maintain exact character appearance from input image - same gender, age, physical features (hair color/style, build), and clothing for each character. Do not alter character appearance in any way. The same characters from previous scenes must appear with identical appearance. `
              : ''
            
            let seedreamPrompt = ''
            if (isTransition && transitionText && transitionVisual && currentSceneText) {
              seedreamPrompt = `${characterPreservationInstruction}${referenceMatchInstruction}Current scene: ${currentSceneText}, ${segmentVisualPrompt}. Transitioning to next scene: ${transitionText}, ${transitionVisual}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images, limit scene to 3-4 people maximum, sharp faces, clear facial features, detailed faces, professional portrait quality, avoid large groups or crowds`
            } else {
              seedreamPrompt = `${characterPreservationInstruction}${referenceMatchInstruction}${segmentVisualPrompt}, enhance product to match reference images exactly, maintain exact human faces and body positions from input image, ensure product colors and design match reference images precisely, professional product photography, preserve all human anatomy and facial features from source image, improve color saturation and product visibility to match reference images, limit scene to 3-4 people maximum, sharp faces, clear facial features, detailed faces, professional portrait quality, avoid large groups or crowds, ${aspectRatio} aspect ratio`
            }
                
                let finalImageUrl = nanoImageUrl
                let modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                let seedreamImageUrl: string | undefined = undefined
                
                try {
              console.log(`[Generate Frames] Starting seedream-4 enhancement for ${frameName}...`)
              
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
                console.error(`[Generate Frames] Seedream-4 generate_image did not return a predictionId for ${frameName}`)
                throw new Error('Seedream-4 generate_image did not return a predictionId')
              }

              console.log(`[Generate Frames] Seedream-4 prediction ID: ${seedreamPredictionId}, starting polling for ${frameName}...`)
              
              // Poll for Seedream-4 result with timeout (3 minutes = 90 attempts * 2 seconds)
                    let seedreamStatus = 'starting'
                    let seedreamAttempts = 0
              const maxAttempts = 90
                    
                    while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 2000))
                      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
                      seedreamStatus = statusResult.status || 'starting'
                      seedreamAttempts++

                if (seedreamAttempts % 10 === 0) {
                  console.log(`[Generate Frames] Seedream-4 polling attempt ${seedreamAttempts}/${maxAttempts} for ${frameName}, status: ${seedreamStatus}`)
                }

                      if (seedreamStatus === 'succeeded') {
                        const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
                  const seedreamResultUrl = seedreamResultData.videoUrl || seedreamResultData.output || seedreamResultData.url
                  
                        if (seedreamResultUrl) {
                          seedreamImageUrl = seedreamResultUrl
                          finalImageUrl = seedreamImageUrl
                          modelSource = 'seedream-4'
                    console.log(`[Generate Frames] Seedream-4 succeeded for ${frameName}: ${seedreamImageUrl}`)
                  } else {
                    console.error(`[Generate Frames] Seedream-4 result does not contain a valid URL for ${frameName}`)
                    throw new Error('Seedream-4 result does not contain a valid URL')
                        }
                  break
                      } else if (seedreamStatus === 'failed') {
                  const errorMessage = statusResult.error || 'Unknown error'
                  console.warn(`[Generate Frames] Seedream-4 failed for ${frameName} after ${seedreamAttempts} attempts. Error: ${errorMessage}`)
                  break
                      }
                    }
                    
                    if (seedreamAttempts >= maxAttempts && seedreamStatus !== 'succeeded') {
                console.warn(`[Generate Frames] Seedream-4 timed out for ${frameName} after ${maxAttempts} attempts, using nano-banana fallback`)
                    }
              
              if (!seedreamImageUrl) {
                console.warn(`[Generate Frames] Seedream-4 enhancement did not produce an image URL for ${frameName}, using nano-banana fallback`)
                  }
                } catch (seedreamError: any) {
              console.error(`[Generate Frames] Seedream-4 error for ${frameName}:`, seedreamError)
              console.log(`[Generate Frames] Using nano-banana fallback for ${frameName}`)
                }
                
            // Enforce image resolution if using nano-banana fallback
            if (modelSource === 'nano-banana') {
              finalImageUrl = await enforceImageResolution(finalImageUrl, dimensions.width, dimensions.height)
            }
            
            return {
              segmentIndex: 0, // Will be set by caller
              frameType: 'first' as const, // Will be set by caller
                  imageUrl: finalImageUrl,
                  modelSource,
                  nanoImageUrl,
                  seedreamImageUrl,
            }
          }
        }
        
        console.error(`[Generate Frames] Nano-banana failed or timed out for ${frameName}`)
        return null
      } catch (error: any) {
        console.error(`[Generate Frames] Error generating ${frameName}:`, error)
        return null
      }
    }

    // Get all segments for SEQUENTIAL frame generation (as per PRD specification)
    const hookSegment = storyboard.segments.find(s => s.type === 'hook')
    const bodySegments = storyboard.segments.filter(s => s.type === 'body')
    const body1Segment = bodySegments[0]
    const body2Segment = bodySegments[1]
    const ctaSegment = storyboard.segments.find(s => s.type === 'cta')
    
    console.log(`[Generate Frames] Found ${bodySegments.length} body segments`)
    console.log(`[Generate Frames] Starting SEQUENTIAL frame generation (each frame uses previous frame as input)...`)

    // SEQUENTIAL GENERATION: Each frame uses the previous frame as input
    // This follows the EXACT pipeline specification from the PRD
    
    // Frame 1: Hook first frame (no previous frame)
    let hookFirstFrameResult: any = null
    if (hookSegment) {
      console.log('\n[Generate Frames] === FRAME 1: Hook First Frame ===')
      const nanoPrompt = buildNanoPrompt(story.hook, hookSegment.visualPrompt)
      hookFirstFrameResult = await generateSingleFrame(
        'hook first frame', 
        nanoPrompt, 
        hookSegment.visualPrompt,
        undefined  // No previous frame
      )
      
      if (hookFirstFrameResult) {
        hookFirstFrameResult.segmentIndex = 0
        hookFirstFrameResult.frameType = 'first'
        frames.push(hookFirstFrameResult)
        console.log(`[Generate Frames] ✓ Hook first frame generated (${hookFirstFrameResult.modelSource}): ${hookFirstFrameResult.imageUrl}`)
      } else {
        console.error('[Generate Frames] ✗ Hook first frame generation failed')
      }
    }

    // Frame 2: Hook last frame (uses hook first frame as input)
    let hookLastFrameResult: any = null
    if (hookSegment && body1Segment && hookFirstFrameResult) {
      console.log('\n[Generate Frames] === FRAME 2: Hook Last Frame ===')
      const nanoPrompt = buildNanoPrompt(
        story.hook, 
        hookSegment.visualPrompt, 
        true, 
        story.bodyOne, 
        body1Segment.visualPrompt,
        hookFirstFrameResult.imageUrl  // Use hook first frame as input
      )
      hookLastFrameResult = await generateSingleFrame(
        'hook last frame', 
        nanoPrompt, 
        hookSegment.visualPrompt,
        hookFirstFrameResult.imageUrl,  // Previous frame image
        story.hook, 
        true, 
        story.bodyOne, 
        body1Segment.visualPrompt
      )
      
      if (hookLastFrameResult) {
        hookLastFrameResult.segmentIndex = 0
        hookLastFrameResult.frameType = 'last'
        frames.push(hookLastFrameResult)
        console.log(`[Generate Frames] ✓ Hook last frame generated (${hookLastFrameResult.modelSource}): ${hookLastFrameResult.imageUrl}`)
      } else {
        console.error('[Generate Frames] ✗ Hook last frame generation failed')
      }
    }

    // In demo mode, only generate hook frames
    if (generationMode === 'demo') {
      console.log('\n[Generate Frames] Demo mode: Only hook frames generated')
      console.log(`[Generate Frames] Demo mode: Generated ${frames.length} frame(s)`)
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

    // Frame 3: Body1 last frame (uses hook last frame as input, which is Body1 first frame)
    let body1LastFrameResult: any = null
    if (body1Segment && body2Segment && hookLastFrameResult) {
      console.log('\n[Generate Frames] === FRAME 3: Body1 Last Frame ===')
      console.log('[Generate Frames] Note: Body1 first frame = Hook last frame (same image)')
      const nanoPrompt = buildNanoPrompt(
        story.bodyOne, 
        body1Segment.visualPrompt, 
        true, 
        story.bodyTwo, 
        body2Segment.visualPrompt,
        hookLastFrameResult.imageUrl  // Use hook last frame (= Body1 first frame) as input
      )
      body1LastFrameResult = await generateSingleFrame(
        'body1 last frame', 
        nanoPrompt, 
        body1Segment.visualPrompt,
        hookLastFrameResult.imageUrl,  // Previous frame image (Body1 first = Hook last)
        story.bodyOne, 
        true, 
        story.bodyTwo, 
        body2Segment.visualPrompt
      )
      
      if (body1LastFrameResult) {
        body1LastFrameResult.segmentIndex = 1
        body1LastFrameResult.frameType = 'last'
        frames.push(body1LastFrameResult)
        console.log(`[Generate Frames] ✓ Body1 last frame generated (${body1LastFrameResult.modelSource}): ${body1LastFrameResult.imageUrl}`)
      } else {
        console.error('[Generate Frames] ✗ Body1 last frame generation failed')
                      }
                    }
                    
    // Frame 4: Body2 last frame (uses body1 last frame as input, which is Body2 first frame)
    let body2LastFrameResult: any = null
    if (body2Segment && ctaSegment && body1LastFrameResult) {
      console.log('\n[Generate Frames] === FRAME 4: Body2 Last Frame ===')
      console.log('[Generate Frames] Note: Body2 first frame = Body1 last frame (same image)')
      const nanoPrompt = buildNanoPrompt(
        story.bodyTwo, 
        body2Segment.visualPrompt, 
        true, 
        story.callToAction, 
        ctaSegment.visualPrompt,
        body1LastFrameResult.imageUrl  // Use body1 last frame (= Body2 first frame) as input
      )
      body2LastFrameResult = await generateSingleFrame(
        'body2 last frame', 
        nanoPrompt, 
        body2Segment.visualPrompt,
        body1LastFrameResult.imageUrl,  // Previous frame image (Body2 first = Body1 last)
        story.bodyTwo, 
        true, 
        story.callToAction, 
        ctaSegment.visualPrompt
      )
      
      if (body2LastFrameResult) {
        body2LastFrameResult.segmentIndex = 2
        body2LastFrameResult.frameType = 'last'
        frames.push(body2LastFrameResult)
        console.log(`[Generate Frames] ✓ Body2 last frame generated (${body2LastFrameResult.modelSource}): ${body2LastFrameResult.imageUrl}`)
      } else {
        console.error('[Generate Frames] ✗ Body2 last frame generation failed')
      }
                }
                
    // Frame 5: CTA last frame (uses body2 last frame as input, which is CTA first frame)
    let ctaLastFrameResult: any = null
    if (ctaSegment && body2LastFrameResult) {
      console.log('\n[Generate Frames] === FRAME 5: CTA Last Frame ===')
      console.log('[Generate Frames] Note: CTA first frame = Body2 last frame (same image)')
      const nanoPrompt = buildNanoPrompt(
        story.callToAction, 
        ctaSegment.visualPrompt,
        false,
        undefined,
        undefined,
        body2LastFrameResult.imageUrl  // Use body2 last frame (= CTA first frame) as input
      )
      ctaLastFrameResult = await generateSingleFrame(
        'CTA last frame', 
        nanoPrompt, 
        ctaSegment.visualPrompt,
        body2LastFrameResult.imageUrl  // Previous frame image (CTA first = Body2 last)
      )
      
      if (ctaLastFrameResult) {
        ctaLastFrameResult.segmentIndex = 3
        ctaLastFrameResult.frameType = 'last'
        frames.push(ctaLastFrameResult)
        console.log(`[Generate Frames] ✓ CTA last frame generated (${ctaLastFrameResult.modelSource}): ${ctaLastFrameResult.imageUrl}`)
      } else {
        console.error('[Generate Frames] ✗ CTA last frame generation failed')
      }
    }

    console.log(`\n[Generate Frames] Sequential generation completed. Generated ${frames.length} frame(s)`)

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


