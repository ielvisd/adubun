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
      gender: z.preprocess((val) => {
        if (typeof val !== 'string') return 'unspecified'
        const normalized = val.toLowerCase().trim()
        if (normalized === 'male' || normalized === 'man' || normalized === 'men' || normalized === 'm') return 'male'
        if (normalized === 'female' || normalized === 'woman' || normalized === 'women' || normalized === 'w' || normalized === 'f') return 'female'
        if (normalized === 'non-binary' || normalized === 'nonbinary' || normalized === 'nb' || normalized === 'other') return 'non-binary'
        if (normalized === 'unspecified' || normalized === 'unknown' || normalized === '') return 'unspecified'
        return 'unspecified' // Default fallback
      }, z.enum(['male', 'female', 'non-binary', 'unspecified'])),
      age: z.string().optional(),
      physicalFeatures: z.string().optional(),
      clothing: z.string().optional(),
      role: z.string(),
    })).optional(),
    meta: z.object({
      aspectRatio: z.enum(['16:9', '9:16']),
      mode: z.enum(['demo', 'production']).optional(),
      mood: z.string().optional(),
      subjectReference: z.string().optional(),
    }),
  }),
  productImages: z.array(z.string()).optional(),
  subjectReference: z.string().optional(),
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
    
    const { storyboard, productImages = [], subjectReference, story, mode } = generateFramesSchema.parse(body)
    
    // Set subjectReference on storyboard meta if provided and not already set
    if (subjectReference && !storyboard.meta.subjectReference) {
      storyboard.meta.subjectReference = subjectReference
      console.log(`[Generate Frames] Set subjectReference on storyboard.meta: ${subjectReference}`)
    }
    
    console.log(`[Generate Frames] After parsing - productImages type:`, typeof productImages)
    console.log(`[Generate Frames] After parsing - productImages is array:`, Array.isArray(productImages))
    console.log(`[Generate Frames] After parsing - productImages length:`, productImages.length)
    if (productImages.length > 0) {
      console.log(`[Generate Frames] After parsing - first 3 productImages:`, productImages.slice(0, 3))
    }
    console.log(`[Generate Frames] subjectReference:`, subjectReference || 'none')
    
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
    
    // Add person reference (subjectReference) if available from storyboard meta
    if (storyboard.meta.subjectReference) {
      console.log(`[Generate Frames] Adding person reference to nano-banana inputs: ${storyboard.meta.subjectReference}`)
      referenceImages.push(storyboard.meta.subjectReference)
    }

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
      
      // Add instruction to prevent story text from appearing as visible text
      const noTextInstruction = `CRITICAL: The story description ("${storyText}") is for scene understanding ONLY. DO NOT display this text as visible text, overlays, or dialogue. DO NOT have characters speak these words. The story text describes what happens in the scene, not what text to display. Only render text if explicitly mentioned in the visualPrompt. `
      
      // Build the base prompt parts with full scene context for continuity
      // Note: storyText is used for context, not for literal text rendering
      let basePrompt = ''
      if (isTransition && transitionText && transitionVisual) {
        basePrompt = `Scene context: ${storyText}. Visual: ${visualPrompt}. Continuing seamlessly in the same continuous flow. Next moment context: ${transitionText}. Next visual: ${transitionVisual}`
      } else {
        basePrompt = `Scene context: ${storyText}. Visual: ${visualPrompt}`
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
        if (isTransition) {
          // For transitions between scenes: maintain continuous flow with NO transitions
        previousFrameInstruction = `CRITICAL CONTINUOUS FLOW - ZERO TRANSITIONS: Use the previous frame image as a visual reference to maintain CONTINUOUS story flow. This is NOT a transition - it's the SAME continuous moment flowing forward. Keep the same characters, same environment, same lighting style, same camera angle, and same overall composition. The scene should feel like ONE continuous shot with NO cuts, jumps, or scene changes. Maintain the exact same moment in time flowing seamlessly forward. `
        } else {
          // For progression within same scene: FORCE different angle/composition while maintaining character consistency
          previousFrameInstruction = `CRITICAL SCENE PROGRESSION - MANDATORY VISUAL VARIATION WITH CHARACTER CONSISTENCY: This final frame MUST be SIGNIFICANTLY visually different from the previous frame in composition, camera angle, and pose. However, you MUST maintain IDENTICAL character appearance from the previous frame: EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), NO glasses if previous frame had no glasses, SAME glasses if previous frame had glasses. DO NOT change character clothing, accessories, or physical appearance. You MUST create a DISTINCT visual composition by: 1) Using a DIFFERENT camera angle (switch from medium to close-up, or wide to over-shoulder, or front to side/three-quarter angle), 2) Changing character pose and body language (different standing/sitting position, different gesture, different facial expression, different body orientation), 3) Altering composition and framing (different character placement in frame, different focal point, different depth of field, different framing style). The previous frame image is for character/setting reference to maintain IDENTICAL appearance - DO NOT copy its composition, camera angle, pose, or framing, but DO copy the exact character appearance (clothing, accessories, physical features). Show a DISTINCT later moment with CLEAR visual progression while maintaining the SAME character. Text changes alone are NOT sufficient - the entire visual composition must be different, but the character must look IDENTICAL. `
        }
      }

      // Add variation reinforcement
      let variationReinforcement = ''
      if (previousFrameImage && !isTransition) {
        variationReinforcement = ` FINAL MANDATORY INSTRUCTION: IGNORE the input image composition, camera angle, and pose. You MUST create a visually DISTINCT final frame with a NEW camera angle and pose. However, you MUST copy the EXACT character appearance from the input image: same clothing, same accessories (glasses/no glasses), same physical features. Do not copy the previous frame's composition, but DO copy the character's appearance exactly. `
      }

      // Add product consistency and reference image instructions if we have reference images
      if (hasReferenceImages) {
        const productConsistencyInstruction = `CRITICAL INSTRUCTIONS: Do not add new products to the scene. Only enhance existing products shown in the reference images. Keep product design and style exactly as shown in references. The reference images provided are the EXACT product you must recreate. You MUST copy the product from the reference images with pixel-perfect accuracy. Do NOT create a different product, do NOT use different colors, do NOT change the design, do NOT hallucinate new products. The product in your generated image must be visually IDENTICAL to the product in the reference images. Study every detail: exact color codes, exact design patterns, exact text/fonts, exact materials, exact textures, exact proportions, exact placement. The reference images are your ONLY source of truth for the product appearance. Ignore any text in the prompt that contradicts the reference images - the reference images take absolute priority. Generate the EXACT same product as shown in the reference images. `
        return `${characterInstruction}${noTextInstruction}${previousFrameInstruction}${productConsistencyInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality, product must be pixel-perfect match to reference images, product appearance must be identical to reference images ${variationReinforcement}`
      } else {
        return `${characterInstruction}${noTextInstruction}${previousFrameInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality ${variationReinforcement}`
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
      transitionVisual?: string,
      includePreviousFrameInInput: boolean = true  // NEW: Control whether to include previous frame in nano-banana image inputs
    ): Promise<{
      segmentIndex: number
      frameType: 'first' | 'last'
      imageUrl: string
      modelSource: 'nano-banana' | 'seedream-4'
      nanoImageUrl?: string
      seedreamImageUrl?: string
    } | null> => {
      try {
        console.log(`[Generate Frames] ========================================`)
        console.log(`[Generate Frames] Starting generation: ${frameName}`)
        console.log(`[Generate Frames] ========================================`)
        console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
        console.log(`[Generate Frames] Has previous frame: ${!!previousFrameImage}`)
        
        // Build image input array: product images + previous frame (if available and if includePreviousFrameInInput is true)
        const imageInputs: string[] = []
        
        // Add product images first
        if (referenceImages.length > 0) {
          imageInputs.push(...referenceImages)
        }
        
        // Add previous frame image for continuity only if includePreviousFrameInInput is true
        if (previousFrameImage && includePreviousFrameInInput) {
          imageInputs.push(previousFrameImage)
          console.log(`[Generate Frames] Including previous frame image in nano-banana inputs: ${previousFrameImage}`)
        } else if (previousFrameImage && !includePreviousFrameInInput) {
          console.log(`[Generate Frames] Previous frame mentioned in prompt but NOT included in image inputs (for more variation): ${previousFrameImage}`)
        }
        
        console.log(`[Generate Frames] Total image inputs being sent: ${imageInputs.length} images (${referenceImages.length} product + ${(previousFrameImage && includePreviousFrameInInput) ? 1 : 0} previous frame)`)
        
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
                
                // NOTE: Seedream-4 enhancement is now optional and handled via separate API endpoint
                // This allows faster frame generation (nano-banana only) with optional enhancement
                const finalImageUrl = await enforceImageResolution(nanoImageUrl, dimensions.width, dimensions.height)
                const modelSource: 'nano-banana' | 'seedream-4' = 'nano-banana'
                const seedreamImageUrl: string | undefined = undefined
            
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
        
        console.error(`[Generate Frames] ✗✗✗ Nano-banana failed or timed out for ${frameName}`)
        console.error(`[Generate Frames] Final status: ${nanoStatus}, attempts: ${nanoAttempts}`)
        return null
      } catch (error: any) {
        console.error(`[Generate Frames] ✗✗✗ EXCEPTION generating ${frameName}:`, error)
        console.error(`[Generate Frames] Error message: ${error.message}`)
        console.error(`[Generate Frames] Error stack:`, error.stack)
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
    // For 3-segment format, we only need body1Segment (the single body segment)
    // For 4-segment format, we need body1Segment to exist
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

    // Determine format: 3-segment (16s) or 4-segment (24s)
    const is3SegmentFormat = !body2Segment
    console.log(`[Generate Frames] Format detected: ${is3SegmentFormat ? '3-segment (16s)' : '4-segment (24s)'}`)
    
    // Frame 3: Body last frame (uses hook last frame as input, which is Body first frame)
    let bodyLastFrameResult: any = null
    if (is3SegmentFormat) {
      // 3-segment format: Single body segment (Product Intro)
      if (body1Segment && ctaSegment && hookLastFrameResult) {
        console.log('\n[Generate Frames] === FRAME 3: Body Last Frame (3-segment format) ===')
        console.log('[Generate Frames] Note: Body first frame = Hook last frame (same image)')
        const nanoPrompt = buildNanoPrompt(
          story.bodyOne, 
          body1Segment.visualPrompt, 
          true, 
          story.callToAction, 
          ctaSegment.visualPrompt,
          hookLastFrameResult.imageUrl  // Use hook last frame (= Body first frame) as input
        )
        bodyLastFrameResult = await generateSingleFrame(
          'body last frame', 
          nanoPrompt, 
          body1Segment.visualPrompt,
          hookLastFrameResult.imageUrl,  // Previous frame image (Body first = Hook last)
          story.bodyOne, 
          true, 
          story.callToAction, 
          ctaSegment.visualPrompt
        )
        
        if (bodyLastFrameResult) {
          bodyLastFrameResult.segmentIndex = 1
          bodyLastFrameResult.frameType = 'last'
          frames.push(bodyLastFrameResult)
          console.log(`[Generate Frames] ✓ Body last frame generated (${bodyLastFrameResult.modelSource}): ${bodyLastFrameResult.imageUrl}`)
        } else {
          console.error('[Generate Frames] ✗ Body last frame generation failed')
        }
      }
    } else {
      // 4-segment format: Body1 and Body2 segments
      // Frame 3: Body1 last frame (uses hook last frame as input, which is Body1 first frame)
      let body1LastFrameResult: any = null
      if (body1Segment && body2Segment && hookLastFrameResult) {
        console.log('\n[Generate Frames] === FRAME 3: Body1 Last Frame (4-segment format) ===')
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
        console.log('\n[Generate Frames] === FRAME 4: Body2 Last Frame (4-segment format) ===')
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
          bodyLastFrameResult = body2LastFrameResult // Use for CTA generation
          console.log(`[Generate Frames] ✓ Body2 last frame generated (${body2LastFrameResult.modelSource}): ${body2LastFrameResult.imageUrl}`)
        } else {
          console.error('[Generate Frames] ✗ Body2 last frame generation failed')
        }
      }
    }
                
    // CTA last frame (uses previous body last frame as input)
    let ctaLastFrameResult: any = null
    const previousFrameForCTA = bodyLastFrameResult || (is3SegmentFormat ? null : (bodySegments.length > 1 ? frames[frames.length - 1] : null))
    if (ctaSegment && previousFrameForCTA) {
      const frameNumber = is3SegmentFormat ? 4 : 5
      const previousFrameUrl = previousFrameForCTA.imageUrl || (typeof previousFrameForCTA === 'string' ? previousFrameForCTA : null)
      console.log(`\n[Generate Frames] === FRAME ${frameNumber}: CTA Last Frame (${is3SegmentFormat ? '3-segment' : '4-segment'} format) ===`)
      console.log(`[Generate Frames] Note: CTA first frame = ${is3SegmentFormat ? 'Body' : 'Body2'} last frame (same image)`)
      console.log('[Generate Frames] CTA segment:', {
        type: ctaSegment.type,
        description: ctaSegment.description,
        visualPrompt: ctaSegment.visualPrompt,
      })
      console.log(`[Generate Frames] CTA first frame URL (${is3SegmentFormat ? 'body' : 'body2'} last):`, previousFrameUrl)
      console.log('[Generate Frames] CTA story text:', story.callToAction)
      
      // CTA last frame should be visually distinct from first frame (hero shot, text overlay, logo)
      // Use isTransition: false to trigger variation instruction, but include previous frame for character consistency
      const nanoPrompt = buildNanoPrompt(
        story.callToAction, 
        ctaSegment.visualPrompt,
        false,  // NOT using transition mode - want visual variation
        undefined,
        undefined,
        previousFrameUrl  // Use CTA first frame as context reference
      )
      
      console.log('[Generate Frames] CTA nano prompt:', nanoPrompt)
      console.log('[Generate Frames] Starting CTA last frame generation...')
      console.log('[Generate Frames] CTA last frame will be visually distinct from first frame (hero shot, text/logo overlay)')
      console.log('[Generate Frames] Previous frame included in inputs for character consistency, but variation instruction will force different composition')
      
      ctaLastFrameResult = await generateSingleFrame(
        'CTA last frame', 
        nanoPrompt, 
        ctaSegment.visualPrompt,
        previousFrameUrl,  // Previous frame for visual reference (for character consistency)
        story.callToAction,  // Story text for context
        false,  // isTransition = false (triggers variation instruction for different composition)
        undefined,  // No transition text
        undefined,  // No transition visual
        true  // Include previous frame in image inputs for character consistency (variation instruction will still force different composition/pose)
      )
      
      if (ctaLastFrameResult) {
        ctaLastFrameResult.segmentIndex = is3SegmentFormat ? 2 : 3
        ctaLastFrameResult.frameType = 'last'
        frames.push(ctaLastFrameResult)
        console.log(`[Generate Frames] ✓ CTA last frame generated successfully!`)
        console.log(`[Generate Frames]   - Model source: ${ctaLastFrameResult.modelSource}`)
        console.log(`[Generate Frames]   - Image URL: ${ctaLastFrameResult.imageUrl}`)
        console.log(`[Generate Frames]   - Segment index: ${ctaLastFrameResult.segmentIndex}`)
        console.log(`[Generate Frames]   - Frame type: ${ctaLastFrameResult.frameType}`)
      } else {
        console.error('[Generate Frames] ✗✗✗ CTA last frame generation FAILED - result is null')
        console.error('[Generate Frames] This means generateSingleFrame returned null')
      }
    } else {
      console.error('[Generate Frames] ✗✗✗ Skipping CTA last frame generation')
      console.error('[Generate Frames] ctaSegment exists:', !!ctaSegment)
      console.error('[Generate Frames] previousFrameForCTA exists:', !!previousFrameForCTA)
      if (!ctaSegment) {
        console.error('[Generate Frames] CTA segment not found in storyboard')
      }
      if (!previousFrameForCTA) {
        console.error(`[Generate Frames] ${is3SegmentFormat ? 'Body' : 'Body2'} last frame generation failed - cannot generate CTA frame`)
      }
    }

    console.log(`\n[Generate Frames] Sequential generation completed. Generated ${frames.length} frame(s)`)
    console.log('[Generate Frames] Final frames array:')
    frames.forEach((frame, index) => {
      console.log(`  Frame ${index + 1}: segmentIndex=${frame.segmentIndex}, frameType=${frame.frameType}, url=${frame.imageUrl.substring(0, 50)}...`)
    })
    
    // Verify we have the expected frames in production mode
    const expectedFrameCount = is3SegmentFormat ? 4 : 5
    if (generationMode === 'production' && frames.length !== expectedFrameCount) {
      console.warn(`[Generate Frames] ⚠️ WARNING: Expected ${expectedFrameCount} frames in production mode (${is3SegmentFormat ? '3-segment' : '4-segment'} format), but got ${frames.length}`)
      console.warn('[Generate Frames] Expected frames:')
      if (is3SegmentFormat) {
        console.warn('  1. Hook first (segmentIndex=0, frameType=first)')
        console.warn('  2. Hook last (segmentIndex=0, frameType=last)')
        console.warn('  3. Body last (segmentIndex=1, frameType=last)')
        console.warn('  4. CTA last (segmentIndex=2, frameType=last)')
      } else {
        console.warn('  1. Hook first (segmentIndex=0, frameType=first)')
        console.warn('  2. Hook last (segmentIndex=0, frameType=last)')
        console.warn('  3. Body1 last (segmentIndex=1, frameType=last)')
        console.warn('  4. Body2 last (segmentIndex=2, frameType=last)')
        console.warn('  5. CTA last (segmentIndex=3, frameType=last)')
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
      mode: generationMode,
    }
  } catch (error: any) {
    console.error('[Generate Frames] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate frames',
    })
  }
})


