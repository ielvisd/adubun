import { z } from 'zod'
import path from 'path'
import sharp from 'sharp'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { saveAsset, deleteFile } from '../utils/storage'
import { uploadFileToS3 } from '../utils/s3-upload'
import { createCharacterConsistencyInstruction, formatCharactersForPrompt } from '../utils/character-extractor'
import { detectSceneConflict, extractSolutionItem, extractItemInitialLocation } from '../utils/scene-conflict-checker'
import { sanitizeVideoPrompt } from '../utils/prompt-sanitizer'
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
      audioNotes: z.string().optional(),
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
  avatarReference: z.array(z.string()).optional(),
  avatarId: z.string().optional(),
  story: z.object({
    description: z.string(),
    hook: z.string(),
    bodyOne: z.string(),
    bodyTwo: z.string(),
    callToAction: z.string(),
  }),
  mode: z.enum(['demo', 'production']).optional(),
  price: z.number().optional(), // Sale price for CTA text overlay
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

// Top-level helper to sanitize story text (replace teenage/teen references with character age)
function sanitizeStoryText(text: string, characterAge: string | undefined): string {
  return sanitizeVideoPrompt(text, characterAge)
}

// Top-level helper to sanitize visual prompts
function sanitizeVisualPrompt(prompt: string, characterAge: string | undefined): string {
  return sanitizeVideoPrompt(prompt, characterAge)
}

// Top-level async helper to resolve image paths and convert to URLs for Replicate
async function resolveImagePath(imagePath: string): Promise<string> {
  // If it's already a URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }
  
  // Resolve to absolute path first
  let absolutePath: string
  if (imagePath.startsWith('/')) {
    // Public folder path - resolve relative to public folder
    const publicPath = imagePath.slice(1)
    absolutePath = path.resolve(process.cwd(), 'public', publicPath)
    console.log(`[Generate Frames] Resolved public path: ${imagePath} -> ${absolutePath}`)
  } else if (path.isAbsolute(imagePath)) {
    absolutePath = imagePath
  } else {
    absolutePath = path.resolve(process.cwd(), imagePath)
  }
  
  // Convert local file to URL using uploadFileToReplicate (uploads to S3 or serves locally)
  const { uploadFileToReplicate } = await import('../utils/replicate-upload')
  const url = await uploadFileToReplicate(absolutePath)
  console.log(`[Generate Frames] Converted local file to URL: ${absolutePath} -> ${url}`)
  return url
}

// Top-level helper to generate transition instructions for items
function generateItemTransitionInstructions(
  bodySegment: Segment,
  itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }>
): string {
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
        `CRITICAL TRANSITION - NO DUPLICATES: The ${item} should transition from ${initialLocation} to being held in hands. During this transition, the item must be in ONLY ONE location at any given moment. Do NOT show the item in both ${initialLocation} AND in hands simultaneously. Show the item moving from one location to the other, but NEVER in both places at the same time. CRITICAL ITEM STATE: The ${item} is now being held/offered. It should NO LONGER be at ${initialLocation}. It should be in ONLY ONE location: in hands. Do NOT show the ${item} in both ${initialLocation} and in hands - it must be in ONLY ONE place.`
      )
    }
  }
  
  return transitionInstructions.length > 0 ? ` ${transitionInstructions.join(' ')}` : ''
}

// Top-level helper to build nano-banana prompts
function buildNanoPrompt(
  storyText: string, 
  visualPrompt: string,
  mood: string | null,
  referenceImages: string[],
  characters: Character[],
  isTransition: boolean = false, 
  transitionText?: string, 
  transitionVisual?: string,
  previousFrameImage?: string,
  trackedItems?: Array<{item: string, initialLocation: string, actionType: 'bringing' | 'interacting'}>,
  avatarDesc?: string | null,
  avatarLook?: string | null,
  hookFirstFrameUrl?: string | null
): string {
  const moodStyle = mood ? `${mood} style` : 'professional style'
  const hasReferenceImages = referenceImages.length > 0
  
  // Detect if product is makeup/cosmetics
  const isMakeupProduct = (() => {
    const combinedText = `${storyText} ${visualPrompt} ${transitionText || ''} ${transitionVisual || ''}`.toLowerCase()
    const makeupKeywords = ['makeup', 'cosmetic', 'lipstick', 'foundation', 'concealer', 'mascara', 'eyeliner', 'blush', 'bronzer', 'highlighter', 'eyeshadow', 'lip gloss', 'lip balm', 'make-up', 'beauty product', 'beauty item']
    return makeupKeywords.some(keyword => combinedText.includes(keyword))
  })()
  
  // Detect if product is skincare
  const isSkincareProduct = (() => {
    const combinedText = `${storyText} ${visualPrompt} ${transitionText || ''} ${transitionVisual || ''}`.toLowerCase()
    const skincareKeywords = ['skincare', 'serum', 'acne', 'treatment', 'moisturizer', 'cleanser', 'toner', 'essence', 'cream', 'lotion', 'skincare product', 'beauty serum', 'acne treatment', 'skin care', 'face serum', 'skin serum', 'anti-aging', 'anti aging', 'wrinkle', 'dark spot', 'spot treatment']
    return skincareKeywords.some(keyword => combinedText.includes(keyword))
  })()
  
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
        transitionItemInstruction = ` CRITICAL TRANSITION FRAME REQUIREMENT: The next segment shows ${product} approaching or entering. This transition frame (hook last = body first) MUST show ${product} approaching or entering the scene. The ${product} must be VISIBLE in this frame to ensure smooth continuity into the next segment. DO NOT wait until the next segment to show ${product} - it must appear in this transition frame.`
      }
    }
    
    // Enhanced transition instructions for logical progression (zero cuts)
    const logicalProgressionInstruction = `CRITICAL LOGICAL PROGRESSION - ZERO CUTS REQUIREMENT: This transition frame must show a logical, natural progression from the current moment to the next moment. The progression should allow VEO to animate smoothly without any cuts or jumps. Use one or more of these natural progression methods: 1) Character movement (character walking, gesturing, changing pose, moving from position A to B), 2) Item transitions (items being passed, handed off, moved, or transferred naturally), 3) Camera following action (camera panning, tracking, or following the character/item movement). The frame should show an intermediate state that bridges the current scene to the next scene naturally. The progression must be logical and continuous - show the character/item in motion or in a transitional state that makes the next moment feel like a natural continuation, not a cut. Use whatever progression method makes the most sense for this specific scene. `
    
    basePrompt = `Scene context: ${storyText}. Visual: ${visualPrompt}. Continuing seamlessly in the same continuous flow. Next moment context: ${transitionText}. Next visual: ${transitionVisual}${logicalProgressionInstruction}${transitionItemInstruction}`
  } else {
    basePrompt = `Scene context: ${storyText}. Visual: ${visualPrompt}`
  }
  
  // Add avatar description if avatar is selected
  let avatarInstruction = ''
  if (avatarDesc && avatarLook) {
    avatarInstruction = `CRITICAL AVATAR CONSISTENCY: The main character in this scene must be ${avatarDesc}. This character must appear with IDENTICAL appearance across all frames: same ${avatarLook}. Maintain exact same gender, age, physical features, and clothing style. Use the avatar reference images provided to ensure pixel-perfect character consistency. `
  }
  
  // Add character consistency instructions if we have characters
  let characterInstruction = ''
  if (characters.length > 0) {
    const characterDescriptions = formatCharactersForPrompt(characters)
    characterInstruction = `🚨🚨🚨 CRITICAL: FOREGROUND CONSISTENCY - CHARACTER CONSISTENCY (MANDATORY): The exact same characters from previous scenes must appear with IDENTICAL appearance: ${characterDescriptions}. Maintain exact same gender, age, physical features (hair color/style, build), and clothing style for each character. Do NOT change character gender, age, or physical appearance. Characters must maintain the EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), and EXACT same position in the foreground across ALL frames. Only camera angles, poses, and compositions may change - foreground character elements must remain pixel-perfect consistent. Use phrases like "the same [age] [gender] person with [features]" to ensure consistency. `
  }
  
  // Add previous frame continuity instruction if we have a previous frame
  let previousFrameInstruction = ''
  if (previousFrameImage) {
    if (isTransition) {
      // For transitions between scenes: maintain continuous flow but REQUIRE visual distinction
    previousFrameInstruction = `CRITICAL CONTINUOUS FLOW - MANDATORY VISUAL PROGRESSION: Use the previous frame image as a visual reference to maintain CONTINUOUS story flow. Keep the same characters (IDENTICAL appearance - same clothing, same physical features), same environment, same lighting style. 🚨🚨🚨 CRITICAL: Maintain the EXACT same background, environment, and setting - do NOT change scenes, backgrounds, or environments. The same room, same location, same background elements must appear consistently. 🚨🚨🚨 MANDATORY VISUAL PROGRESSION - SIGNIFICANT VISUAL DISTINCTION - ABSOLUTE REQUIREMENT: This frame MUST be SIGNIFICANTLY visually different from the previous frame. While maintaining the EXACT SAME background, environment, and setting, at least 2 of the following MUST differ: 1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). The character MUST have a DIFFERENT pose AND different action. Do NOT create an identical or nearly identical frame. Examples of progression: ✅ character moving from standing to sitting, ✅ character changing from holding product to applying it, ✅ character changing facial expression from neutral to smiling, ✅ character shifting from one gesture to another, ✅ character moving hands from one position to another. The scene should feel like ONE continuous shot with NO cuts, jumps, or scene changes, but the character MUST show clear visual progression with different poses, different actions, and different camera angles/compositions. This is a MANDATORY requirement - frames must show evolving poses, actions, and visual composition. Any frame that looks similar to the previous frame will be rejected. `
    } else {
      // For progression within same scene: FORCE different angle/composition while maintaining character consistency
      previousFrameInstruction = `CRITICAL SCENE PROGRESSION - MANDATORY VISUAL VARIATION WITH CHARACTER AND BACKGROUND CONSISTENCY: This final frame MUST be SIGNIFICANTLY visually different from the previous frame in composition, camera angle, and pose. However, you MUST maintain IDENTICAL character appearance AND IDENTICAL background/environment from the previous frame: EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), NO glasses if previous frame had no glasses, SAME glasses if previous frame had glasses. 🚨🚨🚨 CRITICAL: You MUST also maintain the EXACT same background, environment, and setting - same room, same location, same background elements, same walls, same surfaces, same lighting environment. Do NOT change scenes, backgrounds, or environments. The background must be EXACTLY the same as the previous frame. You MUST create a DISTINCT visual composition by: 1) Using a DIFFERENT camera angle (switch from medium to close-up, or wide to over-shoulder, or front to side/three-quarter angle), 2) Changing character pose and body language (different standing/sitting position, different gesture, different facial expression, different body orientation), 3) Altering composition and framing (different character placement in frame, different focal point, different depth of field, different framing style). The previous frame image is for character AND background/setting reference - DO NOT copy its composition, camera angle, pose, or framing, but DO copy the exact character appearance (clothing, accessories, physical features) AND the exact background/environment. Show a DISTINCT later moment with CLEAR visual progression while maintaining the SAME character AND SAME background. Text changes alone are NOT sufficient - the entire visual composition must be different, but the character AND background must look IDENTICAL. Do NOT create stylized backgrounds, graphic overlays, or different environments. `
    }
  }

  // Add variation reinforcement
  let variationReinforcement = ''
  if (previousFrameImage && !isTransition) {
    variationReinforcement = ` FINAL MANDATORY INSTRUCTION: IGNORE the input image composition, camera angle, and pose. You MUST create a visually DISTINCT final frame with a NEW camera angle and pose. However, you MUST copy the EXACT character appearance from the input image: same clothing, same accessories (glasses/no glasses), same physical features. Do not copy the previous frame's composition, but DO copy the character's appearance exactly. `
  }

  // Build item-specific duplicate prevention if items are tracked
  let duplicatePrevention = ''
  if (trackedItems && trackedItems.length > 0) {
    const itemNames = trackedItems.map(i => `"${i.item}"`).join(', ')
    const firstItem = trackedItems[0].item
    duplicatePrevention = `🚨 CRITICAL DUPLICATE PREVENTION - ABSOLUTE REQUIREMENT: The following items must appear in ONLY ONE location at a time: ${itemNames}. For example, if "${firstItem}" is on a table, it must NOT also be in someone's hands. If "${firstItem}" is in someone's hands, it must NOT also be on a table. Each item can exist in ONLY ONE place at any given moment. Do NOT show the same item in multiple locations simultaneously. This is a MANDATORY requirement - any frame showing duplicate items will be rejected. `
  } else {
    duplicatePrevention = `🚨 CRITICAL DUPLICATE PREVENTION: Each physical item should appear in ONLY ONE location at a time. If an item is being held or in someone's hands, it should NOT also appear on surfaces. If an item is on a surface, it should NOT also appear in hands unless it is actively being picked up or transferred in this exact moment. Do NOT show the same item in multiple locations simultaneously. `
  }
  
  // REVISED: Use positive, affirmative language for anatomy (placed at beginning for highest priority)
  const bodyPartPrevention = `🚨🚨🚨 CRITICAL BODY PROPORTIONS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: The character in this scene is a normal human being with standard human anatomy and CORRECT body proportions. They have EXACTLY: two hands (one left, one right), two arms (one left, one right), two legs, and one head. All body parts are properly proportioned, naturally sized, and correctly positioned. This is a realistic photograph of a real person with normal human body structure. 

ABSOLUTELY DO NOT GENERATE:
❌ Multiple limbs: NO extra arms, NO extra legs, NO more than 2 arms, NO more than 2 legs, NO duplicate limbs
❌ Disproportionate body parts: NO huge arms, NO oversized hands, NO abnormally large limbs, NO tiny arms, NO disproportionate body parts
❌ Anatomical deformities: NO deformed anatomy, NO abnormal proportions, NO malformed limbs, NO incorrect body structure
❌ Examples of REJECTED anatomy: character with 3 arms, character with huge oversized arm, character with multiple hands, character with disproportionate limbs

MUST GENERATE:
✅ Exactly 2 arms (one left, one right) - properly proportioned and naturally sized
✅ Exactly 2 hands (one left, one right) - properly proportioned and naturally sized  
✅ Exactly 2 legs - properly proportioned and naturally sized
✅ All body parts in correct proportions relative to the character's body size
✅ Natural, realistic human anatomy with standard body proportions
✅ Character's hands and arms are clearly visible, correctly numbered, and properly proportioned

This is a MANDATORY requirement - any frame showing multiple limbs, disproportionate body parts, or anatomical deformities will be REJECTED. `

  // Add character visibility requirement (always visible, especially for CTA frames)
  let characterVisibilityInstruction = ''
  // Always require character visibility, especially for CTA frames
  characterVisibilityInstruction = `🚨🚨🚨 CRITICAL CHARACTER VISIBILITY - ABSOLUTE MANDATORY REQUIREMENT: The main character MUST be VISIBLE in this frame at all times. Even when zooming on products, showing product close-ups, text overlays, logo lockups, or focusing on product details, the character must remain visible in the frame. The character can be in the background, side, foreground, or any position, but MUST be present and visible. DO NOT create frames that show only the product without the character visible. This is a MANDATORY requirement - the character must appear in EVERY frame, including CTA frames. For CTA frames specifically, the character MUST be visible even when text overlays and logos are present. `

  // Add product visibility requirement (product must be visible when product is part of the story)
  let productVisibilityInstruction = ''
  // Check if product is mentioned in story or visual prompt, or if reference images exist
  const hasProduct = hasReferenceImages || 
    /product|bottle|container|item|package|tube|jar|pump|dropper|serum|cream|moisturizer|makeup|cosmetic|lipstick|foundation/i.test(`${storyText} ${visualPrompt}`)
  
  if (hasProduct) {
    productVisibilityInstruction = `🚨🚨🚨 CRITICAL PRODUCT VISIBILITY - ABSOLUTE MANDATORY REQUIREMENT: The product MUST be VISIBLE in this frame at all times. Even when focusing on the character, showing character close-ups, text overlays, logo lockups, or character actions, the product must remain visible in the frame. The product can be in the character's hands, on a surface, in the background, foreground, or any position, but MUST be present and visible. DO NOT create frames that show only the character without the product visible. This is a MANDATORY requirement - the product must appear in EVERY frame, including CTA frames. For CTA frames specifically, the product MUST be visible even when text overlays and logos are present. Both the character AND the product must be visible together in the same frame. `
  }

  // Add hand consistency instruction if product is present
  let handConsistencyInstruction = ''
  if (hasProduct) {
    // Extract hand preference from visual prompt
    const productHand = extractProductHand(visualPrompt)
    if (productHand) {
      handConsistencyInstruction = `🚨🚨🚨 CRITICAL PRODUCT HAND CONSISTENCY - ABSOLUTE MANDATORY REQUIREMENT: The character MUST hold the product in the ${productHand} hand throughout this frame. This maintains continuity from previous frames. Do NOT switch hands - the product must remain in the ${productHand} hand. If this is a subsequent frame, the product MUST be in the same ${productHand} hand as in previous frames. This is a MANDATORY requirement for visual consistency. `
    } else if (previousFrameImage) {
      // If we have a previous frame but no explicit hand in current prompt, enforce consistency
      handConsistencyInstruction = `🚨🚨🚨 CRITICAL PRODUCT HAND CONSISTENCY - ABSOLUTE MANDATORY REQUIREMENT: The character MUST hold the product in the SAME hand as shown in the previous frame. Maintain hand consistency - if the product was in the left hand in the previous frame, it must remain in the left hand. If it was in the right hand, it must remain in the right hand. Do NOT switch hands between frames. This is a MANDATORY requirement for visual continuity. `
    } else {
      // First frame with product - establish hand preference
      handConsistencyInstruction = `🚨🚨🚨 CRITICAL PRODUCT HAND CONSISTENCY - ABSOLUTE MANDATORY REQUIREMENT: Once the character holds the product in a specific hand (left or right), they MUST maintain that same hand across ALL subsequent frames. Do NOT switch hands between frames. Establish a consistent hand preference and maintain it throughout all frames. This is a MANDATORY requirement for visual consistency. `
    }
  }

  // Add mirror/reflection exclusion instruction
  const mirrorExclusionInstruction = `🚨🚨🚨 CRITICAL - NO MIRRORS OR REFLECTIONS (ABSOLUTE MANDATORY): DO NOT include mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection in this frame. DO NOT generate images with mirrors visible. DO NOT describe mirrors in the visual prompt. This is a MANDATORY requirement - any frame containing mirrors or reflections will be rejected. The generated image must NOT show any mirrors or reflective surfaces. `
  
  // Add background/scene consistency instruction
  const backgroundConsistencyInstruction = `🚨🚨🚨 CRITICAL - BACKGROUND/SCENE CONSISTENCY (ABSOLUTE MANDATORY - ZERO TOLERANCE): Maintain the EXACT same background, environment, and setting as the previous frame. Do NOT change scenes, backgrounds, or environments. Do NOT change rooms, locations, or background elements. The same room, same location, same background elements, same walls, same surfaces, same lighting environment must appear EXACTLY the same. ONLY camera angles, character poses, and product positions may change - the background/scene/environment must remain IDENTICAL. If the previous frame was in a bathroom with a white sink, this frame MUST be in the SAME bathroom with the SAME white sink. If the previous frame was in a kitchen with a countertop, this frame MUST be in the SAME kitchen with the SAME countertop. Do NOT create stylized backgrounds, graphic overlays, or different environments. The background must be EXACTLY the same as the previous frame - copy the background from the previous frame image. This is a HARD REQUIREMENT - any frame with a different background will be rejected. `
  
  // Add skin imperfection prevention (apply to ALL ads, including hook/opening frames)
  const skinQualityInstruction = `🚨🚨🚨 CRITICAL SKIN QUALITY - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: ALL characters in this frame MUST have PERFECT, FLAWLESS, HEALTHY skin with ZERO imperfections. This applies to EVERY frame including hook/opening frames, body frames, and CTA frames. This is a HARD REQUIREMENT with ZERO TOLERANCE. DO NOT show ANY of the following: pimples, acne, blemishes, blackheads, whiteheads, spots, marks, scars, discoloration, redness, irritation, rashes, skin texture issues, pores, wrinkles (unless character is elderly), age spots, freckles (unless naturally part of character description), moles (unless naturally part of character description), or ANY other skin imperfections or defects. ALL characters must have: smooth, clear, radiant, healthy, perfect, flawless skin with even tone, perfect complexion, and professional-quality appearance. This applies to EVERY character visible in the frame - no exceptions. CRITICAL: This requirement applies to hook/opening frames as well - characters must have perfect skin from the very first frame. Any frame showing skin imperfections (including blemishes, pimples, acne, blackheads, whiteheads, spots, marks, scars, redness, or any marks) will be REJECTED. Examples of what NOT to show: ❌ pimples on face, ❌ acne marks, ❌ blemishes, ❌ blackheads, ❌ whiteheads, ❌ skin discoloration, ❌ redness, ❌ visible pores, ❌ skin texture issues, ❌ any marks or spots. Examples of what TO show: ✅ smooth, clear, perfect skin, ✅ even skin tone, ✅ flawless complexion, ✅ professional-quality appearance. This is a MANDATORY requirement for ALL characters in ALL frames, including the opening/hook frame. `
  
  // Add makeup product application instructions if detected
  let makeupApplicationInstruction = ''
  if (isMakeupProduct) {
    makeupApplicationInstruction = `🚨🚨🚨 CRITICAL: MAKEUP/COSMETICS PRODUCT HOLDING REQUIREMENT 🚨🚨🚨
For makeup/cosmetics products, you MUST show the character holding the product and talking about it:
1. **Product Container Visible**: The character MUST be shown HOLDING the product container (bottle, tube, palette, compact, applicator, etc.) in their hand(s) - the container must be clearly visible
2. **NO APPLICATION**: The character must NEVER apply the product to their face, eyes, lips, or any body part. NO application motion, NO product on skin/face, NO using the product.
3. **Holding and Talking**: The character must hold the product container clearly visible in hand(s) and talk about the product. The visual description MUST describe the character holding the product and discussing it.
4. **Product Details**: The character can gesture with the product, point to it, or show it to the camera while talking, but must NEVER apply it.
Example for foundation: ✅ "The character holds a foundation bottle in hand, clearly visible, and talks about how it provides coverage and benefits" ❌ "The character applies foundation to face" (FORBIDDEN - no application)
Example for lipstick: ✅ "The character holds a lipstick tube, clearly visible, and talks about the color and formula" ❌ "The character applies lipstick to lips" (FORBIDDEN - no application)
This is a MANDATORY requirement - any frame showing makeup products being applied will be rejected. `
  }
  
  // Add skincare product application instructions if detected
  let skincareApplicationInstruction = ''
  if (isSkincareProduct) {
    skincareApplicationInstruction = `🚨🚨🚨 CRITICAL: SKINCARE PRODUCT HOLDING REQUIREMENT 🚨🚨🚨
For skincare products (serum, acne treatment, moisturizer, cream, etc.), you MUST show the character holding the product and talking about it:
1. **Product Container Visible**: The character MUST be shown HOLDING the product container (bottle, tube, pump, jar, dropper, etc.) in their hand(s) - the container must be clearly visible
2. **NO APPLICATION**: The character must NEVER apply the product to their face, skin, or any body part. NO application motion, NO product on skin/face, NO using the product.
3. **Holding and Talking**: The character must hold the product container clearly visible in hand(s) and talk about the product. The visual description MUST describe the character holding the product and discussing it.
4. **Product Details**: The character can gesture with the product, point to it, or show it to the camera while talking, but must NEVER apply it.
5. **🚨🚨🚨 NO DROPPER WATER DROPLETS - ABSOLUTE MANDATORY REQUIREMENT**: DO NOT show water droplets coming out of droppers, dropper tips with liquid drops, or liquid being dispensed from droppers. When showing dropper bottles, the dropper should be shown in the container or being held, but DO NOT show any visible water droplets, liquid drops, or liquid being dispensed from the dropper tip. The dropper should appear dry and without any visible liquid drops. This is a MANDATORY requirement - any frame showing water droplets from droppers will be REJECTED.
6. **🚨 NO PRODUCT ON SKIN - ABSOLUTE MANDATORY REQUIREMENT**: The product must NEVER appear on the character's skin, face, or any body part. The skin should always appear clean and natural. NO visible product on skin, NO application residue, NO product visible on face/body. The skin should maintain a natural, matte, clean appearance without any visible product residue. This applies to ALL skin areas - face, neck, hands, arms, body, etc. This is a MANDATORY requirement - any frame showing product on skin will be REJECTED.
Example for serum: ✅ "The character holds a serum bottle in hand, clearly visible, and talks about how it improves skin texture and benefits" ❌ "The character applies serum to face" (FORBIDDEN - no application)
Example for acne treatment: ✅ "The character holds an acne treatment tube, clearly visible, and talks about how it targets blemishes" ❌ "The character applies treatment to face" (FORBIDDEN - no application)
This is a MANDATORY requirement - any frame showing skincare products being applied will be rejected. `
  }

  // Add hook first frame comparison instruction for CTA frames (highest priority)
  let hookComparisonInstruction = ''
  if (hookFirstFrameUrl && !isTransition) {
    // This is a CTA final frame - add hook comparison at the very beginning
    hookComparisonInstruction = `🚨🚨🚨 HIGHEST PRIORITY - HOOK FIRST FRAME COMPARISON: The hook first frame image is provided as a reference image in your inputs. You MUST visually compare this final CTA frame against that opening shot. The opening shot shows one specific composition, camera angle, and character pose. This closing shot MUST be SIGNIFICANTLY visually different. You MUST use a DIFFERENT camera angle (switch from close-up to medium/wide, or front to side/three-quarter, or change elevation). You MUST use a DIFFERENT character pose (different standing/sitting position, different gesture, different facial expression, different body orientation). You MUST use a DIFFERENT composition/framing (different character placement, different focal point, different depth of field). While maintaining the SAME character (identical appearance, clothing, physical features) and SAME general setting/environment, you MUST create a DISTINCT final composition. DO NOT create an identical or similar frame to the opening shot - the composition, camera angle, and pose MUST be clearly and obviously different. This is a MANDATORY requirement. `
  }

  // Add single product requirement instruction
  const singleProductInstruction = `🚨🚨🚨 CRITICAL: ONLY ONE PRODUCT - ABSOLUTE MANDATORY REQUIREMENT: Show exactly ONE product/item in the frame. Do NOT show duplicate products, multiple identical items, or repeated products. If a product appears in the frame, it must appear only ONCE. Do NOT show two of the same product, multiple bottles, multiple containers, or any duplicate items. There must be exactly ONE product visible in the entire frame. This is a MANDATORY requirement - any frame showing duplicate products will be rejected. `

  // Add closing anatomy reminder for reinforcement (recency effect)
  const closingAnatomyReminder = `Professional photograph of anatomically correct human with exactly two hands (properly proportioned), exactly two arms (properly proportioned, no huge arms, no oversized limbs), correct body proportions, no multiple limbs, no extra arms, no extra legs, no disproportionate body parts. `

  // Add product consistency and reference image instructions if we have reference images
  if (hasReferenceImages) {
    const productConsistencyInstruction = `🚨🚨🚨 CRITICAL: FOREGROUND CONSISTENCY - PRODUCT CONSISTENCY (MANDATORY): Do not add new products to the scene. Only enhance existing products shown in the reference images. Keep product design and style exactly as shown in references. The reference images provided are the EXACT product you must recreate. You MUST copy the product from the reference images with pixel-perfect accuracy. Do NOT create a different product, do NOT use different colors, do NOT change the design, do NOT hallucinate new products. The product in your generated image must be visually IDENTICAL to the product in the reference images. The product must maintain the EXACT same design, color, size, and placement in the foreground across ALL frames. Only camera angles, poses, and compositions may change - foreground product elements must remain pixel-perfect consistent. Study every detail: exact color codes, exact design patterns, exact text/fonts, exact materials, exact textures, exact proportions, exact placement. The reference images are your ONLY source of truth for the product appearance. Ignore any text in the prompt that contradicts the reference images - the reference images take absolute priority. Generate the EXACT same product as shown in the reference images. `
    // Place body part prevention FIRST for highest priority, then hook comparison, then makeup/skincare application (if applicable), then duplicate prevention, then mirror exclusion, then background consistency, then skin quality, then character visibility, then product visibility, then hand consistency, then avatar, then character, then single product, then product consistency
    return `${bodyPartPrevention}${hookComparisonInstruction}${makeupApplicationInstruction}${skincareApplicationInstruction}${duplicatePrevention}${mirrorExclusionInstruction}${backgroundConsistencyInstruction}${skinQualityInstruction}${characterVisibilityInstruction}${productVisibilityInstruction}${handConsistencyInstruction}${avatarInstruction}${characterInstruction}${noTextInstruction}${previousFrameInstruction}${singleProductInstruction}${productConsistencyInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality, ${closingAnatomyReminder}product must be pixel-perfect match to reference images, product appearance must be identical to reference images ${variationReinforcement}`
  } else {
    // Place body part prevention FIRST for highest priority, then hook comparison, then makeup/skincare application (if applicable), then duplicate prevention, then mirror exclusion, then background consistency, then skin quality, then character visibility, then product visibility, then hand consistency, then avatar, then character, then single product
    return `${bodyPartPrevention}${hookComparisonInstruction}${makeupApplicationInstruction}${skincareApplicationInstruction}${duplicatePrevention}${mirrorExclusionInstruction}${backgroundConsistencyInstruction}${skinQualityInstruction}${characterVisibilityInstruction}${productVisibilityInstruction}${handConsistencyInstruction}${avatarInstruction}${characterInstruction}${noTextInstruction}${previousFrameInstruction}${singleProductInstruction}${basePrompt}, ${moodStyle}, professional product photography, high quality, ${closingAnatomyReminder}${variationReinforcement}`
  }
}

// Top-level helper to detect if robot/product is present in hook segment
function isRobotInHook(hookSegment: Segment): boolean {
  const hookText = `${hookSegment.description} ${hookSegment.visualPrompt}`.toLowerCase()
  return /(?:robot|product|humanoid|unitree|g1|device|machine|assistant|helper)/i.test(hookText)
}

// Top-level helper to extract which hand holds the product from visual prompt
function extractProductHand(visualPrompt: string): 'left' | 'right' | null {
  const promptLower = visualPrompt.toLowerCase()
  // Check for explicit hand mentions
  if (/\b(left\s+hand|left\s+arm|in\s+left|left\s+side|left\s+grip|left\s+grasp)\b/.test(promptLower)) {
    return 'left'
  }
  if (/\b(right\s+hand|right\s+arm|in\s+right|right\s+side|right\s+grip|right\s+grasp)\b/.test(promptLower)) {
    return 'right'
  }
  return null
}

// Top-level helper to validate hand consistency across frames
function validateHandConsistency(
  frames: Array<{ segmentIndex: number; frameType: string; visualPrompt?: string }>,
  segments: Segment[]
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = []
  let firstProductHand: 'left' | 'right' | null = null
  let firstFrameWithProduct: { segmentIndex: number; frameType: string } | null = null
  
  // Find first frame where product appears and extract hand
  for (const frame of frames) {
    const segment = segments[frame.segmentIndex]
    if (!segment) continue
    
    const visualPrompt = frame.visualPrompt || segment.visualPrompt
    const hasProduct = /(?:product|bottle|container|item|package|tube|jar|pump|dropper|serum|cream|moisturizer|makeup|cosmetic|lipstick|foundation|holds?|holding|grasps?|grasping)/i.test(visualPrompt)
    
    if (hasProduct) {
      const hand = extractProductHand(visualPrompt)
      if (hand && !firstProductHand) {
        firstProductHand = hand
        firstFrameWithProduct = { segmentIndex: frame.segmentIndex, frameType: frame.frameType }
      } else if (hand && firstProductHand && hand !== firstProductHand) {
        warnings.push(
          `⚠️ Hand inconsistency detected: Product was in ${firstProductHand} hand in segment ${firstFrameWithProduct?.segmentIndex} (${firstFrameWithProduct?.frameType}), but is in ${hand} hand in segment ${frame.segmentIndex} (${frame.frameType}). This violates hand consistency requirement.`
        )
      }
    }
  }
  
  // Also check all segments for hand consistency
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const hand = extractProductHand(segment.visualPrompt)
    const hasProduct = /(?:product|bottle|container|item|package|tube|jar|pump|dropper|serum|cream|moisturizer|makeup|cosmetic|lipstick|foundation|holds?|holding|grasps?|grasping)/i.test(segment.visualPrompt)
    
    if (hasProduct && hand) {
      if (!firstProductHand) {
        firstProductHand = hand
      } else if (hand !== firstProductHand) {
        warnings.push(
          `⚠️ Hand inconsistency in storyboard: Product is in ${hand} hand in segment ${i} (${segment.type}), but was in ${firstProductHand} hand in earlier segment. This violates hand consistency requirement.`
        )
      }
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  }
}

// Top-level helper to validate frame progression (different poses/actions)
function validateFrameProgression(
  frames: Array<{ segmentIndex: number; frameType: string; visualPrompt?: string }>,
  segments: Segment[]
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = []
  
  // Compare consecutive frames to ensure different poses/actions
  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1]
    const currFrame = frames[i]
    
    const prevSegment = segments[prevFrame.segmentIndex]
    const currSegment = segments[currFrame.segmentIndex]
    
    if (!prevSegment || !currSegment) continue
    
    const prevPrompt = prevFrame.visualPrompt || prevSegment.visualPrompt
    const currPrompt = currFrame.visualPrompt || currSegment.visualPrompt
    
    // Extract key action/pose words from prompts
    const extractActions = (prompt: string): string[] => {
      const lower = prompt.toLowerCase()
      const actions: string[] = []
      
      // Common action verbs
      const actionVerbs = ['standing', 'sitting', 'walking', 'holding', 'applying', 'looking', 'smiling', 'frowning', 'pointing', 'reaching', 'touching', 'using', 'grasping', 'extending', 'offering']
      actionVerbs.forEach(verb => {
        if (lower.includes(verb)) actions.push(verb)
      })
      
      // Pose descriptors
      const poses = ['close-up', 'wide shot', 'medium shot', 'front view', 'side view', 'three-quarter', 'profile']
      poses.forEach(pose => {
        if (lower.includes(pose)) actions.push(pose)
      })
      
      return actions
    }
    
    const prevActions = extractActions(prevPrompt)
    const currActions = extractActions(currPrompt)
    
    // Check if frames have significantly different actions/poses
    const commonActions = prevActions.filter(a => currActions.includes(a))
    const similarityRatio = commonActions.length / Math.max(prevActions.length, currActions.length, 1)
    
    // If similarity is too high (>70%), warn about lack of progression
    if (similarityRatio > 0.7 && prevActions.length > 0 && currActions.length > 0) {
      warnings.push(
        `⚠️ Frame progression issue: Frame ${i} (segment ${currFrame.segmentIndex}, ${currFrame.frameType}) shows similar pose/action to previous frame (segment ${prevFrame.segmentIndex}, ${prevFrame.frameType}). Frames should show different poses and actions for natural progression.`
      )
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  }
}

// Top-level async function to extract and locate all story items
async function extractAndLocateStoryItems(
  generationMode: string,
  bodySegments: Segment[],
  hookSegment: Segment | undefined,
  sanitizedStory: any
): Promise<{
  allStoryItems: Array<{ item: string; action: string; actionType: 'bringing' | 'interacting' }>
  itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }>
}> {
  const allStoryItems: Array<{ item: string; action: string; actionType: 'bringing' | 'interacting' }> = []
  const itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }> = []
  
  if (generationMode === 'production' && bodySegments.length > 0 && hookSegment) {
    try {
      console.log('\n[Generate Frames] === Extracting story items from body segments ===')
      
      // Extract story items from body segments
      for (const bodySegment of bodySegments) {
        const solutionItem = await extractSolutionItem(bodySegment, sanitizedStory)
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
        
        // Check if robot is present in hook
        const robotInHook = isRobotInHook(hookSegment)
        console.log(`[Generate Frames] Robot/product in hook: ${robotInHook}`)
        
        // Extract initial locations for each item from hook segment
        console.log('\n[Generate Frames] === Extracting initial locations for story items ===')
        for (const storyItem of allStoryItems) {
          if (storyItem.actionType === 'bringing') {
            if (robotInHook) {
              // Robot is in hook - item should be in robot's hands
              try {
                const initialLocation = await extractItemInitialLocation(storyItem.item, hookSegment, storyItem.actionType)
                itemsWithLocations.push({
                  item: storyItem.item,
                  initialLocation: initialLocation || 'in robot\'s hands',
                  actionType: storyItem.actionType
                })
                if (initialLocation) {
                  console.log(`[Generate Frames] Item "${storyItem.item}" will be in robot's hands in hook (robot present): "${initialLocation}"`)
                } else {
                  console.log(`[Generate Frames] Item "${storyItem.item}" will be in robot's hands in hook (robot present), using default: "in robot's hands"`)
                }
              } catch (error: any) {
                console.warn(`[Generate Frames] Error extracting location for "${storyItem.item}": ${error.message}, using default: in robot's hands`)
                itemsWithLocations.push({
                  item: storyItem.item,
                  initialLocation: 'in robot\'s hands',
                  actionType: storyItem.actionType
                })
              }
            } else {
              // Robot NOT in hook - exclude item from hook first frame
              console.log(`[Generate Frames] Item "${storyItem.item}" is being brought but robot not in hook - excluding from hook first frame`)
              // Don't add to itemsWithLocations
            }
          } else {
            // Not a "bringing" item - include normally
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
        }
      } else {
        console.log(`[Generate Frames] No "bringing" action items found in body segments`)
      }
    } catch (error: any) {
      console.warn(`[Generate Frames] Error extracting story items: ${error.message}, continuing without item requirements`)
    }
  }
  
  return { allStoryItems, itemsWithLocations }
}

// Top-level async function to generate a single frame (nano-banana → seedream-4 pipeline)
async function generateSingleFrame(
  frameName: string,
  nanoPrompt: string,
  segmentVisualPrompt: string,
  referenceImages: string[],
  aspectRatio: string,
  dimensions: { width: number; height: number },
  previousFrameImage?: string,
  currentSceneText?: string,
  isTransition: boolean = false,
  transitionText?: string,
  transitionVisual?: string,
  includePreviousFrameInInput: boolean = true,
  hookFirstFrameUrl?: string | null
): Promise<{
  segmentIndex: number
  frameType: 'first' | 'last'
  imageUrl: string
  modelSource: 'nano-banana' | 'seedream-4'
  nanoImageUrl?: string
  seedreamImageUrl?: string
} | null> {
  try {
    console.log(`[Generate Frames] ========================================`)
    console.log(`[Generate Frames] Starting generation: ${frameName}`)
    console.log(`[Generate Frames] ========================================`)
    console.log(`[Generate Frames] Nano-banana prompt: ${nanoPrompt}`)
    console.log(`[Generate Frames] Has previous frame: ${!!previousFrameImage}`)
    console.log(`[Generate Frames] Has hook first frame: ${!!hookFirstFrameUrl}`)
    
    // Build image input array: product images + hook first frame (for CTA) + previous frame (if available and if includePreviousFrameInInput is true)
    const imageInputs: string[] = []
    
    // Add product images first
    if (referenceImages.length > 0) {
      imageInputs.push(...referenceImages)
    }
    
    // Add hook first frame BEFORE previous frame for CTA comparison (highest priority visual reference)
    if (hookFirstFrameUrl) {
      imageInputs.push(hookFirstFrameUrl)
      console.log(`[Generate Frames] Including hook first frame image in nano-banana inputs for CTA comparison: ${hookFirstFrameUrl}`)
    }
    
    // Add previous frame image for continuity only if includePreviousFrameInInput is true
    if (previousFrameImage && includePreviousFrameInInput) {
      imageInputs.push(previousFrameImage)
      console.log(`[Generate Frames] Including previous frame image in nano-banana inputs: ${previousFrameImage}`)
    } else if (previousFrameImage && !includePreviousFrameInInput) {
      console.log(`[Generate Frames] Previous frame mentioned in prompt but NOT included in image inputs (for more variation): ${previousFrameImage}`)
    }
    
    console.log(`[Generate Frames] Total image inputs being sent: ${imageInputs.length} images (${referenceImages.length} product + ${hookFirstFrameUrl ? 1 : 0} hook first + ${(previousFrameImage && includePreviousFrameInInput) ? 1 : 0} previous frame)`)
    
    const nanoResult = await callReplicateMCP('generate_image', {
      model: 'google/nano-banana-pro',
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

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    console.log(`[Generate Frames] Raw body received - productImages type:`, typeof body.productImages)
    console.log(`[Generate Frames] Raw body received - productImages is array:`, Array.isArray(body.productImages))
    console.log(`[Generate Frames] Raw body received - productImages length:`, body.productImages?.length || 0)
    if (body.productImages && body.productImages.length > 0) {
      console.log(`[Generate Frames] Raw body received - first 3 productImages:`, body.productImages.slice(0, 3))
    }
    
    const { storyboard, productImages = [], subjectReference, avatarReference = [], avatarId, story, mode, price } = generateFramesSchema.parse(body)
    
    // Set subjectReference on storyboard meta if provided and not already set
    if (subjectReference && !storyboard.meta.subjectReference) {
      storyboard.meta.subjectReference = subjectReference
      console.log(`[Generate Frames] Set subjectReference on storyboard.meta: ${subjectReference}`)
    }
    
    // Load avatar description if avatarId is provided
    let avatarDescription: string | null = null
    let avatarLookAndStyle: string | null = null
    let characterAge: string | undefined = undefined
    if (avatarId) {
      try {
        const { getAvatarById } = await import('../../app/config/avatars')
        const avatar = getAvatarById(avatarId)
        if (avatar) {
          avatarDescription = avatar.description
          avatarLookAndStyle = avatar.lookAndStyle
          // Extract age from avatar description or ageRange
          // Look for patterns like "24-28 year old", "mid-20s", "early 30s", etc.
          const ageMatch = avatar.description.match(/(\d+-\d+|\d+)\s*year\s*old|(mid|early|late)\s*-?\s*(\d+)s?|(\d+)\s*years?\s*old/i)
          if (ageMatch) {
            if (ageMatch[1]) {
              // "24-28 year old" -> "mid-20s"
              const [start, end] = ageMatch[1].split('-').map(Number)
              const mid = Math.floor((start + end) / 2)
              characterAge = `mid-${Math.floor(mid / 10) * 10}s`
            } else if (ageMatch[2] && ageMatch[3]) {
              // "mid-20s" or "early 30s"
              characterAge = `${ageMatch[2]}-${ageMatch[3]}s`
            } else if (ageMatch[4]) {
              // "24 years old" -> "mid-20s"
              const age = Number(ageMatch[4])
              const decade = Math.floor(age / 10) * 10
              if (age % 10 < 3) characterAge = `early-${decade}s`
              else if (age % 10 < 7) characterAge = `mid-${decade}s`
              else characterAge = `late-${decade}s`
            }
          } else if (avatar.ageRange) {
            // Use ageRange as fallback (e.g., "24-28" -> "mid-20s")
            const [start, end] = avatar.ageRange.split('-').map(Number)
            if (start && end) {
              const mid = Math.floor((start + end) / 2)
              characterAge = `mid-${Math.floor(mid / 10) * 10}s`
            }
          }
          
          // Store gender for context-aware replacements
          const avatarGender = avatar.gender || 'female'
          console.log(`[Generate Frames] Loaded avatar description for ${avatarId}, extracted age: ${characterAge}`)
        }
      } catch (error) {
        console.warn(`[Generate Frames] Could not load avatar description for ${avatarId}:`, error)
      }
    }
    
    // Sanitize all story fields and create Story object with id
    const sanitizedStory = {
      id: storyboard.id || `story-${Date.now()}`, // Use storyboard id or generate one
      description: sanitizeStoryText(story.description, characterAge),
      hook: sanitizeStoryText(story.hook, characterAge),
      bodyOne: sanitizeStoryText(story.bodyOne || '', characterAge),
      bodyTwo: sanitizeStoryText(story.bodyTwo || '', characterAge),
      callToAction: sanitizeStoryText(story.callToAction, characterAge),
    }
    
    // Sanitize visual prompts in storyboard segments
    storyboard.segments.forEach(segment => {
      segment.visualPrompt = sanitizeVisualPrompt(segment.visualPrompt, characterAge)
    })
    
    console.log(`[Generate Frames] Sanitized story text and visual prompts (replaced teenage/teen references with: ${characterAge || 'young adult'})`)
    
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
    
    // Use all available reference images (up to model limit of 14 for product and character references)
    const referenceImages: string[] = []
    const MAX_REFERENCE_IMAGES = 14
    
    // Add product images first (resolve paths and convert to URLs)
    if (productImages.length > 0) {
      const resolvedProductImages = await Promise.all(productImages.slice(0, 12).map(resolveImagePath))
      referenceImages.push(...resolvedProductImages)
    }
    
    // Add avatar reference images (resolve public folder paths and convert to URLs)
    // Ensure both preview.jpg and reference.jpg are included when both are present
    if (avatarReference.length > 0) {
      const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length
      if (remainingSlots > 0) {
        // Check if both preview.jpg and reference.jpg are present
        const hasPreview = avatarReference.some(img => img.includes('preview.jpg'))
        const hasReference = avatarReference.some(img => img.includes('reference.jpg'))
        const hasBoth = hasPreview && hasReference
        
        let avatarImagesToAdd: string[] = []
        
        if (hasBoth && remainingSlots >= 2) {
          // Prioritize both preview.jpg and reference.jpg together
          const previewImg = avatarReference.find(img => img.includes('preview.jpg'))
          const referenceImg = avatarReference.find(img => img.includes('reference.jpg'))
          
          if (previewImg && referenceImg) {
            avatarImagesToAdd = [previewImg, referenceImg]
            console.log(`[Generate Frames] Both avatar images detected - including preview.jpg and reference.jpg together`)
          } else {
            // Fallback: add as many as fit
            avatarImagesToAdd = avatarReference.slice(0, remainingSlots)
          }
        } else {
          // Add as many as fit in remaining slots
          avatarImagesToAdd = avatarReference.slice(0, remainingSlots)
        }
        
        if (avatarImagesToAdd.length > 0) {
          console.log(`[Generate Frames] Avatar reference images before resolution:`, avatarImagesToAdd)
          const resolvedAvatarImages = await Promise.all(avatarImagesToAdd.map(resolveImagePath))
          console.log(`[Generate Frames] Avatar reference images after resolution:`, resolvedAvatarImages)
          referenceImages.push(...resolvedAvatarImages)
          console.log(`[Generate Frames] Added ${resolvedAvatarImages.length} avatar reference image(s) to nano-banana inputs`)
        }
      }
    }
    
    // Add person reference (subjectReference) if available from storyboard meta (resolve path and convert to URL)
    if (storyboard.meta.subjectReference && referenceImages.length < MAX_REFERENCE_IMAGES) {
      const resolvedSubjectRef = await resolveImagePath(storyboard.meta.subjectReference)
      console.log(`[Generate Frames] Adding person reference to nano-banana inputs: ${resolvedSubjectRef}`)
      referenceImages.push(resolvedSubjectRef)
    }

    // Get characters from storyboard for consistency
    const characters: Character[] = storyboard.characters || []

    // Get all segments for SEQUENTIAL frame generation (as per PRD specification)
    const hookSegment = storyboard.segments.find(s => s.type === 'hook')
    const bodySegments = storyboard.segments.filter(s => s.type === 'body')
    const body1Segment = bodySegments[0]
    const body2Segment = bodySegments[1]
    const ctaSegment = storyboard.segments.find(s => s.type === 'cta')
    
    console.log(`[Generate Frames] Found ${bodySegments.length} body segments`)
    
    // Extract all story items from body segments BEFORE generating hook frames
    // All items that will be used in the story should be present from the hook first frame
    // TEMPORARY: Commented out to verify build works
    const allStoryItems: Array<{ item: string; action: string; actionType: 'bringing' | 'interacting' }> = []
    const itemsWithLocations: Array<{ item: string; initialLocation: string; actionType: 'bringing' | 'interacting' }> = []
    // TODO: Re-enable after confirming build works
    // const { allStoryItems, itemsWithLocations } = await extractAndLocateStoryItems(
    //   generationMode,
    //   bodySegments,
    //   hookSegment,
    //   sanitizedStory
    // )
    
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
      
      const nanoPrompt = buildNanoPrompt(sanitizedStory.hook, hookVisualPrompt, mood, referenceImages, characters, false, undefined, undefined, undefined, itemsWithLocations.length > 0 ? itemsWithLocations : undefined, avatarDescription, avatarLookAndStyle, undefined)
      hookFirstFrameResult = await generateSingleFrame(
        'hook first frame', 
        nanoPrompt, 
        hookSegment.visualPrompt,
        referenceImages,
        aspectRatio,
        dimensions,
        undefined,  // No previous frame
        undefined,  // No current scene text
        false,      // Not a transition
        undefined,  // No transition text
        undefined,  // No transition visual
        false,      // Do NOT include previous frame in input (first frame, no previous)
        undefined   // Not a CTA frame
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
    
    // Store hook first frame URL for later comparison with CTA last frame
    const hookFirstFrameUrl = hookFirstFrameResult?.imageUrl || null

    // NON-SEAMLESS TRANSITION: Generate only first frames if seamlessTransition is OFF
    if (!seamlessTransition) {
      console.log('\n[Generate Frames] === NON-SEAMLESS MODE: Generating only first frames ===')
      
      // Frame 2: Body first frame (no previous frame input)
      if (body1Segment) {
        console.log('\n[Generate Frames] === FRAME 2: Body First Frame (non-seamless) ===')
        
        const nanoPrompt = buildNanoPrompt(sanitizedStory.bodyOne, body1Segment.visualPrompt, mood, referenceImages, characters, false, undefined, undefined, undefined, undefined, avatarDescription, avatarLookAndStyle, undefined)
        const bodyFirstFrameResult = await generateSingleFrame(
          'body first frame', 
          nanoPrompt, 
          body1Segment.visualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          undefined,  // No previous frame
          undefined,  // No current scene text
          false,      // Not a transition
          undefined,  // No transition text
          undefined,  // No transition visual
          false,      // Do NOT include previous frame in input (non-seamless)
          undefined   // Not a CTA frame
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
        
        const nanoPrompt = buildNanoPrompt(sanitizedStory.bodyTwo, body2Segment.visualPrompt, mood, referenceImages, characters, false, undefined, undefined, undefined, undefined, avatarDescription, avatarLookAndStyle, undefined)
        const body2FirstFrameResult = await generateSingleFrame(
          'body2 first frame', 
          nanoPrompt, 
          body2Segment.visualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          undefined,  // No previous frame
          undefined,  // No current scene text
          false,      // Not a transition
          undefined,  // No transition text
          undefined,  // No transition visual
          false,      // Do NOT include previous frame in input (non-seamless)
          undefined   // Not a CTA frame
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
        
        const nanoPrompt = buildNanoPrompt(sanitizedStory.callToAction, ctaSegment.visualPrompt, mood, referenceImages, characters, false, undefined, undefined, undefined, undefined, avatarDescription, avatarLookAndStyle, undefined)
        const ctaFirstFrameResult = await generateSingleFrame(
          'cta first frame', 
          nanoPrompt, 
          ctaSegment.visualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          undefined,  // No previous frame
          undefined,  // No current scene text
          false,      // Not a transition
          undefined,  // No transition text
          undefined,  // No transition visual
          false,      // Do NOT include previous frame in input (non-seamless)
          undefined   // Not CTA last frame (this is CTA first)
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
      // CRITICAL: Background must remain IDENTICAL, but visual elements must differ
      const hookBackgroundConsistencyInstruction = `🚨🚨🚨 CRITICAL BACKGROUND CONSISTENCY - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: The background and environment in this hook last frame MUST be IDENTICAL to the hook first frame. This is a HARD REQUIREMENT with ZERO TOLERANCE. The background, environment, setting, location, room, walls, surfaces, objects in background, lighting style, and ALL environmental elements must remain EXACTLY THE SAME as the hook first frame. DO NOT change: background elements, room layout, wall colors, surfaces, furniture placement, environmental objects, lighting style, or ANY background details. The background must be PIXEL-PERFECT IDENTICAL to the opening shot. Any frame showing a different background will be REJECTED. Examples of what MUST stay the same: ✅ exact same background, ✅ same room/environment, ✅ same wall colors, ✅ same surfaces, ✅ same objects in background, ✅ same lighting style. This is a MANDATORY requirement - the hook opening and closing shots must have IDENTICAL backgrounds. `
      const hookProgressionInstruction = `🚨🚨🚨 CRITICAL HOOK PROGRESSION - MANDATORY VISUAL DISTINCTION - ABSOLUTE REQUIREMENT: This hook last frame MUST be SIGNIFICANTLY visually different from the hook first frame. While maintaining the EXACT SAME background, environment, and setting, at least 2 of the following MUST differ: 1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). The frame must show a clear "later moment" with DISTINCT visual progression. Do NOT create an identical or nearly identical frame to the opening shot - the composition, camera angle, and pose MUST be clearly and obviously different. This is a MANDATORY requirement - any frame that looks similar to the opening shot will be rejected. `
      let hookLastVisualPrompt = hookBackgroundConsistencyInstruction + hookProgressionInstruction + hookSegment.visualPrompt
      
      const nanoPrompt = buildNanoPrompt(
        sanitizedStory.hook, 
        hookLastVisualPrompt,
        mood,
        referenceImages,
        characters,
        true, 
        sanitizedStory.bodyOne, 
        body1Segment.visualPrompt,
        hookFirstFrameResult.imageUrl,  // Use hook first frame as input
        itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
        avatarDescription,
        avatarLookAndStyle,
        undefined  // Not a CTA frame
      )
      hookLastFrameResult = await generateSingleFrame(
        'hook last frame', 
        nanoPrompt, 
        hookLastVisualPrompt,
        referenceImages,
        aspectRatio,
        dimensions,
        hookFirstFrameResult.imageUrl,  // Previous frame image
        sanitizedStory.hook, 
        true, 
        sanitizedStory.bodyOne, 
        body1Segment.visualPrompt,
        true,  // Include previous frame in input
        undefined  // Not a CTA frame
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
        
        // Add body segment progression requirement - body last frame must show natural progression from body first frame
        const bodyProgressionInstruction = ` 🚨🚨🚨 CRITICAL BODY SEGMENT PROGRESSION - MANDATORY VISUAL DISTINCTION - ABSOLUTE REQUIREMENT: This is the body segment's closing frame. It MUST be SIGNIFICANTLY visually different from the body segment's opening frame. While maintaining the EXACT SAME background, environment, and setting, at least 2 of the following MUST differ: 1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). The frame must show a clear "later moment" with DISTINCT visual progression. Do NOT create an identical or nearly identical frame to the opening frame - the composition, camera angle, and pose MUST be clearly and obviously different. Examples of required progression: character moving from holding product to applying it, character changing facial expression (e.g., from neutral to smiling, from concerned to confident), character shifting body position or gesture, character moving hands to a different position, character showing product application progress. This is a MANDATORY requirement - any frame that looks similar to the opening frame will be rejected. `
        body1VisualPrompt = bodyProgressionInstruction + body1VisualPrompt
        
        const nanoPrompt = buildNanoPrompt(
          sanitizedStory.bodyOne, 
          body1VisualPrompt,
          mood,
          referenceImages,
          characters,
          true, 
          sanitizedStory.callToAction, 
          ctaSegment.visualPrompt,
          hookLastFrameResult.imageUrl,  // Use hook last frame (= Body first frame) as input
          itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
          avatarDescription,
          avatarLookAndStyle,
          undefined  // Not a CTA frame
        )
        bodyLastFrameResult = await generateSingleFrame(
          'body last frame', 
          nanoPrompt, 
          body1VisualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          hookLastFrameResult.imageUrl,  // Previous frame image (Body first = Hook last)
          sanitizedStory.bodyOne, 
          true, 
          sanitizedStory.callToAction, 
          ctaSegment.visualPrompt,
          true,  // Include previous frame in input
          undefined  // Not a CTA frame
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
        
        // Add body segment progression requirement - body1 last frame must show natural progression from body1 first frame
        const body1ProgressionInstruction = ` 🚨🚨🚨 CRITICAL BODY1 SEGMENT PROGRESSION - MANDATORY VISUAL DISTINCTION - ABSOLUTE REQUIREMENT: This is the body1 segment's closing frame. It MUST be SIGNIFICANTLY visually different from the body1 segment's opening frame. While maintaining the EXACT SAME background, environment, and setting, at least 2 of the following MUST differ: 1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). The frame must show a clear "later moment" with DISTINCT visual progression. Do NOT create an identical or nearly identical frame to the opening frame - the composition, camera angle, and pose MUST be clearly and obviously different. Examples of required progression: character moving from holding product to applying it, character changing facial expression (e.g., from neutral to smiling, from concerned to confident), character shifting body position or gesture, character moving hands to a different position, character showing product application progress. This is a MANDATORY requirement - any frame that looks similar to the opening frame will be rejected. `
        body1VisualPrompt = body1ProgressionInstruction + body1VisualPrompt
        
        const nanoPrompt = buildNanoPrompt(
          sanitizedStory.bodyOne, 
          body1VisualPrompt,
          mood,
          referenceImages,
          characters,
          true, 
          sanitizedStory.bodyTwo, 
          body2Segment.visualPrompt,
          hookLastFrameResult.imageUrl,  // Use hook last frame (= Body1 first frame) as input
          itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
          avatarDescription,
          avatarLookAndStyle,
          undefined  // Not a CTA frame
        )
        body1LastFrameResult = await generateSingleFrame(
          'body1 last frame', 
          nanoPrompt, 
          body1VisualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          hookLastFrameResult.imageUrl,  // Previous frame image (Body1 first = Hook last)
          sanitizedStory.bodyOne, 
          true, 
          sanitizedStory.bodyTwo, 
          body2Segment.visualPrompt,
          true,  // Include previous frame in input
          undefined  // Not a CTA frame
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
        
        // Add body segment progression requirement - body2 last frame must show natural progression from body2 first frame
        const body2ProgressionInstruction = ` 🚨🚨🚨 CRITICAL BODY2 SEGMENT PROGRESSION - MANDATORY VISUAL DISTINCTION - ABSOLUTE REQUIREMENT: This is the body2 segment's closing frame. It MUST be SIGNIFICANTLY visually different from the body2 segment's opening frame. While maintaining the EXACT SAME background, environment, and setting, at least 2 of the following MUST differ: 1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). The frame must show a clear "later moment" with DISTINCT visual progression. Do NOT create an identical or nearly identical frame to the opening frame - the composition, camera angle, and pose MUST be clearly and obviously different. Examples of required progression: character moving from holding product to applying it, character changing facial expression (e.g., from neutral to smiling, from concerned to confident), character shifting body position or gesture, character moving hands to a different position, character showing product application progress. This is a MANDATORY requirement - any frame that looks similar to the opening frame will be rejected. `
        body2VisualPrompt = body2ProgressionInstruction + body2VisualPrompt
        
        const nanoPrompt = buildNanoPrompt(
          sanitizedStory.bodyTwo, 
          body2VisualPrompt,
          mood,
          referenceImages,
          characters,
          true, 
          sanitizedStory.callToAction, 
          ctaSegment.visualPrompt,
          body1LastFrameResult.imageUrl,  // Use body1 last frame (= Body2 first frame) as input
          itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
          avatarDescription,
          avatarLookAndStyle,
          undefined  // Not a CTA frame
        )
        body2LastFrameResult = await generateSingleFrame(
          'body2 last frame', 
          nanoPrompt, 
          body2VisualPrompt,
          referenceImages,
          aspectRatio,
          dimensions,
          body1LastFrameResult.imageUrl,  // Previous frame image (Body2 first = Body1 last)
          sanitizedStory.bodyTwo, 
          true, 
          sanitizedStory.callToAction, 
          ctaSegment.visualPrompt,
          true,  // Include previous frame in input
          undefined  // Not a CTA frame
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
      console.log('[Generate Frames] CTA story text:', sanitizedStory.callToAction)
      console.log('[Generate Frames] Hook first frame URL (for comparison):', hookFirstFrameUrl)
      
      // CTA last frame should be visually distinct from the OPENING SHOT (hook first frame)
      // Use isTransition: false to trigger variation instruction
      // Include hook first frame in image inputs to allow visual comparison
      // Strong variation instructions will ensure visual differences while maintaining continuity
      // Enhance visual prompt with CTA-specific variation instructions that compare against hook first frame
      const hookComparisonText = hookFirstFrameUrl 
        ? `🚨🚨🚨 ABSOLUTE REQUIREMENT - COMPARE VISUALLY: The hook first frame image is provided as a reference image. You MUST visually compare this final frame against that opening shot. The opening shot shows one specific composition, camera angle, and character pose. This closing shot MUST be SIGNIFICANTLY visually different with at least 2 of the following MUST differ: `
        : `🚨🚨🚨 ABSOLUTE REQUIREMENT: This is the FINAL frame and must be SIGNIFICANTLY visually different from the OPENING SHOT (hook first frame). At least 2 of the following MUST differ: `
      
      const hookFrameReference = hookFirstFrameUrl 
        ? ` 🚨 CRITICAL VISUAL REFERENCE: The opening shot (hook first frame) image is included in your image inputs. Study it carefully. It shows a specific composition, camera angle, and character pose. You MUST create a DIFFERENT composition while maintaining the same character and setting. `
        : ` 🚨 CRITICAL: The opening shot (hook first frame) establishes the initial composition. `
      
      const ctaVariationInstruction = ` 🚨🚨🚨 CTA FINAL FRAME - MANDATORY VISUAL DISTINCTION FROM BOTH OPENING SHOT AND PREVIOUS FRAME - ABSOLUTE REQUIREMENT: ${hookFrameReference}${hookComparisonText}1) Camera angle (MUST switch from close-up to medium/wide, or front to side/three-quarter, or change elevation - DO NOT use the same angle), 2) Character pose (MUST be different - different standing/sitting position, different gesture like pointing or holding product, different facial expression, different body orientation - DO NOT copy the same pose), 3) Composition/framing (MUST be different - different character placement in frame, different focal point, different depth of field, different framing style - DO NOT use the same composition). 🚨🚨🚨 CRITICAL: This CTA last frame MUST also be SIGNIFICANTLY visually different from the CTA first frame (previous frame). While maintaining the EXACT SAME background, environment, and setting, at least 2 of the above elements (camera angle, character pose, composition/framing) MUST differ from BOTH the opening shot AND the previous frame. While maintaining the SAME character (identical appearance, clothing, physical features) and SAME general setting/environment, you MUST create a DISTINCT final composition. The final frame should feel like a natural progression or hero shot moment while maintaining character and scene continuity. DO NOT create an identical or similar frame to either the opening shot or the previous frame - the composition, camera angle, and pose MUST be clearly and obviously different from both. This is a MANDATORY requirement - any frame that looks similar to the opening shot or previous frame will be rejected. `
      
      // Add character speaking instruction if dialogue is present in CTA
      let characterSpeakingInstruction = ''
      if (ctaSegment.audioNotes && ctaSegment.audioNotes.includes('Dialogue:')) {
        const dialogueMatch = ctaSegment.audioNotes.match(/Dialogue:\s*([^:]+?)\s+says:\s*['"](.+?)['"]/i)
        if (dialogueMatch) {
          const character = dialogueMatch[1].trim()
          const dialogueText = dialogueMatch[2].trim()
          characterSpeakingInstruction = ` 🚨🚨🚨 CRITICAL CHARACTER SPEAKING REQUIREMENT - ABSOLUTE MANDATORY: The character (${character}) MUST be shown SPEAKING on-camera in this CTA frame. Add explicit timecodes: "[00:00-00:04] The ${character} speaks: '${dialogueText}', mouth moving, speaking gesture visible". Describe the character's speaking action: "speaking to camera", "saying '${dialogueText}'", "mouth moving as ${character.toLowerCase()} speaks". Ensure the character is shown actively speaking on-camera, not just reacting or thinking. The character MUST be visible AND speaking in this frame. DO NOT show only the product or text overlays - the character must be visible and actively speaking. `
        }
      }
      
      // Add price text overlay instruction for CTA frames
      let priceOverlayInstruction = ''
      if (price && price > 0) {
        priceOverlayInstruction = ` 🚨🚨🚨 CRITICAL PRICE TEXT OVERLAY - ABSOLUTE MANDATORY REQUIREMENT: This CTA frame MUST include a price text overlay displaying "$${price}". The price text should be clearly visible, legible, and professionally styled. Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. The price "$${price}" must be visible in the final frame. This is a MANDATORY requirement - the price text overlay must appear in the CTA frame. `
      }
      
      const enhancedCtaVisualPrompt = ctaSegment.visualPrompt + ctaVariationInstruction + characterSpeakingInstruction + priceOverlayInstruction
      
      const nanoPrompt = buildNanoPrompt(
        sanitizedStory.callToAction, 
        enhancedCtaVisualPrompt,
        mood,
        referenceImages,
        characters,
        false,  // NOT using transition mode - want visual variation
        undefined,
        undefined,
        previousFrameUrl,  // Use CTA first frame as context reference (for both image input and prompt instructions)
        itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
        avatarDescription,
        avatarLookAndStyle,
        hookFirstFrameUrl  // Pass hook first frame URL for CTA comparison
      )
      
      console.log('[Generate Frames] CTA nano prompt:', nanoPrompt)
      console.log('[Generate Frames] Starting CTA last frame generation...')
      console.log('[Generate Frames] CTA last frame will be visually distinct from opening shot (hook first frame)')
      console.log('[Generate Frames] Hook first frame included in image inputs for visual comparison')
      console.log('[Generate Frames] Previous frame included in image inputs for character/scene continuity - strong variation instructions will ensure visual differences')
      
      ctaLastFrameResult = await generateSingleFrame(
        'CTA last frame', 
        nanoPrompt, 
        enhancedCtaVisualPrompt,  // Use enhanced visual prompt with CTA-specific variation instructions
        referenceImages,
        aspectRatio,
        dimensions,
        previousFrameUrl,  // Previous frame for visual reference (for character and scene continuity)
        sanitizedStory.callToAction,  // Story text for context
        false,  // isTransition = false (triggers variation instruction for different composition)
        undefined,  // No transition text
        undefined,  // No transition visual
        true,  // Include previous frame in image inputs to maintain character and scene continuity (like body segments)
        hookFirstFrameUrl  // Pass hook first frame URL for CTA comparison
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
                sanitizedStory
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
            conflictDetails = await detectSceneConflict(hookFrameUrls, body1Segment, sanitizedStory)
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
                      currentSceneText = sanitizedStory.hook
                    } else {
                      // Hook last frame: uses hook first as previous, transitions to body1
                      previousFrameImage = hookFirstFrame.imageUrl
                      currentSceneText = sanitizedStory.hook
                      isTransition = true
                      transitionText = sanitizedStory.bodyOne
                      transitionVisual = body1Segment.visualPrompt
                    }
                    
                    // Build nano prompt with modified visual prompt
                    const nanoPrompt = buildNanoPrompt(
                      currentSceneText || sanitizedStory.hook,
                      modifiedVisualPrompt,
                      mood,
                      referenceImages,
                      characters,
                      isTransition,
                      transitionText,
                      transitionVisual,
                      previousFrameImage,
                      itemsWithLocations.length > 0 ? itemsWithLocations : undefined,  // Pass tracked items
                      avatarDescription,
                      avatarLookAndStyle,
                      undefined  // Not a CTA frame
                    )
                    
                    // Regenerate the frame
                    const regeneratedFrame = await generateSingleFrame(
                      `hook ${frameType} frame (regenerated)`,
                      nanoPrompt,
                      modifiedVisualPrompt,
                      referenceImages,
                      aspectRatio,
                      dimensions,
                      previousFrameImage,
                      currentSceneText,
                      isTransition,
                      transitionText,
                      transitionVisual,
                      true,  // Include previous frame in input
                      undefined  // Not a CTA frame
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
                          const body1Segment = storyboard.segments[body1SegmentIndex] as Segment
                          body1Segment.firstFrameImage = regeneratedFrame.imageUrl
                          console.log(`[Generate Frames] ✓ Updated body1 first frame to match regenerated hook last frame`)
                        }
                      }
                      
                      // Update segment's frame image
                      const hookSegmentTyped = hookSegment as Segment
                      if (frameType === 'first') {
                        hookSegmentTyped.firstFrameImage = regeneratedFrame.imageUrl
                      } else {
                        hookSegmentTyped.lastFrameImage = regeneratedFrame.imageUrl
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
                    const reanalysisResult = await detectSceneConflict(updatedHookFrameUrls, body1Segment, sanitizedStory)
                    
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

    // Validate hand consistency across frames
    try {
      const handValidation = validateHandConsistency(
        frames.map(f => ({
          segmentIndex: f.segmentIndex,
          frameType: f.frameType,
          visualPrompt: storyboard.segments[f.segmentIndex]?.visualPrompt
        })),
        storyboard.segments
      )
      
      if (!handValidation.isValid && handValidation.warnings.length > 0) {
        console.warn('[Generate Frames] ⚠️ HAND CONSISTENCY WARNINGS:')
        handValidation.warnings.forEach(warning => console.warn(`  ${warning}`))
      } else {
        console.log('[Generate Frames] ✓ Hand consistency validated: Product hand is consistent across all frames')
      }
    } catch (error: any) {
      console.warn('[Generate Frames] Could not validate hand consistency:', error.message)
      // Don't fail the request if validation fails
    }
    
    // Validate frame progression (different poses/actions)
    try {
      const progressionValidation = validateFrameProgression(
        frames.map(f => ({
          segmentIndex: f.segmentIndex,
          frameType: f.frameType,
          visualPrompt: storyboard.segments[f.segmentIndex]?.visualPrompt
        })),
        storyboard.segments
      )
      
      if (!progressionValidation.isValid && progressionValidation.warnings.length > 0) {
        console.warn('[Generate Frames] ⚠️ FRAME PROGRESSION WARNINGS:')
        progressionValidation.warnings.forEach(warning => console.warn(`  ${warning}`))
      } else {
        console.log('[Generate Frames] ✓ Frame progression validated: Frames show different poses and actions')
      }
    } catch (error: any) {
      console.warn('[Generate Frames] Could not validate frame progression:', error.message)
      // Don't fail the request if validation fails
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


