import OpenAI from 'openai'

/**
 * Direct OpenAI API implementation for serverless environments (Vercel)
 * Bypasses MCP servers which require child processes and filesystem access
 */

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/**
 * Parse a prompt into structured ad video requirements
 * Direct implementation that matches MCP parse_prompt tool behavior
 */
export async function parsePromptDirect(
  prompt: string,
  adType?: string
): Promise<any> {
  const openai = getOpenAIClient()

  const systemPrompt = `You are an expert at extracting structured ad video requirements from user prompts. 
    
    AD TYPES (for classification):
    - Lifestyle: Product in real-life use
    - Product: Direct product focus, macro shots
    - Unboxing: Packaging, opening, reveal experience
    - Testimonial: User review, authentic, face-to-camera
    - Tutorial: Step-by-step guide, instructional
    - Brand Story: Narrative, values, cinematic

You must return a valid JSON object with exactly these fields:
- product: string (the product or service being advertised)
- targetAudience: string (the target demographic or audience)
- mood: string (the emotional tone or mood)
- keyMessages: array of strings (main messages to convey, at least 2-3 items)
- visualStyle: string (the visual aesthetic or style)
- callToAction: string (what action should viewers take)
- adType: string (inferred ad type if not explicitly stated, one of: lifestyle, product, unboxing, testimonial, tutorial, brand_story)

Return ONLY valid JSON, no other text. Example format:
{
  "product": "Luxury Watch",
  "targetAudience": "Affluent professionals aged 30-50",
  "mood": "Elegant and sophisticated",
  "keyMessages": ["Premium craftsmanship", "Timeless design", "Status symbol"],
  "visualStyle": "Cinematic with gold accents",
  "callToAction": "Visit our website to explore the collection",
  "adType": "product"
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenAI completion response')
    }

    // Validate that the response is valid JSON with required fields
    try {
      const parsed = JSON.parse(content)
      const requiredFields = ['product', 'targetAudience', 'mood', 'keyMessages', 'visualStyle', 'callToAction']
      const missingFields = requiredFields.filter(field => !(field in parsed))
      
      if (missingFields.length > 0) {
        console.warn('[OpenAI Direct] Response missing fields:', missingFields)
        console.warn('[OpenAI Direct] Response content:', content)
      }

      // Override adType if provided
      if (adType) {
        parsed.adType = adType
      }

      return parsed
    } catch (parseError: any) {
      console.error('[OpenAI Direct] Response is not valid JSON:', content)
      throw new Error(`OpenAI returned invalid JSON response: ${parseError.message}`)
    }
  } catch (error: any) {
    console.error('[OpenAI Direct] API error in parsePrompt:', error)
    if (error.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check your OPENAI_API_KEY environment variable.')
    }
    if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.')
    }
    throw new Error(`OpenAI API call failed: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Analyze reference images using OpenAI Vision API
 * Direct implementation for serverless environments
 */
export async function analyzeReferenceImagesDirect(imageUrls: string[]): Promise<{
  sceneDescription: string
  characterDescription: string
  suggestedEnhancements: string
  keyElements: string[]
  styleNotes: string
}> {
  const openai = getOpenAIClient()

  if (!imageUrls || imageUrls.length === 0) {
    // Return empty object if no images provided
    return {
      sceneDescription: '',
      characterDescription: '',
      suggestedEnhancements: '',
      keyElements: [],
      styleNotes: '',
    }
  }

  try {
    // Helper function to convert URL to base64 image (serverless-friendly - only handles URLs)
    const getImageBase64 = async (url: string): Promise<string> => {
      // If it's already a data URL, extract the base64 part
      if (url.startsWith('data:image/')) {
        const base64Match = url.match(/data:image\/[^;]+;base64,(.+)/)
        if (base64Match && base64Match[1]) {
          return base64Match[1]
        }
      }
      
      // If it's a URL (http/https), fetch it
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch image from URL: ${url}`)
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        return buffer.toString('base64')
      }
      
      // For serverless, we only support URLs - throw error for file paths
      throw new Error(`Unsupported image source: ${url}. Only HTTP/HTTPS URLs are supported in serverless environments.`)
    }

    // Convert all reference images to base64
    const referenceImages = await Promise.all(
      imageUrls.map(async (url, index) => {
        try {
          const base64 = await getImageBase64(url)
          return {
            type: 'image_url' as const,
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
              detail: 'high' as const,
            },
          }
        } catch (error: any) {
          console.error(`[OpenAI Direct] Failed to load reference image ${index + 1} from ${url}:`, error.message)
          throw new Error(`Failed to load reference image ${index + 1}: ${error.message}`)
        }
      })
    )

    const systemPrompt = `You are analyzing reference images provided by the user for video generation. Your task is to identify key visual elements, subjects, composition, style, colors, mood, and any product/brand elements that should be reflected in the video prompts.

CRITICAL: You must provide an explicit description of exactly what is shown in the image(s). This is the PRIMARY output and will be used as the starting point for video generation.

🚨 MOST IMPORTANT: Product Placement/Location
You MUST identify WHERE the product is located/placed. This is the most critical detail:
- Is it being WORN (on wrist, on body, on clothing)?
- Is it on a SURFACE (on table, on desk, on shelf)?
- Is it being HELD (in hand, in fingers)?
- Is it in a CONTAINER (in box, in packaging)?

These are COMPLETELY DIFFERENT scenes. "A man wearing a watch on his wrist" is NOT the same as "a watch on a table". You must be explicit about the placement.

Analyze:
- Key visual elements and subjects in the images
- Composition and framing style
- Color palette and lighting
- Mood and atmosphere
- Product or brand elements
- Visual style and aesthetic
- Any specific details that should be preserved or emphasized
- EXACTLY what is shown: subject, action/state, product placement, context
- 🚨 WHERE the product is located/placed (this is CRITICAL)

CRITICAL: You MUST return your response as a valid JSON object only, with no additional text before or after the JSON.

Return your response as a JSON object with:
- sceneDescription: (REQUIRED) A detailed, explicit description of exactly what is shown in the image(s). Format: "A [subject] [action/state] with [product] [EXPLICIT PLACEMENT/LOCATION]". 
  Examples:
  - "A man wearing a watch on his wrist" (NOT "a man with a watch")
  - "A watch resting on a polished wooden table" (NOT "a watch")
  - "A woman holding a bottle in her hand" (NOT "a woman with a bottle")
  The sceneDescription MUST include the product's exact placement/location. This is the PRIMARY field and will be used as the starting point for the hook segment.
- characterDescription: (REQUIRED if person/character is visible) A detailed description of any person/character visible in the image(s). Include:
  - Age: Be specific (e.g., "mid-20s", "early 30s", "young adult", "middle-aged"). DO NOT use "teenage" unless the person clearly appears to be 13-19 years old. If uncertain, use "young adult" or estimate based on visible features.
  - Gender: "male", "female", "non-binary", or "unspecified" if not clear
  - Physical appearance: Hair color/style, build, distinctive features, facial features
  - Clothing: Clothing style and colors if visible
  Format: "A [age] [gender] with [physical features], wearing [clothing]"
  Example: "A woman in her mid-20s with long brown hair, average build, wearing casual modern clothing"
  If no person is visible, use empty string "".
- suggestedEnhancements: A string containing specific prompt enhancements that should be merged with existing visual prompts to better match these reference images. Focus on concrete visual details (colors, composition, style, mood, product placement, etc.)
- keyElements: An array of strings describing the key visual elements identified
- styleNotes: A string describing the overall visual style and aesthetic

Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.`

    const userMessage = `Analyze these ${imageUrls.length} reference image(s) and provide:
1. An explicit sceneDescription of exactly what is shown (this is critical - describe the actual scene, subject, and product placement)

🚨 CRITICAL QUESTION: Where is the product located/placed?
- Is it being WORN (on wrist/body/clothing)? → Say "wearing [product] on [location]"
- Is it on a SURFACE (table/desk/shelf)? → Say "[product] on [surface]"
- Is it being HELD (in hand/fingers)? → Say "holding [product] in [location]"
- Is it in a CONTAINER (box/packaging)? → Say "[product] in [container]"

These are completely different scenes. If you see a watch on someone's wrist, say "wearing a watch on his/her wrist". If you see a watch on a table, say "watch on a table". These are NOT the same.

2. Character Description (if person/character is visible):
   - Analyze the person's age carefully. Look at facial features, skin texture, body proportions, and overall appearance.
   - DO NOT default to "teenage" unless the person clearly appears to be 13-19 years old.
   - Use specific age ranges: "mid-20s", "early 30s", "late 20s", "young adult", "middle-aged", etc.
   - Include physical features: hair color/style, build, distinctive features
   - Include clothing style if visible
   - This character description will be used to generate the story, so accuracy is critical.

3. Suggest enhancements to visual prompts that would better match these images

Be extremely specific about product placement. For example:
- ✅ CORRECT: "a man wearing a watch on his wrist" (explicit placement)
- ❌ WRONG: "a man with a watch" (no placement specified)
- ❌ WRONG: "a watch" (no context or placement)`

    // Use Chat Completions API with GPT-4o (fallback from Responses API for serverless)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
            ...referenceImages,
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content || ''
    if (!content) {
      throw new Error('No content in OpenAI completion response')
    }

    // Parse and validate the response
    let parsed: {
      sceneDescription: string
      characterDescription?: string
      suggestedEnhancements: string
      keyElements: string[]
      styleNotes: string
    }
    
    try {
      // Try to parse JSON - handle cases where response might have markdown code blocks
      let jsonContent = content.trim()
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```')) {
        const match = jsonContent.match(/```(?:json)?\n?(.*?)```/s)
        if (match && match[1]) {
          jsonContent = match[1].trim()
        }
      }
      
      parsed = JSON.parse(jsonContent)
      
      // Validate sceneDescription field
      if (!parsed.sceneDescription || typeof parsed.sceneDescription !== 'string' || !parsed.sceneDescription.trim()) {
        throw new Error('Missing or invalid sceneDescription field (REQUIRED)')
      }
      
      if (typeof parsed.suggestedEnhancements !== 'string') {
        throw new Error('Missing or invalid suggestedEnhancements field')
      }
      if (!Array.isArray(parsed.keyElements)) {
        throw new Error('Missing or invalid keyElements field (must be array)')
      }
      if (typeof parsed.styleNotes !== 'string') {
        throw new Error('Missing or invalid styleNotes field')
      }
      
      // Validate characterDescription (optional but should be string if present)
      if (parsed.characterDescription !== undefined && typeof parsed.characterDescription !== 'string') {
        throw new Error('characterDescription must be a string if provided')
      }
    } catch (parseError: any) {
      console.error('[OpenAI Direct] Invalid JSON response from analyzeReferenceImages:', content)
      throw new Error(`OpenAI returned invalid response: ${parseError.message}`)
    }

    return {
      sceneDescription: parsed.sceneDescription,
      characterDescription: parsed.characterDescription || '',
      suggestedEnhancements: parsed.suggestedEnhancements,
      keyElements: parsed.keyElements,
      styleNotes: parsed.styleNotes,
    }
  } catch (error: any) {
    console.error('[OpenAI Direct] analyzeReferenceImages error:', error.message)
    // Return empty object on error (graceful degradation)
    return {
      sceneDescription: '',
      characterDescription: '',
      suggestedEnhancements: '',
      keyElements: [],
      styleNotes: '',
    }
  }
}

/**
 * Plan a storyboard synchronously using direct OpenAI API
 * Direct implementation for serverless environments (no jobId, direct return)
 */
export async function planStoryboardDirect(
  parsed: any,
  duration: number,
  style: string,
  referenceImages?: string[],
  adType?: string
): Promise<{ segments: any[] }> {
  const openai = getOpenAIClient()

  try {
    // Step 1: Optionally analyze reference images if provided
    let imageEnhancements: string = ''
    let imageAnalysis: any = null
    let sceneDescription = ''
    let characterDescription = ''

    if (referenceImages && referenceImages.length > 0) {
      try {
        console.log(`[OpenAI Direct] Analyzing ${referenceImages.length} reference image(s) for prompt enhancement...`)
        imageAnalysis = await analyzeReferenceImagesDirect(referenceImages)
        imageEnhancements = imageAnalysis.suggestedEnhancements || ''
        sceneDescription = imageAnalysis.sceneDescription || ''
        characterDescription = imageAnalysis.characterDescription || ''
        console.log(`[OpenAI Direct] Reference image analysis completed`)
        console.log(`[OpenAI Direct] Scene description: ${sceneDescription}`)
        console.log(`[OpenAI Direct] Character description: ${characterDescription}`)
      } catch (error: any) {
        console.warn(`[OpenAI Direct] Failed to analyze reference images: ${error.message}`)
        // Continue without enhancements if analysis fails
        imageAnalysis = {
          sceneDescription: '',
          characterDescription: '',
          suggestedEnhancements: '',
          keyElements: [],
          styleNotes: '',
        }
        imageEnhancements = ''
      }
    }

    // Step 2: Build ad-type specific instructions
    let adTypeInstruction = ''
    if (adType) {
      switch (adType) {
        case 'lifestyle':
          adTypeInstruction = `
AD TYPE: LIFESTYLE AD
- Focus on the product being used in real-life situations
- Emphasize social context, environment, and benefits
- Show human interaction and emotional connection with the product
- Visuals should feel authentic and aspirational
`
          break
        case 'product':
          adTypeInstruction = `
AD TYPE: PRODUCT FOCUS AD
- CRITICAL: The product must be the main focus in 100% of frames
- Use macro shots, close-ups, and slow pans to show details
- Minimal distractions in the background (bokeh, clean studio, or simple setting)
- Highlight craftsmanship, materials, and design features
- Lighting should be studio-quality to showcase the product best
`
          break
        case 'unboxing':
          adTypeInstruction = `
AD TYPE: UNBOXING EXPERIENCE
- Scene Structure:
  1. Hook: Sealed box/packaging on a surface or being held
  2. Body 1: Hands opening the box/packaging (anticipation)
  3. Body 2: The reveal/first look of the product inside
  4. CTA: The product fully removed and displayed with accessories
- Focus on the tactile experience and packaging details
`
          break
        case 'testimonial':
          adTypeInstruction = `
AD TYPE: TESTIMONIAL / USER REVIEW
- Visual style: "Selfie-style" or authentic interview camera angles
- Focus on facial expressions and genuine emotion
- Show the person holding or using the product while talking
- Alternating between "talking head" shots and B-roll of product usage
- The vibe should be trustworthy and personal
`
          break
        case 'tutorial':
          adTypeInstruction = `
AD TYPE: TUTORIAL / HOW-TO
- Scene Structure:
  1. Hook: The problem or "before" state
  2. Body 1: Step 1 of usage (clear action)
  3. Body 2: Step 2/3 of usage (clear action)
  4. CTA: The result or "after" state
- Visuals must be instructional and clear
- Focus on hands performing actions with the product
`
          break
        case 'brand_story':
          adTypeInstruction = `
AD TYPE: BRAND STORY
- Cinematic, narrative-driven approach
- Focus on values, origin, and atmosphere rather than direct selling
- Use wider shots, atmospheric lighting, and emotional storytelling
- Connect the brand values to the viewer's identity
`
          break
        case 'luxury':
          adTypeInstruction = `
AD TYPE: LUXURY/CINEMATIC AD STRATEGY
- CRITICAL: NO HUMANS in any frame - pure product and nature cinematography
- Epic, cinematic camera work: aerial shots, diving cameras, sweeping crane movements
- Product as the sole protagonist in a grand natural narrative
- Dramatic natural environments: waterfalls, mountains, oceans, forests, dramatic weather
- Atmospheric effects: mist, smoke in water, light rays, water splashes, slow motion
- Product integration with raw materials: wood grains, water droplets, stone textures, botanical elements
- Camera movements:
  * Aerial establishing shots (bird's eye view diving down)
  * Underwater cinematography (product submerged, bubbles, light refraction)
  * Slow dolly pushes into product details
  * Sweeping crane shots around product
  * Smooth transitions between elements and product
- Lighting: Dramatic, moody, often with single light source, high contrast, natural light (sun rays, golden hour)
- Color palette: Monochromatic or limited (blues, blacks, deep greens, golds, earth tones)
- Visual storytelling structure: Nature → Essence → Ingredients → Product
- Emphasize: Scale, grandeur, premium quality, natural power, transformation
- Slow motion sequences to emphasize beauty and drama (water drops, smoke trails, falling petals)
- Each shot should feel like high-end luxury commercial cinematography (Dior, Chanel, Rolex level)
- Product reveal should be dramatic and hero-shot worthy
`
          break
      }
    }

    // Step 3: Build the system prompt with reference image requirements at the top if available
    const referenceImageSection = sceneDescription ? `\n\n═══════════════════════════════════════════════════════════════
🚨 CRITICAL REFERENCE IMAGE REQUIREMENT - READ THIS FIRST 🚨
═══════════════════════════════════════════════════════════════

The reference image shows: "${sceneDescription}"

MANDATORY REQUIREMENT FOR HOOK SEGMENT:
The hook segment visualPrompt MUST start with exactly this scene. 

CORRECT Example (if sceneDescription is "a man wearing a watch on his wrist"):
  ✅ "Close-up shot of a man wearing a watch on his wrist, adjusting his tie in a professional setting. The camera slowly zooms in on the watch..."
  ✅ "Medium shot of a man in a formal suit, with a luxury watch visible on his wrist as he adjusts his attire..."
  
INCORRECT Examples (DO NOT USE):
  ❌ "Close-up shot of a luxury watch on a marble table..." (WRONG - watch is on table, not on wrist)
  ❌ "Wide shot of a watch on a black leather desk..." (WRONG - watch is on desk, not on wrist)
  ❌ "Watch resting on a polished wooden table..." (WRONG - watch is on table, not being worn)

The hook segment visualPrompt MUST begin by describing: "${sceneDescription}"
Then continue with natural action/movement from that starting point.

DO NOT create a different scene. The reference image is the STARTING POINT, not inspiration.
═══════════════════════════════════════════════════════════════\n\n` : ''

    // Step 4: Build system prompt (16-second format vs legacy format)
    const is16SecondFormat = !duration || duration === 16

    // Build common instructions that apply to both formats
    const commonInstructions = `
Each segment needs:
- type: "hook" | "body" | "cta"
- description: Shot description
- startTime: number (seconds)
- endTime: number (seconds)
- visualPrompt: Detailed, specific prompt for video generation (this will be the primary/default prompt).

🚨 VEO 3.1 PROMPTING FORMULA:
For the 'visualPrompt' field, you MUST use this specific 5-part structure for EVERY scene:
[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]

Definitions:
- Cinematography: Camera work, shot composition, movement. Use advanced techniques: dolly shot, tracking shot, crane shot, aerial view, slow pan, POV shot, wide shot, close-up, extreme close-up, low angle, two-shot, shallow depth of field, wide-angle lens, soft focus, macro lens, deep focus
- Subject: Main character or focal point (e.g., "a young woman", "a sleek product bottle")
- Action: What the subject is doing (e.g., "walking briskly", "catching the light")
- Context: Environment and background (e.g., "in a busy city street", "on a wooden table")
- Style & Ambiance: Aesthetic, mood, lighting (e.g., "cinematic lighting", "warm golden hour glow")

🚨 VEO 3.1 CAPABILITIES:
- Variable clip length: 4, 6, or 8 seconds
- Rich audio & dialogue: Generate realistic, synchronized sound, from multi-person conversations to precisely timed sound effects
- Timestamp prompting: Use [00:00-00:02] format for precise action timing
- Sound effects: Use "SFX: [description]" (e.g., "SFX: thunder cracks in the distance")
- Ambient noise: Use "Ambient noise: [description]" (e.g., "Ambient noise: the quiet hum of a starship bridge")
- Dialogue: Use quotation marks for specific speech (e.g., A woman says, "We have to leave now.")

🚨 TIMECODE & AUDIO REQUIREMENTS:
- Veo 3.1 supports native audio generation with rich audio & dialogue capabilities. You MUST include audio cues within the visualPrompt if applicable.
- **Timestamp prompting**: Use precise timecodes for actions: "[00:00-00:02] The woman smiles. [00:02-00:04] She turns to the camera." This allows you to direct complete sequences with precise cinematic pacing.
- For DIALOGUE:
  - If a character speaks, write it explicitly with quotation marks: 'The man says: "Hello, world."'
  - Use ellipses (...) for natural pauses.
  - Include audio actions: "(laughs)", "(sighs)", "(claps)".
  - **CRITICAL: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.**
- For SOUND EFFECTS (SFX): Describe sounds with clarity: "SFX: thunder cracks in the distance", "SFX: door creaks open"
- For AMBIENT NOISE: Define the background soundscape: "Ambient noise: the quiet hum of a starship bridge", "Ambient noise: distant city traffic"
- Audio inputs are strictly ignored by the video model, so all audio intent must be in the prompt text.

  Must include:
  * Specific camera angles and movements (close-up, wide shot, pan, zoom, etc.)
  * Lighting details (soft natural light, studio lighting, etc.)
  * Composition and framing details
  * Realistic, natural actions and movements
  * Product placement and holding details (characters hold products and talk about them, never using them)
  * Background and setting specifics
  * Avoid abstract or unrealistic descriptions - focus on professional, realistic product showcase
  * EMOTIONAL VISUAL STORYTELLING: Include details that create emotional impact - facial expressions, body language, visual mood, and emotional atmosphere that connects with viewers
  * PEOPLE COUNT LIMITATION: Limit scenes to 3-4 people maximum. Prefer smaller groups (1-3 people) when possible for better face quality. Avoid large groups, crowds, or more than 4 people in any scene
  * FACE QUALITY: Use close-ups and medium shots to ensure clear, sharp faces. Emphasize "sharp faces, clear facial features, detailed faces, professional portrait quality" in prompts. Avoid scenes with many people that could result in blurry or distorted faces
  * **🚨🚨🚨 CRITICAL BODY PROPORTIONS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨**: ALL characters in visual prompts MUST have CORRECT body proportions and standard human anatomy. Each character must have EXACTLY: two hands (one left, one right), two arms (one left, one right), two legs, and one head. All body parts must be properly proportioned, naturally sized, and correctly positioned. ABSOLUTELY DO NOT describe or generate: ❌ Multiple limbs (NO extra arms, NO extra legs, NO more than 2 arms, NO more than 2 legs, NO duplicate limbs), ❌ Disproportionate body parts (NO huge arms, NO oversized hands, NO abnormally large limbs, NO tiny arms, NO disproportionate body parts), ❌ Anatomical deformities (NO deformed anatomy, NO abnormal proportions, NO malformed limbs, NO incorrect body structure). MUST describe: ✅ Exactly 2 arms (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 hands (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 legs - properly proportioned and naturally sized, ✅ All body parts in correct proportions relative to the character's body size, ✅ Natural, realistic human anatomy with standard body proportions. This is a MANDATORY requirement - any visual prompt describing multiple limbs, disproportionate body parts, or anatomical deformities will be REJECTED.
  * **🚨🚨🚨 CRITICAL: CHARACTER AND PRODUCT VISIBILITY (MANDATORY)**: Both the main character AND the product (if a product is part of the story) MUST be VISIBLE in ALL frames and segments. The character must be visible even when focusing on products, and the product must be visible even when focusing on the character. Both must appear together in the same frame. DO NOT create frames that show only the character without the product, or only the product without the character. This is a MANDATORY requirement - both character and product must be visible in EVERY frame.
  * CRITICAL: For story continuity - Each segment must logically flow from the previous segment:
    - Hook segment: ${sceneDescription ? `🚨 MANDATORY: MUST start with exactly what is shown in the reference image: "${sceneDescription}". The visualPrompt MUST begin by describing this exact scene. Example: If sceneDescription is "a man wearing a watch on his wrist", the prompt must start with "Close-up/Medium/Wide shot of a man wearing a watch on his wrist..." NOT "watch on table" or any other variation.` : 'Establish the scene, character, or action. For 16-second format: Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End on peak of emotion/action (mini-resolve).'}
    - Body segment(s): 🚨🚨🚨 ABSOLUTE REQUIREMENT: Create ZERO cuts, ZERO transitions, ZERO edits. Each segment must flow as a CONTINUOUS story with NO cuts, NO jumps, NO scene changes, NO transitions, NO edits. Use language like "continuing seamlessly", "the same moment flows", "without interruption", "continuous action", "unbroken flow". Avoid any language suggesting scene changes, cuts, transitions, or edits. The story should feel like ONE continuous unbroken shot, not multiple scenes. VEO must generate this as a single continuous shot without any cuts or transitions. For 16-second format: Camera continues moving (match energy of hook). Product enters magically or talent holds it and talks about it in real-time. Character holds the product and discusses it, never actually using it. Slow-motion reveal at 4-5s of this clip. End on mini-resolve.
    - CTA segment: Build to a natural conclusion that showcases the product, continuing seamlessly from the body segment(s) with NO visual breaks, NO cuts, NO transitions, NO edits, NO scene changes. Maintain the same camera perspective, same environment, same moment in time flowing forward. 🚨🚨🚨 ABSOLUTE REQUIREMENT: This must be ONE unbroken continuous shot with ZERO cuts, ZERO transitions, ZERO edits. VEO must generate this as a single continuous shot. For 16-second format: The CTA segment MUST have TWO distinct frames - a starting frame (same as body's last frame) and a visually DISTINCT ending frame. The ending frame should be a hero shot with: Freeze on perfect product/after state, text overlay with tagline, logo lockup visible, static or very slow push camera movement. The visualPrompt MUST explicitly describe the hero shot composition, text overlay placement, and logo lockup. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. CRITICAL: The ending frame must be visually different from the starting frame - use different camera angle, composition, or add text/logo overlay to create distinct visual progression.
  * 🚨🚨🚨 ABSOLUTE REQUIREMENT: Each segment must be ONE unbroken continuous shot with ZERO cuts, ZERO transitions, ZERO edits, ZERO scene changes. Each segment must feel like a natural continuation of the previous segment with NO visual breaks, NO cuts, NO transitions, NO edits, NO scene changes. Maintain the same camera perspective, same environment, same moment in time flowing forward. VEO must generate each segment as a single continuous shot without any cuts or transitions.
  * Create a cohesive narrative arc where each segment feels like a natural continuation, not an abrupt change
  * 🚨🚨🚨 NO MIRRORS/REFLECTIONS - ABSOLUTE MANDATORY REQUIREMENT: DO NOT use mirrors, reflections, or stories about people looking at their reflection. DO NOT include mirrors in visual prompts. DO NOT generate images with mirrors visible. Avoid any scenes involving mirrors or reflective surfaces. The visualPrompt MUST explicitly avoid any mention of mirrors, reflections, or reflective surfaces. Generated images must NOT show mirrors or reflections. This is a HARD REQUIREMENT - any visual prompt or generated image containing mirrors will be rejected.
  * **CRITICAL: NO CHILDREN**: DO NOT include children in any scenes. No children visible in any part of the storyboard. All characters must be adults.
  * **CRITICAL: NO ELECTRONIC DEVICES**: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the storyboard will be rejected.
  * **CRITICAL: MINIMAL BACKGROUND**: Keep scenes clean and focused. Avoid cluttered backgrounds with lots of objects, furniture, or visual distractions. Minimize background elements to keep focus on the product and characters. Simple, uncluttered environments work best. Use shallow depth of field or selective focus to blur background distractions when needed.
  * **CRITICAL: SIMPLE TASKS**: Keep tasks simple and achievable within the segment duration. Each segment should show ONE simple action that moves the story forward, not complex multi-step tasks. For example, instead of "clearing a table" (too complex for 6 seconds), show "picking up one item" or "placing one object". Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate.
  * **CRITICAL: ONE PRODUCT ONLY**: Each scene must contain ONLY ONE product. Do NOT include multiple products, product variations, or different product models in the same scene. If the product is a robot, there should be only ONE robot. If the product is a bottle, there should be only ONE bottle. Multiple products in a scene will cause visual confusion and inconsistency. Examples to avoid: ❌ "two robots", ❌ "multiple bottles", ❌ "several products". Instead use: ✅ "one robot", ✅ "a single bottle", ✅ "the product".
  * **CRITICAL: ONE CHARACTER SPEAKING**: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.
  * **🚨🚨🚨 CRITICAL: NATURAL PROGRESSION - DIFFERENT POSES/ACTIONS (MANDATORY)**: Each segment must show a DIFFERENT pose and/or action from the previous segment while maintaining character and product consistency. The visual prompts must describe:
    - Different character poses (different standing/sitting positions, different gestures, different facial expressions, different body orientations)
    - Different actions (character performing different activities, product being used in different ways, evolving story progression)
    - Progressive story flow (each segment should advance the narrative with new actions, not repeat the same pose/action)
    - Visual composition changes (different camera angles, different framing, different focal points while maintaining same background)
  Examples: ✅ Hook: "character standing, looking frustrated" → Body: "character sitting, applying product" → CTA: "character standing, smiling, holding product" (different poses AND actions). ❌ Hook: "character standing, holding product" → Body: "character standing, holding product" → CTA: "character standing, holding product" (same pose - REJECTED). The story must progress with evolving poses and actions across segments.
  * ${sceneDescription ? `🚨 CRITICAL REMINDER: The hook segment visualPrompt MUST start with "${sceneDescription}". This is non-negotiable. Before finalizing your response, verify that the hook segment visualPrompt begins with this exact scene description.` : ''}
  * 🚨 CHARACTER CONSISTENCY: Extract ALL characters from the hook segment and maintain their EXACT appearance across ALL segments:
    - In hook segment: Include explicit character descriptions with gender, age, physical features (hair color/style, build), and clothing
    - In body and CTA segments: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance"
    - CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
    - Do NOT change character gender, age, or physical appearance between scenes
    - Example: If hook describes "a teenage boy with brown hair", body segments must reference "the same teenage boy with brown hair", not "a teen" or "a young person"
    - **🚨🚨🚨 CRITICAL: PRODUCT HAND CONSISTENCY (MANDATORY)**: If a character holds a product in their hand (left or right), they MUST keep it in the SAME hand across ALL segments to maintain continuity. Do NOT switch hands between segments. If the product is in the left hand in the hook segment, it must remain in the left hand in the body and CTA segments. If the product is in the right hand in the hook segment, it must remain in the right hand in the body and CTA segments. This applies to ALL products (bottles, serums, makeup, containers, items, etc.). The visualPrompt MUST explicitly state which hand holds the product and maintain this consistency across all segments. Example: If hook segment shows "the character holds the product bottle in her left hand", then body and CTA segments must also show "the same character holds the product bottle in her left hand" (NOT right hand).
    - **🚨🚨🚨 CRITICAL: BACKGROUND/SCENE CONSISTENCY (MANDATORY)**: Maintain the EXACT same background, environment, and setting across ALL frames and segments. Do NOT change scenes, backgrounds, or environments between segments. The same room, same location, same background elements must appear consistently. Only camera angles, character poses, and product positions may change - the background/scene must remain identical. If the hook segment is in a bathroom, ALL segments (body and CTA) must be in the SAME bathroom with the SAME background elements. If the hook segment is in a kitchen, ALL segments must be in the SAME kitchen. The visualPrompt MUST explicitly maintain the same background/environment description across all segments. Example: If hook segment shows "in a clean bathroom with white sink", then body and CTA segments must also show "in the same clean bathroom with white sink" (NOT a different room or different background).
    - **🚨🚨🚨 CRITICAL: FOREGROUND CONSISTENCY (MANDATORY)**: Maintain the EXACT same foreground elements (characters, products, objects) across ALL scenes/videos. The same character with identical appearance, clothing, and physical features must appear in the same position and state. The same product must appear with identical design, color, and placement. Only camera angles, poses, and compositions may change - foreground elements must remain pixel-perfect consistent. Characters must maintain the EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), and EXACT same product appearance (same design, same color, same size) across ALL segments. Do NOT change character clothing, physical features, or product appearance between segments. The visualPrompt MUST explicitly maintain the same foreground elements description across all segments. Example: If hook segment shows "a young woman with long brown hair wearing a white shirt holding a blue serum bottle", then body and CTA segments must also show "the same young woman with long brown hair wearing a white shirt holding the same blue serum bottle" (NOT different hair, different shirt, or different product).
- visualPromptAlternatives: Array of 3-5 alternative visual prompts for this segment. Each alternative should:
  * Follow the 5-part formula: [Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]
  * Offer a different creative approach (different camera angle, lighting, composition, or perspective)
  * Maintain the same core message and product focus
  * Be equally detailed and specific as the primary visualPrompt
  * Provide variety in visual style while staying true to the segment's purpose
  * Maintain story continuity with previous segments (for body and CTA segments)
  * ${sceneDescription ? `🚨 CRITICAL: For the hook segment, ALL alternative prompts MUST also start with the same sceneDescription: "${sceneDescription}". They can vary camera angle (close-up, wide, overhead, side), lighting (soft, dramatic, natural, studio), composition, or perspective, but the product placement and scene must match the reference image. DO NOT create alternatives that change the product placement (e.g., from "wearing on wrist" to "on table" or "in case") - these are different scenes, not alternatives. Example: If sceneDescription is "a man wearing a watch on his wrist", all alternatives must show "person/man wearing watch on wrist", not "watch on table" or "watch in case".` : ''}
- audioNotes: Format as "Dialogue: [character name/description] in a warm, confident voice with an American accent says: '[actual script text]'" OR "Voiceover: [actual script text to be spoken by off-screen narrator]" OR "Music: [description of music/sound effects]". 

  🚨 CRITICAL VOICE CONSISTENCY: The hook scene MUST establish the voice description "in a warm, confident voice with an American accent". ALL subsequent scenes (body, CTA) MUST use the EXACT SAME voice description to ensure voice consistency across all scenes. 

  🚨 CRITICAL: ONLY generate dialogue in audioNotes if the user has explicitly provided dialogue text. If no dialogue is provided by the user, set audioNotes to an empty string (""). DO NOT auto-generate dialogue based on the story content. Only include dialogue when the user has explicitly specified it.

Duration: ${duration}s
Style: ${style}
${imageEnhancements ? `\nIMPORTANT: Reference images were provided. Use these enhancements when creating visual prompts:\n${imageEnhancements}\n\nMerge these enhancements naturally into all visual prompts (both primary and alternatives) to ensure the generated videos match the reference images.` : ''}
${sceneDescription ? `\n\n═══════════════════════════════════════════════════════════════
🚨 FINAL VALIDATION REQUIREMENT 🚨
═══════════════════════════════════════════════════════════════
Before returning your response, you MUST verify:
1. The hook segment visualPrompt begins with: "${sceneDescription}"
2. The hook segment does NOT describe the product in a different location (e.g., "on table" when image shows "on wrist")
3. All alternative prompts for the hook segment also start with this scene

If your hook segment does not start with "${sceneDescription}" or contains conflicting placement words, you MUST revise it.
═══════════════════════════════════════════════════════════════\n` : ''}

Return JSON with a "segments" array. Each segment must include:
- visualPrompt (string): The primary/default visual prompt${imageEnhancements ? ' (enhanced with reference image details)' : ''} that creates narrative flow
- visualPromptAlternatives (array of strings): 3-5 alternative visual prompts for user selection${imageEnhancements ? ' (each enhanced with reference image details)' : ''} that maintain story continuity`

    let systemPrompt: string
    if (is16SecondFormat) {
      systemPrompt = `${referenceImageSection}Create a video storyboard for a 16-second "Lego Block" format ad with exactly 3 segments. 
    
    ${adTypeInstruction}

    🚨 REQUIRED SEGMENT STRUCTURE (16-Second Format):
You MUST create exactly 3 segments with the following structure:
- 1 hook segment (0-6s, required) - Attention-grabbing opening. Can be problem-focused (frustrated face, spilled coffee, sweaty gym guy) or any compelling opening. Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End clip on the peak of emotion/action. Single continuous shot with ZERO cuts.
- 1 body segment (6-12s, required) - Product introduction + transformation. One continuous shot delivering the "oh shit" moment. Camera continues moving (match the energy of clip 1), product enters frame magically or talent uses it in real-time → instant before/after inside the shot. Slow-motion reveal at second 4-5 of this clip (around 10-11s total timeline). Single continuous shot with ZERO cuts.
- 1 CTA segment (12-16s, required) - Hero shot + CTA + logo lockup. Static or very slow push. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. Single continuous shot with ZERO cuts.

🚨 CINEMATIC FLOW REQUIREMENTS:
- CAMERA MOMENTUM MATCHING: Match camera momentum across cuts. If clip 1 ends pushing in, clip 2 should start already pushing or whip from the motion. Maintain energy flow between segments.
- COLOR GRADING: Color-grade all clips identically before sequencing for visual consistency.
- MINI-RESOLVE ENDINGS: End every clip on a "mini-resolve" (beat drop, head turn, smile, product glint) so even if someone watches only the first 4-8s it still feels complete.
- ZERO CUTS: Each segment must be a SINGLE CONTINUOUS SHOT with ZERO cuts inside the clip. No scene changes, no transitions, no cuts within the segment.
- NO MIRRORS/REFLECTIONS: DO NOT use mirrors, reflections, or stories about people looking at their reflection. Avoid any scenes involving mirrors or reflective surfaces.

The storyboard MUST include all three types: hook, body, and CTA. Do not create a storyboard with only one segment.${commonInstructions}`
    } else {
      // Legacy format (3-5 segments)
      systemPrompt = `${referenceImageSection}Create a video storyboard with 3-5 segments. 
    
    ${adTypeInstruction}

    🚨 REQUIRED SEGMENT STRUCTURE:
You MUST create at least 3 segments with the following structure:
- 1 hook segment (required) - Establishes the scene, character, or action
- 1-3 body segments (at least 1 required) - Continues the story from the hook
- 1 CTA segment (required) - Builds to a natural conclusion showcasing the product

The storyboard MUST include all three types: hook, body, and CTA. Do not create a storyboard with only one segment.${commonInstructions}`
    }

    // Step 5: Build user message
    const userMessage = sceneDescription 
      ? `${JSON.stringify(parsed)}\n\n🚨 CRITICAL: The reference image shows "${sceneDescription}". The hook segment visualPrompt MUST start with this exact scene. Before finalizing, verify your hook segment begins with "${sceneDescription}" and does NOT place the product in a different location.`
      : JSON.stringify(parsed)

    // Step 6: Call OpenAI API with timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 3000,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Storyboard generation timed out after 50 seconds')), 50000)
      )
    ]) as any

    const responseContent = completion.choices[0]?.message?.content || '{}'
    if (!responseContent) {
      throw new Error('No content in OpenAI completion response')
    }

    // Step 7: Parse and validate response
    let storyboardData: any
    try {
      storyboardData = JSON.parse(responseContent)
    } catch (parseError: any) {
      console.error('[OpenAI Direct] Invalid JSON response from planStoryboard:', responseContent)
      throw new Error(`OpenAI returned invalid JSON response: ${parseError.message}`)
    }

    // Validate segments structure
    if (!storyboardData.segments || !Array.isArray(storyboardData.segments)) {
      throw new Error('Invalid response: missing segments array')
    }

    const segmentTypes = storyboardData.segments.map((seg: any) => seg.type)
    const hasHook = segmentTypes.includes('hook')
    const hasBody = segmentTypes.includes('body')
    const hasCta = segmentTypes.includes('cta')

    if (!hasHook || !hasBody || !hasCta) {
      console.warn(`[OpenAI Direct] Storyboard validation warning: missing required segments. Found: hook=${hasHook}, body=${hasBody}, cta=${hasCta}`)
    }

    // Return segments directly (no jobId wrapper)
    return {
      segments: storyboardData.segments,
    }
  } catch (error: any) {
    console.error('[OpenAI Direct] planStoryboard error:', error)
    if (error.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check your OPENAI_API_KEY environment variable.')
    }
    if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.')
    }
    throw new Error(`Failed to plan storyboard: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Check if we're running in a serverless environment (Vercel, etc.)
 */
export function isServerlessEnvironment(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FLY_APP_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    // Check for common serverless indicators
    (process.env.NODE_ENV === 'production' && !process.env.MCP_FILESYSTEM_ROOT)
  )
}

