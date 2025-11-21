import { z } from 'zod'
import path from 'path'
import sharp from 'sharp'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { saveAsset, deleteFile } from '../utils/storage'
import { uploadFileToS3 } from '../utils/s3-upload'
import { createCharacterConsistencyInstruction, formatCharactersForPrompt } from '../utils/character-extractor'
import { detectSceneConflict, extractSolutionItem, extractItemInitialLocation } from '../utils/scene-conflict-checker'
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
      seamlessTransition: z.boolean().optional(), // Seamless transition toggle (default: true)
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
    
    // Extract mood and seamlessTransition from storyboard meta
    const mood = storyboard.meta.mood || 'professional'
    const seamlessTransition = storyboard.meta.seamlessTransition !== false // Default to true
    console.log(`[Generate Frames] Mood: ${mood}`)
    console.log(`[Generate Frames] Seamless Transition: ${seamlessTransition}`)

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
    // Helper function to generate transition instructions for items
    const generateItemTransitionInstructions = (
      bodySegment: Segment,
      itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }>
    ): string => {
      if (itemsWithLocations.length === 0) {
        return ''
      }

      const transitionInstructions: string[] = []
      
      for (const { item, initialLocation, actionType } of itemsWithLocations) {
        // Check if the body segment mentions the item being moved/offered/held
        const segmentText = `${bodySegment.description} ${bodySegment.visualPrompt}`.toLowerCase()
        const itemLower = item.toLowerCase()
        
        // Check for patterns indicating item is being held/offered/moved
        const heldPattern = new RegExp(`(?:holds?|holding|grasps?|grasping|carries?|carrying|offers?|offering|extends?|extending|gives?|giving|hands?|handing).*?${itemLower}`, 'i')
        const inHandsPattern = new RegExp(`(?:in|with|using).*?(?:hands?|hand|grip|grasp).*?${itemLower}`, 'i')
        const picksUpPattern = new RegExp(`(?:picks?|picking|takes?|taking|grabs?|grabbing|retrieves?|retrieving).*?(?:up|from).*?${itemLower}`, 'i')
        
        if (heldPattern.test(segmentText) || inHandsPattern.test(segmentText) || picksUpPattern.test(segmentText)) {
          // Item is being moved to hands
          transitionInstructions.push(
            `CRITICAL TRANSITION: The ${item} should transition from ${initialLocation} to being held in hands. Show the item moving from ${initialLocation} to hands, NOT appearing in both locations simultaneously.`
          )
        }
      }
      
      return transitionInstructions.length > 0 ? ` ${transitionInstructions.join(' ')}` : ''
    }

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
      let transitionItemInstruction = ''
      
      if (isTransition && transitionText && transitionVisual) {
        // Detect if next segment introduces products/items/characters that should be visible in transition frame
        const nextSegmentText = `${transitionText} ${transitionVisual}`.toLowerCase()
        
        // Generic patterns to detect products/robots/characters bringing/offering items or approaching
        // Pattern 1: Product/robot/character + action verb + item (e.g., "robot approaches with cup of tea")
        const productItemPattern = /(?:robot|product|humanoid|character|person|individual|device|machine|assistant|helper)[\w\s]*?(?:approaches?|brings?|offers?|gives?|hands?|delivers?|presents?|extends?|carries?|holds?)[\w\s]*?(?:with|holding|carrying)[\w\s]*?(?:cup|tea|coffee|beverage|item|object|food|drink|tool|product|herbal|steaming|hot|fresh)/i
        // Pattern 2: Product/robot/character approaching/entering (without specific item)
        const productApproachPattern = /(?:robot|product|humanoid|character|device|machine|assistant|helper)[\w\s]*?(?:approaches?|enters?|arrives?|comes?|walks?|moves?)/i
        // Pattern 3: Item being brought/offered (e.g., "cup of tea", "coffee", "herbal tea")
        const itemBeingBroughtPattern = /(?:cup|mug|glass|bottle|plate|bowl|container)[\w\s]*(?:of|with)?[\w\s]*(?:tea|coffee|herbal|beverage|food|drink|hot|steaming|fresh)/i
        
        const hasProductAction = productItemPattern.test(nextSegmentText) || productApproachPattern.test(nextSegmentText)
        const hasItem = itemBeingBroughtPattern.test(nextSegmentText)
        
        if (hasProductAction || hasItem) {
          // Extract the product/robot/character
          const productMatch = nextSegmentText.match(/(?:robot|product|humanoid|character|person|individual|device|machine|assistant|helper|unitree|g1)[\w\s]*?(?=\s+(?:approaches?|brings?|offers?|gives?|hands?|delivers?|presents?|extends?|enters?|arrives?|comes?|walks?|moves?|softly|gently))/i)
          // Extract the item being brought/offered
          const itemMatch = nextSegmentText.match(/(?:cup|mug|glass|bottle|plate|bowl|container)[\w\s]*(?:of|with)?[\w\s]*(?:tea|coffee|herbal|beverage|food|drink|hot|steaming|fresh)|(?:tea|coffee|herbal tea|coffee cup|beverage|food|drink|item|object|tool|product)[\w\s]*(?:cup|mug|glass|bottle)?/i)
          
          const product = productMatch ? productMatch[0].trim() : 'the product/robot/character'
          const item = itemMatch ? itemMatch[0].trim() : null
          
          if (item) {
            transitionItemInstruction = ` CRITICAL TRANSITION FRAME REQUIREMENT: The next segment shows ${product} bringing/offering ${item}. This transition frame (hook last = body first) MUST show ${product} holding ${item} in its hands, approaching with ${item} clearly visible. The ${product} and ${item} must be VISIBLE in this frame to ensure smooth continuity into the next segment. Do NOT wait until the next segment to show ${product} with ${item} - both must appear in this transition frame.`
          } else if (hasProductAction) {
            transitionItemInstruction = ` CRITICAL TRANSITION FRAME REQUIREMENT: The next segment shows ${product} approaching or entering. This transition frame (hook last = body first) MUST show ${product} approaching or entering the scene. The ${product} must be VISIBLE in this frame to ensure smooth continuity into the next segment. Do NOT wait until the next segment to show ${product} - it must appear in this transition frame.`
          }
        }
        
        basePrompt = `Scene context: ${storyText}. Visual: ${visualPrompt}. Continuing seamlessly in the same continuous flow. Next moment context: ${transitionText}. Next visual: ${transitionVisual}${transitionItemInstruction}`
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

      // Add duplicate prevention instruction for all frames
      const duplicatePrevention = `CRITICAL: Each physical item should appear in ONLY ONE location at a time. If an item is being held or in someone's hands, it should NOT also appear on surfaces. If an item is on a surface, it should NOT also appear in hands unless it is actively being picked up or transferred in this exact moment. Do NOT show the same item in multiple locations simultaneously. `

      // Add product consistency and reference image instructions if we have reference images
      if (hasReferenceImages) {
        const productConsistencyInstruction = `CRITICAL INSTRUCTIONS: Do not add new products to the scene. Only enhance existing products shown in the reference images. Keep product design and style exactly as shown in references. The reference images provided are the EXACT product you must recreate. You MUST copy the product from the reference images with pixel-perfect accuracy. Do NOT create a different product, do NOT use different colors, do NOT change the design, do NOT hallucinate new products. The product in your generated image must be visually IDENTICAL to the product in the reference images. Study every detail: exact color codes, exact design patterns, exact text/fonts, exact materials, exact textures, exact proportions, exact placement. The reference images are your ONLY source of truth for the product appearance. Ignore any text in the prompt that contradicts the reference images - the reference images take absolute priority. Generate the EXACT same product as shown in the reference images. `
        return `${characterInstruction}${noTextInstruction}${previousFrameInstruction}${duplicatePrevention}${productConsistencyInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality, product must be pixel-perfect match to reference images, product appearance must be identical to reference images ${variationReinforcement}`
      } else {
        return `${characterInstruction}${noTextInstruction}${previousFrameInstruction}${duplicatePrevention}${basePrompt}, ${moodStyle}, professional product photography, high quality ${variationReinforcement}`
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
    
    // Extract all story items from body segments BEFORE generating hook frames
    // All items that will be used in the story should be present from the hook first frame
    const allStoryItems: Array<{ item: string; action: string; actionType: 'bringing' | 'interacting' }> = []
    const itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }> = []
    if (generationMode === 'production' && bodySegments.length > 0 && hookSegment) {
      try {
        console.log('\n[Generate Frames] === Extracting story items from body segments ===')
        for (const bodySegment of bodySegments) {
          const solutionItem = await extractSolutionItem(bodySegment, story)
          if (solutionItem && solutionItem.actionType === 'bringing' && solutionItem.item) {
            allStoryItems.push({
              item: solutionItem.item,
              action: solutionItem.action,
              actionType: solutionItem.actionType
            })
            console.log(`[Generate Frames] Found story item: "${solutionItem.item}" (action: "${solutionItem.action}", type: "${solutionItem.actionType}")`)
          }
        }
        if (allStoryItems.length > 0) {
          console.log(`[Generate Frames] ✓ Extracted ${allStoryItems.length} story item(s) that should be present from hook first frame: ${allStoryItems.map(si => si.item).join(', ')}`)
          
          // Extract initial locations for each item from hook segment
          console.log('\n[Generate Frames] === Extracting initial locations for story items ===')
          for (const storyItem of allStoryItems) {
            try {
              const initialLocation = await extractItemInitialLocation(storyItem.item, hookSegment, storyItem.actionType)
              itemsWithLocations.push({
                item: storyItem.item,
                initialLocation: initialLocation || 'in the scene',
                actionType: storyItem.actionType
              })
              if (initialLocation) {
                console.log(`[Generate Frames] Found initial location for "${storyItem.item}": "${initialLocation}" (action type: "${storyItem.actionType}")`)
              } else {
                console.log(`[Generate Frames] Could not determine initial location for "${storyItem.item}", using default: "in the scene"`)
              }
            } catch (error: any) {
              console.warn(`[Generate Frames] Error extracting location for "${storyItem.item}": ${error.message}, using default`)
              itemsWithLocations.push({
                item: storyItem.item,
                initialLocation: 'in the scene',
                actionType: storyItem.actionType
              })
            }
          }
        } else {
          console.log(`[Generate Frames] No "bringing" action items found in body segments`)
        }
      } catch (error: any) {
        console.warn(`[Generate Frames] Error extracting story items: ${error.message}, continuing without item requirements`)
      }
    }
    
    console.log(`[Generate Frames] Starting SEQUENTIAL frame generation (each frame uses previous frame as input)...`)

    // SEQUENTIAL GENERATION: Each frame uses the previous frame as input
    // This follows the EXACT pipeline specification from the PRD
    
    // Frame 1: Hook first frame (no previous frame)
    // Include all story items in the hook first frame prompt
    let hookFirstFrameResult: any = null
    if (hookSegment) {
      console.log('\n[Generate Frames] === FRAME 1: Hook First Frame ===')
      
      // Build prompt with story items requirement and specific locations
      let hookVisualPrompt = hookSegment.visualPrompt
      if (itemsWithLocations.length > 0) {
        const locationsList = itemsWithLocations
          .map(i => {
            if (i.actionType === 'bringing') {
              return `${i.item} (${i.initialLocation} - NOT in person's hands yet, robot/product will bring it in the next segment)`
            }
            return `${i.item} (${i.initialLocation})`
          })
          .join(', ')
        
        const bringingItems = itemsWithLocations.filter(i => i.actionType === 'bringing')
        const bringingItemsInstruction = bringingItems.length > 0
          ? `CRITICAL STORY FLOW: The following items are being brought/offered by the robot/product in the body segment: ${bringingItems.map(i => i.item).join(', ')}. These items should be visible ${bringingItems.map(i => i.initialLocation).join(' or ')} in this initial hook frame, but they should NOT be in the person's hands yet. The robot/product will bring/offer them in the next segment. `
          : ''
        
        const itemsInstruction = `CRITICAL ITEM REQUIREMENT: The following items must be visible in this initial hook frame at their specified locations: ${locationsList}. These items are part of the story and should be present from the start at these exact locations. Do NOT show items in multiple locations - each item should be in only one place. ${bringingItemsInstruction}`
        hookVisualPrompt = itemsInstruction + hookVisualPrompt
        console.log(`[Generate Frames] Including ${itemsWithLocations.length} story item(s) with locations in hook first frame: ${locationsList}`)
      } else if (allStoryItems.length > 0) {
        // Fallback if location extraction failed
        const itemsList = allStoryItems.map(si => si.item).join(', ')
        const itemsInstruction = `CRITICAL ITEM REQUIREMENT: The following items must be visible in this initial hook frame: ${itemsList}. These items are part of the story and should be present from the start. They should be visible in the scene, not being brought or introduced - they are already part of the environment. Do NOT show items in multiple locations - each item should be in only one place. `
        hookVisualPrompt = itemsInstruction + hookVisualPrompt
        console.log(`[Generate Frames] Including ${allStoryItems.length} story item(s) in hook first frame (locations not extracted): ${itemsList}`)
      }
      
      const nanoPrompt = buildNanoPrompt(story.hook, hookVisualPrompt)
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

    // NON-SEAMLESS TRANSITION: Generate only first frames if seamlessTransition is OFF
    if (!seamlessTransition) {
      console.log('\n[Generate Frames] === NON-SEAMLESS MODE: Generating only first frames ===')
      
      // Frame 2: Body first frame (no previous frame input)
      if (body1Segment) {
        console.log('\n[Generate Frames] === FRAME 2: Body First Frame (non-seamless) ===')
        
        const nanoPrompt = buildNanoPrompt(story.bodyOne, body1Segment.visualPrompt)
        const bodyFirstFrameResult = await generateSingleFrame(
          'body first frame', 
          nanoPrompt, 
          body1Segment.visualPrompt,
          undefined  // No previous frame
        )
        
        if (bodyFirstFrameResult) {
          bodyFirstFrameResult.segmentIndex = 1
          bodyFirstFrameResult.frameType = 'first'
          frames.push(bodyFirstFrameResult)
          console.log(`[Generate Frames] ✓ Body first frame generated (${bodyFirstFrameResult.modelSource}): ${bodyFirstFrameResult.imageUrl}`)
        } else {
          console.error('[Generate Frames] ✗ Body first frame generation failed')
        }
      }
      
      // Frame 3/4: Body2 first frame (only for 4-segment format)
      if (body2Segment) {
        console.log('\n[Generate Frames] === FRAME 3: Body2 First Frame (non-seamless) ===')
        
        const nanoPrompt = buildNanoPrompt(story.bodyTwo, body2Segment.visualPrompt)
        const body2FirstFrameResult = await generateSingleFrame(
          'body2 first frame', 
          nanoPrompt, 
          body2Segment.visualPrompt,
          undefined  // No previous frame
        )
        
        if (body2FirstFrameResult) {
          body2FirstFrameResult.segmentIndex = 2
          body2FirstFrameResult.frameType = 'first'
          frames.push(body2FirstFrameResult)
          console.log(`[Generate Frames] ✓ Body2 first frame generated (${body2FirstFrameResult.modelSource}): ${body2FirstFrameResult.imageUrl}`)
        } else {
          console.error('[Generate Frames] ✗ Body2 first frame generation failed')
        }
      }
      
      // Final frame: CTA first frame (no previous frame input)
      if (ctaSegment) {
        console.log('\n[Generate Frames] === FRAME ' + (body2Segment ? '4' : '3') + ': CTA First Frame (non-seamless) ===')
        
        const nanoPrompt = buildNanoPrompt(story.callToAction, ctaSegment.visualPrompt)
        const ctaFirstFrameResult = await generateSingleFrame(
          'cta first frame', 
          nanoPrompt, 
          ctaSegment.visualPrompt,
          undefined  // No previous frame
        )
        
        if (ctaFirstFrameResult) {
          ctaFirstFrameResult.segmentIndex = body2Segment ? 3 : 2
          ctaFirstFrameResult.frameType = 'first'
          frames.push(ctaFirstFrameResult)
          console.log(`[Generate Frames] ✓ CTA first frame generated (${ctaFirstFrameResult.modelSource}): ${ctaFirstFrameResult.imageUrl}`)
        } else {
          console.error('[Generate Frames] ✗ CTA first frame generation failed')
        }
      }
      
      // Return frames for non-seamless mode
      const finalFrameCount = frames.length
      const expectedFrameCount = body2Segment ? 4 : 3  // 4 for 24s, 3 for 16s
      console.log(`\n[Generate Frames] === NON-SEAMLESS GENERATION COMPLETE ===`)
      console.log(`[Generate Frames] Generated ${finalFrameCount} frame(s) (expected ${expectedFrameCount} for ${body2Segment ? '24s' : '16s'} format)`)
      
      await trackCost('generate-frames', 0.05 * finalFrameCount, {
        frameCount: finalFrameCount,
        storyboardId: storyboard.id,
        mode: 'production',
        seamless: false,
      })
      
      return {
        frames,
        mode: 'production',
        seamless: false,
        storyboardId: storyboard.id,
      }
    }
    
    // SEAMLESS TRANSITION: Generate first AND last frames (original behavior)
    console.log('\n[Generate Frames] === SEAMLESS MODE: Generating first and last frames ===')
    
    // Frame 2: Hook last frame (uses hook first frame as input)
    let hookLastFrameResult: any = null
    // For 3-segment format, we only need body1Segment (the single body segment)
    // For 4-segment format, we need body1Segment to exist
    if (hookSegment && body1Segment && hookFirstFrameResult) {
      console.log('\n[Generate Frames] === FRAME 2: Hook Last Frame ===')
      
      // Add hook progression instruction to ensure visual progression from hook first to hook last
      const hookProgressionInstruction = `CRITICAL HOOK PROGRESSION: This hook last frame should show subtle visual progression from the hook first frame. Show a slightly different moment - camera may have moved slightly, character expression may have evolved, or lighting may have shifted. However, maintain the same scene, same characters, and same overall composition. The progression should be subtle but noticeable. `
      let hookLastVisualPrompt = hookProgressionInstruction + hookSegment.visualPrompt
      
      const nanoPrompt = buildNanoPrompt(
        story.hook, 
        hookLastVisualPrompt, 
        true, 
        story.bodyOne, 
        body1Segment.visualPrompt,
        hookFirstFrameResult.imageUrl  // Use hook first frame as input
      )
      hookLastFrameResult = await generateSingleFrame(
        'hook last frame', 
        nanoPrompt, 
        hookLastVisualPrompt,
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
        
        // Add item transition instructions to body segment visual prompt
        let body1VisualPrompt = body1Segment.visualPrompt
        if (itemsWithLocations.length > 0) {
          const transitionInstructions = generateItemTransitionInstructions(body1Segment, itemsWithLocations)
          if (transitionInstructions) {
            body1VisualPrompt = body1VisualPrompt + transitionInstructions
            console.log(`[Generate Frames] Added item transition instructions to body segment`)
          }
        }
        
        const nanoPrompt = buildNanoPrompt(
          story.bodyOne, 
          body1VisualPrompt, 
          true, 
          story.callToAction, 
          ctaSegment.visualPrompt,
          hookLastFrameResult.imageUrl  // Use hook last frame (= Body first frame) as input
        )
        bodyLastFrameResult = await generateSingleFrame(
          'body last frame', 
          nanoPrompt, 
          body1VisualPrompt,
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
        
        // Add item transition instructions to body1 segment visual prompt
        let body1VisualPrompt = body1Segment.visualPrompt
        if (itemsWithLocations.length > 0) {
          const transitionInstructions = generateItemTransitionInstructions(body1Segment, itemsWithLocations)
          if (transitionInstructions) {
            body1VisualPrompt = body1VisualPrompt + transitionInstructions
            console.log(`[Generate Frames] Added item transition instructions to body1 segment`)
          }
        }
        
        const nanoPrompt = buildNanoPrompt(
          story.bodyOne, 
          body1VisualPrompt, 
          true, 
          story.bodyTwo, 
          body2Segment.visualPrompt,
          hookLastFrameResult.imageUrl  // Use hook last frame (= Body1 first frame) as input
        )
        body1LastFrameResult = await generateSingleFrame(
          'body1 last frame', 
          nanoPrompt, 
          body1VisualPrompt,
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
        
        // Add item transition instructions to body2 segment visual prompt
        let body2VisualPrompt = body2Segment.visualPrompt
        if (itemsWithLocations.length > 0) {
          const transitionInstructions = generateItemTransitionInstructions(body2Segment, itemsWithLocations)
          if (transitionInstructions) {
            body2VisualPrompt = body2VisualPrompt + transitionInstructions
            console.log(`[Generate Frames] Added item transition instructions to body2 segment`)
          }
        }
        
        const nanoPrompt = buildNanoPrompt(
          story.bodyTwo, 
          body2VisualPrompt, 
          true, 
          story.callToAction, 
          ctaSegment.visualPrompt,
          body1LastFrameResult.imageUrl  // Use body1 last frame (= Body2 first frame) as input
        )
        body2LastFrameResult = await generateSingleFrame(
          'body2 last frame', 
          nanoPrompt, 
          body2VisualPrompt,
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
    
    // Validate hook last frame exists (critical for frame assignment)
    const hookLastFrame = frames.find(f => f.segmentIndex === 0 && f.frameType === 'last')
    if (!hookLastFrame && generationMode === 'production') {
      console.error('[Generate Frames] ✗✗✗ CRITICAL ERROR: Hook last frame is missing!')
      console.error('[Generate Frames] This will cause "Segment 0 (hook) missing last frame" error')
      // Attempt to use hookLastFrameResult if it exists
      if (hookLastFrameResult) {
        console.log('[Generate Frames] Attempting to recover using hookLastFrameResult...')
        hookLastFrameResult.segmentIndex = 0
        hookLastFrameResult.frameType = 'last'
        frames.push(hookLastFrameResult)
        console.log('[Generate Frames] ✓ Recovered hook last frame from hookLastFrameResult')
      } else {
        console.error('[Generate Frames] ✗ Cannot recover - hookLastFrameResult is also null')
      }
    } else if (hookLastFrame) {
      console.log('[Generate Frames] ✓ Hook last frame validated: present in frames array')
    }
    
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

    // Perform prompt refinement after frames are generated
    let promptsRefined = false
    if (generationMode === 'production' && frames.length > 0) {
      try {
        console.log('\n[Generate Frames] === Refining visual prompts based on generated frames ===')
        
        const { refineVisualPromptFromFrames } = await import('../utils/scene-conflict-checker')
        
        // Refine prompts for each segment
        for (let segmentIndex = 0; segmentIndex < storyboard.segments.length; segmentIndex++) {
          const segment = storyboard.segments[segmentIndex]
          
          // Get first and last frames for this segment
          const firstFrame = frames.find(f => f.segmentIndex === segmentIndex && f.frameType === 'first')
          const lastFrame = frames.find(f => f.segmentIndex === segmentIndex && f.frameType === 'last')
          
          // Collect frame images (first and last if available)
          const segmentFrameImages: string[] = []
          if (firstFrame?.imageUrl) {
            segmentFrameImages.push(firstFrame.imageUrl)
          }
          if (lastFrame?.imageUrl && lastFrame.imageUrl !== firstFrame?.imageUrl) {
            segmentFrameImages.push(lastFrame.imageUrl)
          }
          
          if (segmentFrameImages.length > 0 && segment.visualPrompt) {
            try {
              console.log(`[Generate Frames] Refining prompt for segment ${segmentIndex} (${segment.type})...`)
              const refinedPrompt = await refineVisualPromptFromFrames(
                segment,
                segmentFrameImages,
                segment.visualPrompt,
                story
              )
              
              if (refinedPrompt && refinedPrompt !== segment.visualPrompt) {
                segment.visualPrompt = refinedPrompt
                promptsRefined = true
                console.log(`[Generate Frames] ✓ Refined prompt for segment ${segmentIndex} (${segment.type})`)
              } else {
                console.log(`[Generate Frames] Prompt unchanged for segment ${segmentIndex} (${segment.type})`)
              }
            } catch (error: any) {
              console.error(`[Generate Frames] Error refining prompt for segment ${segmentIndex}:`, error.message)
              // Continue with other segments even if one fails
            }
          } else {
            console.log(`[Generate Frames] Skipping refinement for segment ${segmentIndex}: missing frames or visual prompt`)
          }
        }
        
        // Save updated storyboard with refined prompts
        if (promptsRefined) {
          const { saveStoryboard } = await import('../utils/storage')
          await saveStoryboard(storyboard)
          console.log('[Generate Frames] ✓ Saved storyboard with refined prompts')
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error during prompt refinement:', error.message)
        // Don't fail the entire request if refinement fails
      }
    }

    // Perform scene conflict detection after frames are generated
    let conflictDetected = false
    let conflictDetails: { hasConflict: boolean; item?: string; detectedInFrames?: string[]; confidence?: number; actionType?: 'bringing' | 'interacting' } | null = null
    let framesRegenerated = false
    const maxRegenerationAttempts = 2
    let regenerationAttempts = 0

    if (generationMode === 'production' && frames.length > 0) {
      try {
        console.log('\n[Generate Frames] === Checking for scene conflicts ===')
        
        // Get hook first and last frames
        const hookFirstFrame = frames.find(f => f.segmentIndex === 0 && f.frameType === 'first')
        const hookLastFrame = frames.find(f => f.segmentIndex === 0 && f.frameType === 'last')
        
        // Get first body segment
        const body1Segment = storyboard.segments.find(s => s.type === 'body')
        
        if (hookFirstFrame && hookLastFrame && body1Segment) {
          const hookFrameUrls = [hookFirstFrame.imageUrl, hookLastFrame.imageUrl].filter(Boolean) as string[]
          
          if (hookFrameUrls.length > 0) {
            console.log(`[Generate Frames] Checking ${hookFrameUrls.length} hook frame(s) for conflicts with body segment solution...`)
            conflictDetails = await detectSceneConflict(hookFrameUrls, body1Segment, story)
            conflictDetected = conflictDetails.hasConflict
            
            if (conflictDetected && conflictDetails.item && regenerationAttempts < maxRegenerationAttempts) {
              const actionTypeInfo = conflictDetails.actionType ? ` (action type: ${conflictDetails.actionType})` : ''
              console.warn(`[Generate Frames] ⚠️ SCENE CONFLICT DETECTED: ${conflictDetails.item} is MISSING from hook scene${actionTypeInfo}`)
              console.log(`[Generate Frames] Item should be present from the hook first frame but was not detected`)
              
              // Regenerate frames to include missing items
              regenerationAttempts++
              console.log(`\n[Generate Frames] === Regenerating hook frames to include missing item (attempt ${regenerationAttempts}/${maxRegenerationAttempts}) ===`)
              
              const hookSegment = storyboard.segments.find(s => s.type === 'hook')
              if (!hookSegment) {
                console.error('[Generate Frames] Hook segment not found, cannot regenerate frames')
              } else {
                // Identify which frames need regeneration (all hook frames should include the item)
                const framesToRegenerate: Array<{ frame: typeof hookFirstFrame | typeof hookLastFrame; frameType: 'first' | 'last'; segmentIndex: number }> = []
                
                // Always regenerate hook first frame if item is missing (item should be present from the start)
                framesToRegenerate.push({ frame: hookFirstFrame, frameType: 'first', segmentIndex: 0 })
                // Also regenerate hook last frame to maintain consistency
                framesToRegenerate.push({ frame: hookLastFrame, frameType: 'last', segmentIndex: 0 })
                
                console.log(`[Generate Frames] Regenerating ${framesToRegenerate.length} hook frame(s) to include "${conflictDetails.item}"`)
                
                // Regenerate each frame to include the missing item
                for (const { frame, frameType, segmentIndex } of framesToRegenerate) {
                  try {
                    console.log(`[Generate Frames] Regenerating hook ${frameType} frame to include "${conflictDetails.item}"...`)
                    
                    // Modify visual prompt to include the missing item
                    // Add instruction to ensure item is visible
                    const itemInstruction = `CRITICAL ITEM REQUIREMENT: The item "${conflictDetails.item}" must be visible in this frame. It should be present in the scene, not being brought or introduced - it is already part of the environment. `
                    const modifiedVisualPrompt = itemInstruction + hookSegment.visualPrompt
                    
                    console.log(`[Generate Frames] ✓ Visual prompt modified to include "${conflictDetails.item}"`)
                    
                    // Determine previous frame for continuity
                    let previousFrameImage: string | undefined = undefined
                    let currentSceneText: string | undefined = undefined
                    let isTransition = false
                    let transitionText: string | undefined = undefined
                    let transitionVisual: string | undefined = undefined
                    
                    if (frameType === 'first') {
                      // Hook first frame: no previous frame
                      currentSceneText = story.hook
                    } else {
                      // Hook last frame: uses hook first as previous, transitions to body1
                      previousFrameImage = hookFirstFrame.imageUrl
                      currentSceneText = story.hook
                      isTransition = true
                      transitionText = story.bodyOne
                      transitionVisual = body1Segment.visualPrompt
                    }
                    
                    // Build nano prompt with modified visual prompt
                    const nanoPrompt = buildNanoPrompt(
                      currentSceneText || story.hook,
                      modifiedVisualPrompt,
                      isTransition,
                      transitionText,
                      transitionVisual,
                      previousFrameImage
                    )
                    
                    // Regenerate the frame
                    const regeneratedFrame = await generateSingleFrame(
                      `hook ${frameType} frame (regenerated)`,
                      nanoPrompt,
                      modifiedVisualPrompt,
                      previousFrameImage,
                      currentSceneText,
                      isTransition,
                      transitionText,
                      transitionVisual,
                      true
                    )
                    
                    if (regeneratedFrame) {
                      // Ensure segmentIndex and frameType are set correctly
                      regeneratedFrame.segmentIndex = segmentIndex
                      regeneratedFrame.frameType = frameType
                      
                      // Update the frame in the frames array
                      const frameIndex = frames.findIndex(f => f.segmentIndex === segmentIndex && f.frameType === frameType)
                      if (frameIndex >= 0) {
                        frames[frameIndex] = regeneratedFrame
                        console.log(`[Generate Frames] ✓ Frame regenerated: ${regeneratedFrame.imageUrl}`)
                      } else {
                        // Frame not found in array - add it (this fixes missing hook last frame issue)
                        frames.push(regeneratedFrame)
                        console.log(`[Generate Frames] ✓ Frame regenerated and added to frames array: ${regeneratedFrame.imageUrl}`)
                      }
                      
                      // Handle frame continuity: if hook last is regenerated, update body1 first frame
                      if (frameType === 'last' && segmentIndex === 0) {
                        const body1SegmentIndex = storyboard.segments.findIndex(s => s.type === 'body')
                        if (body1SegmentIndex >= 0) {
                          storyboard.segments[body1SegmentIndex].firstFrameImage = regeneratedFrame.imageUrl
                          console.log(`[Generate Frames] ✓ Updated body1 first frame to match regenerated hook last frame`)
                        }
                      }
                      
                      // Update segment's frame image
                      if (frameType === 'first') {
                        hookSegment.firstFrameImage = regeneratedFrame.imageUrl
                      } else {
                        hookSegment.lastFrameImage = regeneratedFrame.imageUrl
                      }
                      
                      framesRegenerated = true
                    } else {
                      console.error(`[Generate Frames] Failed to regenerate hook ${frameType} frame`)
                    }
                  } catch (error: any) {
                    console.error(`[Generate Frames] Error regenerating hook ${frameType} frame:`, error.message)
                    // Continue with other frames even if one fails
                  }
                }
                
                // Re-analyze regenerated frames to verify conflict is resolved
                if (framesRegenerated) {
                  console.log(`\n[Generate Frames] === Re-analyzing regenerated frames for conflicts ===`)
                  const updatedHookFirstFrame = frames.find(f => f.segmentIndex === 0 && f.frameType === 'first')
                  const updatedHookLastFrame = frames.find(f => f.segmentIndex === 0 && f.frameType === 'last')
                  
                  if (updatedHookFirstFrame && updatedHookLastFrame && body1Segment) {
                    const updatedHookFrameUrls = [updatedHookFirstFrame.imageUrl, updatedHookLastFrame.imageUrl].filter(Boolean) as string[]
                    const reanalysisResult = await detectSceneConflict(updatedHookFrameUrls, body1Segment, story)
                    
                    if (reanalysisResult.hasConflict) {
                      console.warn(`[Generate Frames] ⚠️ Conflict still detected after regeneration: ${reanalysisResult.item} is still missing from hook frames`)
                      conflictDetected = true
                      conflictDetails = reanalysisResult
                      
                      // Try one more time if we haven't exceeded max attempts
                      if (regenerationAttempts < maxRegenerationAttempts) {
                        console.log(`[Generate Frames] Will attempt regeneration again (attempt ${regenerationAttempts + 1}/${maxRegenerationAttempts})`)
                        // Note: This will be handled in the next iteration if needed
                      } else {
                        console.warn(`[Generate Frames] Max regeneration attempts reached, proceeding with conflict`)
                      }
                    } else {
                      console.log(`[Generate Frames] ✓ Conflict resolved after frame regeneration: ${reanalysisResult.item} is now present in hook frames`)
                      conflictDetected = false
                      conflictDetails = reanalysisResult
                    }
                  }
                  
                  // Save updated storyboard with new frame URLs
                  const { saveStoryboard } = await import('../utils/storage')
                  await saveStoryboard(storyboard)
                  console.log('[Generate Frames] ✓ Saved storyboard with regenerated frames')
                }
              }
            } else if (conflictDetected) {
              const actionTypeInfo = conflictDetails.actionType ? ` (action type: ${conflictDetails.actionType})` : ''
              console.warn(`[Generate Frames] ⚠️ SCENE CONFLICT DETECTED: ${conflictDetails.item} is MISSING from hook scene${actionTypeInfo}`)
              if (regenerationAttempts >= maxRegenerationAttempts) {
                console.warn(`[Generate Frames] Max regeneration attempts (${maxRegenerationAttempts}) reached, proceeding with conflict`)
              }
            } else {
              const actionTypeInfo = conflictDetails?.actionType ? ` (action type: ${conflictDetails.actionType})` : ''
              if (conflictDetails?.item) {
                console.log(`[Generate Frames] ✓ No scene conflicts detected: ${conflictDetails.item} is correctly present in hook frames${actionTypeInfo}`)
              } else {
                console.log(`[Generate Frames] ✓ No scene conflicts detected${actionTypeInfo}`)
              }
            }
          }
        } else {
          console.log('[Generate Frames] Skipping conflict detection: missing required frames or body segment')
        }
      } catch (error: any) {
        console.error('[Generate Frames] Error during conflict detection:', error.message)
        // Don't fail the entire request if conflict detection fails
        conflictDetected = false
      }
    }

    return {
      frames,
      storyboardId: storyboard.id,
      mode: generationMode,
      seamless: seamlessTransition, // Include seamless flag
      ...(promptsRefined ? {
        promptsRefined: true,
        storyboard, // Include updated storyboard with refined prompts
      } : {}),
      ...(framesRegenerated ? {
        framesRegenerated: true,
        storyboard, // Include updated storyboard with regenerated frames
      } : {}),
      ...(conflictDetected && conflictDetails ? {
        conflictDetected: true,
        conflictDetails,
      } : {}),
    }
  } catch (error: any) {
    console.error('[Generate Frames] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate frames',
    })
  }
})


