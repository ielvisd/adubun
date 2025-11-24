import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'
import { saveStoryboard, readStoryboard } from '../utils/storage'
import { extractCharacters, createCharacterConsistencyInstruction } from '../utils/character-extractor'
import { extractItemsFromFrames } from '../utils/scene-conflict-checker'
import type { Storyboard, Segment } from '~/types/generation'

const regenerateStoryboardConflictSchema = z.object({
  storyboardId: z.string(),
  conflictDetails: z.object({
    item: z.string(),
    detectedInFrames: z.array(z.string()).optional(),
    confidence: z.number().optional(),
  }),
  originalStory: z.object({
    id: z.string(),
    description: z.string(),
    hook: z.string(),
    body: z.string().optional(),
    bodyOne: z.string().optional(),
    bodyTwo: z.string().optional(),
    callToAction: z.string(),
  }),
  originalPrompt: z.string(),
  productImages: z.array(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const {
      storyboardId,
      conflictDetails,
      originalStory,
      originalPrompt,
      productImages = [],
    } = regenerateStoryboardConflictSchema.parse(body)

    console.log(`[Regenerate Storyboard Conflict] Regenerating storyboard ${storyboardId} due to conflict: ${conflictDetails.item}`)

    // Read original storyboard to get metadata
    let originalStoryboard: Storyboard | null = null
    try {
      originalStoryboard = await readStoryboard(storyboardId)
    } catch (error: any) {
      console.warn(`[Regenerate Storyboard Conflict] Could not read original storyboard: ${error.message}`)
    }

    // Track cost
    await trackCost('regenerate-storyboard-conflict', 0.002, {
      storyboardId,
      conflictItem: conflictDetails.item,
    })

    // Use metadata from original storyboard or defaults
    const aspectRatio = originalStoryboard?.meta.aspectRatio || '16:9'
    const model = originalStoryboard?.meta.model || 'google/veo-3.1-fast'
    const selectedMood = originalStoryboard?.meta.mood || 'professional'
    const selectedAdType = originalStoryboard?.meta.adType || 'lifestyle'

    // Construct system prompt with Ad Type logic (same as generate-storyboards)
    let adTypeInstruction = ''
    
    switch (selectedAdType) {
      case 'lifestyle':
        adTypeInstruction = `LIFESTYLE AD STRATEGY:
- Focus on the product being held and discussed in real-life situations
- Characters hold the product and talk about its benefits, never actually using it
- Emphasize human interaction, social context, and environmental details
- Show the benefits and emotional payoff through discussion and dialogue
- Use natural lighting and authentic settings`
        break
      case 'product':
        adTypeInstruction = `PRODUCT AD STRATEGY:
- CRITICAL: The product MUST be the ONLY subject in ALL frames
- ABSOLUTELY NO HUMANS: No people, no hands, no human body parts in any frame
- Pure product focus: The product is the sole star of every shot
- Use macro shots, extreme close-ups, and slow pans to show intricate details
- Showcase product from multiple angles: front, back, side, top, 360° rotation
- Minimal or blurred backgrounds (bokeh, clean studio backdrop) to keep 100% attention on product
- Highlight craftsmanship, texture, materials, finish, and quality
- Camera movements: Slow dolly, smooth pan, gentle rotation around product
- Lighting: Studio-quality lighting that showcases product features and materials
- Focus on what makes the product premium: stitching, grain, polish, construction`
        break
      case 'unboxing':
        adTypeInstruction = `UNBOXING AD STRATEGY:
- Structure the narrative as a reveal process:
  1. Hook: Sealed box/packaging (anticipation)
  2. Body 1: Hands opening the package (action)
  3. Body 2: Reveal of the product inside (satisfaction)
  4. CTA: Product fully displayed with accessories (completeness)
- Focus on the tactile experience and packaging quality`
        break
      case 'testimonial':
        adTypeInstruction = `TESTIMONIAL AD STRATEGY:
- Visual style should feel authentic and user-generated (UGC)
- Use "selfie-style" angles or intimate interview setups
- Focus on facial expressions of satisfaction and trust
- Show the user holding the product and talking about their experience, never actually using it`
        break
      case 'tutorial':
        adTypeInstruction = `TUTORIAL AD STRATEGY:
- Structure as a clear discussion guide:
  1. Hook: The problem or the "before" state
  2. Body 1: Character holds product and discusses step 1 (clear discussion, no usage)
  3. Body 2: Character continues discussing benefits and results
  4. CTA: Final benefit discussion and call to action
- Visuals must be instructional and clear (no distracting elements)
- Character holds product and talks about it, never actually using it`
        break
      case 'brand_story':
        adTypeInstruction = `BRAND STORY AD STRATEGY:
- Cinematic, narrative-driven approach
- Focus on values, origin, and atmosphere over direct product selling
- Use wide shots, slow motion, and dramatic lighting
- Connect the brand's mission to the viewer's identity`
        break
      case 'luxury':
        adTypeInstruction = `LUXURY/CINEMATIC AD STRATEGY:
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
- Product reveal should be dramatic and hero-shot worthy`
        break
      default:
        adTypeInstruction = `Create a professional, high-quality ad that showcases the product effectively.`
    }

    // Extract available items from hook frames for frame-aware regeneration
    let availableItems: string[] = []
    if (conflictDetails.detectedInFrames && conflictDetails.detectedInFrames.length > 0) {
      try {
        console.log(`[Regenerate Storyboard Conflict] Extracting available items from ${conflictDetails.detectedInFrames.length} hook frame(s)...`)
        availableItems = await extractItemsFromFrames(conflictDetails.detectedInFrames)
        if (availableItems.length > 0) {
          console.log(`[Regenerate Storyboard Conflict] Found ${availableItems.length} available items in hook frames:`, availableItems)
        } else {
          console.warn('[Regenerate Storyboard Conflict] No items extracted from hook frames, proceeding without frame-aware constraints')
        }
      } catch (error: any) {
        console.warn(`[Regenerate Storyboard Conflict] Error extracting items from frames: ${error.message}, proceeding without frame-aware constraints`)
      }
    }

    // Build conflict-specific instruction with frame-aware guidance
    let conflictInstruction = `🚨 CRITICAL CONFLICT RESOLUTION REQUIREMENT:
The solution item "${conflictDetails.item}" is ALREADY PRESENT in the hook scene. You MUST generate a DIFFERENT solution that:
1. Solves the SAME problem or addresses the SAME need
2. Uses a DIFFERENT item, approach, or method (NOT "${conflictDetails.item}")
3. Maintains the same emotional arc and story flow
4. Feels natural and logical as an alternative solution

DO NOT use "${conflictDetails.item}" in the body segment. Generate a creative alternative solution.`

    // Add frame-aware constraint if we have available items
    if (availableItems.length > 0) {
      const itemsList = availableItems.map(item => `"${item}"`).join(', ')
      conflictInstruction += `\n\n🚨 FRAME-AWARE CONSTRAINT - STRICTLY ENFORCED:
The following items are ALREADY VISIBLE in the hook scene frames: ${itemsList}

🚨 ABSOLUTE REQUIREMENT: Your new solution MUST use ONLY items from this list above. 

CRITICAL RULES:
1. DO NOT introduce ANY new items that aren't in the available items list above
2. DO NOT mention items like "orange juice", "toast", "bread", or any other item unless it appears in the list above
3. If you cannot create a solution using ONLY the items in the list above, you MUST choose a different approach that uses items from the list
4. DO NOT invent new items - any solution that introduces an item not in the available items list will be REJECTED
5. Before finalizing your solution, verify that EVERY item mentioned in your body segment is in the available items list above

VALIDATION CHECK: Before submitting your storyboard, review your body segment description and visualPrompt. If you mention ANY item that is NOT in the list above, you MUST revise your solution to use only items from the list.

Examples of valid solutions using available items:
- If "coffee cup" is in the list, you could have the robot "refill the coffee cup" or "bring the coffee cup closer"
- If "plate" is in the list, you could have the robot "organize items on the plate" or "bring the plate to the table"
- If "kitchen counter" is in the list, you could have the robot "help organize items on the counter"

Examples of INVALID solutions (will be rejected):
- ❌ If "orange juice" is NOT in the list, do NOT suggest "robot brings orange juice"
- ❌ If "toast" is NOT in the list, do NOT suggest "robot brings toast"
- ❌ If "bread" is NOT in the list, do NOT suggest "robot brings bread"

The solution MUST interact with or use items that are already present in the hook frames, not introduce completely new items.`
    } else {
      conflictInstruction += `\n\n⚠️ NOTE: Frame analysis was not available. When generating the solution, try to use items that would logically already be present in the hook scene based on the story context.`
    }

    const systemPrompt = `You are an expert at creating emotionally captivating video storyboards for ad content.
    
${adTypeInstruction}

${conflictInstruction}

🚨 FORMAT: 16-Second "Lego Block" Structure (Default)
Generate a single storyboard for a 16-second ad. The storyboard must have 3 segments with ZERO cuts inside each clip:
1. Hook (0-6s): Attention-grabbing opening - can be problem-focused (frustrated face, spilled coffee, sweaty gym guy) or any compelling opening. Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End clip on the peak of emotion/action. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.
2. Product Intro (6-12s): Product introduction + transformation - one continuous shot delivering the "oh shit" moment. Camera continues moving (match the energy of clip 1), product enters frame magically or talent uses it in real-time → instant before/after inside the shot. Slow-motion reveal at second 4-5 of this clip (around 10-11s total timeline). 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.
3. CTA (12-16s): Hero shot + CTA + logo lockup - static or very slow push. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.

🚨 CINEMATIC FLOW REQUIREMENTS:
- CAMERA MOMENTUM MATCHING: Match camera momentum across cuts. If clip 1 ends pushing in, clip 2 should start already pushing or whip from the motion. Maintain energy flow between segments.
- COLOR GRADING: Color-grade all clips identically before sequencing for visual consistency.
- MINI-RESOLVE ENDINGS: End every clip on a "mini-resolve" (beat drop, head turn, smile, product glint) so even if someone watches only the first 4-8s it still feels complete.
- 🚨🚨🚨 ZERO CUTS - ABSOLUTE MANDATORY REQUIREMENT: Each segment must be a SINGLE CONTINUOUS SHOT with ZERO cuts, ZERO transitions, ZERO edits, ZERO scene changes inside the clip. NO cuts, NO transitions, NO edits, NO scene changes within the segment. This is a HARD REQUIREMENT - each segment must be ONE unbroken shot from start to finish. VEO must generate continuous footage without any cuts or transitions.
- **🚨🚨🚨 HARD REJECTION RULE - NO MIRRORS/REFLECTIONS (ABSOLUTE MANDATORY)**: DO NOT use mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection. DO NOT include mirrors in visual prompts. DO NOT generate images with mirrors visible. Any storyboard containing these elements will be automatically rejected. This is a hard requirement that applies to ALL storyboard generations. The visualPrompt MUST explicitly avoid any mention of mirrors, reflections, or reflective surfaces. Generated images must NOT show mirrors or reflections.
- **CRITICAL: NO CHILDREN**: DO NOT include children in any scenes. No children visible in any part of the storyboard. All characters must be adults.
- **CRITICAL: NO ELECTRONIC DEVICES**: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the storyboard will be rejected.
- **CRITICAL: MINIMAL BACKGROUND**: Keep scenes clean and focused. Avoid cluttered backgrounds with lots of objects, furniture, or visual distractions. Minimize background elements to keep focus on the product and characters. Simple, uncluttered environments work best. Use shallow depth of field or selective focus to blur background distractions when needed.
- **CRITICAL: NO MESSY SURFACES**: DO NOT use "messy", "cluttered", "disorganized", or "chaotic" to describe surfaces, countertops, tables, desks, or any surfaces. Keep all surfaces clean, organized, and minimal. Examples to avoid: ❌ "messy countertop", ❌ "cluttered table", ❌ "disorganized workspace". Instead use: ✅ "clean countertop", ✅ "minimal table", ✅ "organized workspace". Messy surfaces lead to duplicate or weird items appearing in scenes.
- **CRITICAL: ONE ACTION ONLY**: The body segment should show ONLY ONE action happening. The product/character should do ONE thing, not multiple things. For example: ✅ "Robot offers a cup of tea" (single action) ❌ "Robot tidies magazine AND offers tea AND helps zip dress" (multiple actions - REJECTED). Keep the action simple and achievable within the segment duration. Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate.
- **CRITICAL: ITEM VISIBILITY IN PRODUCT HANDS**: When regenerating a solution where the product/robot offers, gives, or brings an item, the visualPrompt MUST explicitly describe:
  - The product/robot HOLDING the item in its hands (e.g., "the robot holds a coffee cup in its hands", "the robot's hands grasp a steaming coffee cup")
  - The product/robot EXTENDING or OFFERING the item toward the character (e.g., "the robot extends the coffee cup toward the person", "the robot offers the coffee cup with its hands outstretched")
  - The item being VISIBLE in the product's hands BEFORE it transitions to the character
  - Example: ✅ "The robot holds a coffee cup in its hands and extends it toward the person" ❌ "The robot offers coffee" (too vague - doesn't show item in hands)
  - If the story mentions an item being given/offered, the visual prompt MUST show the item in the product's hands, not just mention it abstractly
- **CRITICAL: ONE PRODUCT ONLY**: Each scene must contain ONLY ONE product. Do NOT include multiple products, product variations, or different product models in the same scene. If the product is a robot, there should be only ONE robot. If the product is a bottle, there should be only ONE bottle. Multiple products in a scene will cause visual confusion and inconsistency. Examples to avoid: ❌ "two robots", ❌ "multiple bottles", ❌ "several products". Instead use: ✅ "one robot", ✅ "a single bottle", ✅ "the product".
- **CRITICAL: ONE CHARACTER SPEAKING**: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.

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
  - If a character speaks, write it explicitly in the 'audioNotes' field using format: "Dialogue: [character] says: '[text]'"
  - Use ellipses (...) for natural pauses.
  - Include audio actions: "(laughs)", "(sighs)", "(claps)".
  - **CRITICAL: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.**
  - CRITICAL: Each scene MUST have UNIQUE dialogue that is DIFFERENT from other scenes. Do NOT repeat the same dialogue across scenes.
  - Dialogue should progress the story: Hook introduces, Body develops the single action, CTA concludes. Each scene's dialogue should feel like a natural next step in the conversation or narrative.
  - If a character speaks in multiple scenes, their dialogue must evolve and advance the story - never repeat the same words or phrases.
  - **DIALOGUE TIMING CRITICAL:** Characters can speak at the beginning of the scene (0s is allowed), but ALL dialogue MUST END at least 2 seconds before the scene ends. For 6-second scenes, dialogue must end by 4 seconds, leaving 2 seconds of silence at the end for smooth scene transitions.
  - **DIALOGUE-ONLY AUDIO:** Veo should generate dialogue only - no background music, ambient sounds, or other audio. Only spoken dialogue from characters.
  - **ENGLISH ONLY:** All dialogue must be in **English only** - no other languages allowed.
  - **CHARACTER DIALOGUE (NO NARRATOR):** Characters visible in the video should speak directly on-camera. **NO narrator, NO voiceover, NO off-screen announcer**. The dialogue must come from characters visible in the scene speaking on-camera.
  - **CRITICAL: If audioNotes contains Dialogue, the visualPrompt MUST show the character speaking:**
    - Add explicit timecodes: "[00:00-00:04] The [character] speaks: '[dialogue text]', mouth moving, speaking gesture visible"
    - Describe the character's speaking action: "speaking to camera", "saying [dialogue]", "mouth moving as she speaks"
    - Ensure the character is shown actively speaking on-camera, not just reacting or thinking
    - Example: "[00:00-00:04] The woman looks at the camera and speaks: 'How am I going to finish all of this?', her mouth moving clearly as she speaks. [00:04-00:06] She looks down at her list."
- For SOUND EFFECTS (SFX): Describe sounds with clarity: "SFX: thunder cracks in the distance", "SFX: door creaks open"
- For AMBIENT NOISE: Define the background soundscape: "Ambient noise: the quiet hum of a starship bridge", "Ambient noise: distant city traffic"
- Audio inputs are strictly ignored by the video model, so all audio intent must be in the prompt text.

🚨 CRITICAL CHARACTER CONSISTENCY REQUIREMENTS:
- Extract ALL characters mentioned in the hook scene and maintain their EXACT appearance across ALL segments
- For each character, identify: gender (male/female/non-binary), age (teenage/elderly/young adult/etc.), physical features (hair color/style, build, distinctive features), and clothing style
- In the hook segment visualPrompt: Include explicit character descriptions with gender, age, and physical features
- In body and CTA segment visualPrompts: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance" to maintain consistency
- CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
- Do NOT change character gender, age, or physical appearance between scenes
- Reference characters consistently: "the same character from the hook scene" or "the identical [age] [gender] person"
- **🚨🚨🚨 CRITICAL: PRODUCT HAND CONSISTENCY (MANDATORY)**: If a character holds a product in their hand (left or right), they MUST keep it in the SAME hand across ALL segments to maintain continuity. Do NOT switch hands between segments. If the product is in the left hand in the hook segment, it must remain in the left hand in the body and CTA segments. If the product is in the right hand in the hook segment, it must remain in the right hand in the body and CTA segments. This applies to ALL products (bottles, serums, makeup, containers, items, etc.). The visualPrompt MUST explicitly state which hand holds the product and maintain this consistency across all segments. Example: If hook segment shows "the character holds the product bottle in her left hand", then body and CTA segments must also show "the same character holds the product bottle in her left hand" (NOT right hand).
- **🚨🚨🚨 CRITICAL: BACKGROUND/SCENE CONSISTENCY (MANDATORY)**: Maintain the EXACT same background, environment, and setting across ALL frames and segments. Do NOT change scenes, backgrounds, or environments between segments. The same room, same location, same background elements must appear consistently. Only camera angles, character poses, and product positions may change - the background/scene must remain identical. If the hook segment is in a bathroom, ALL segments (body and CTA) must be in the SAME bathroom with the SAME background elements. If the hook segment is in a kitchen, ALL segments must be in the SAME kitchen. The visualPrompt MUST explicitly maintain the same background/environment description across all segments. Example: If hook segment shows "in a clean bathroom with white sink", then body and CTA segments must also show "in the same clean bathroom with white sink" (NOT a different room or different background).
- **VOICE CONSISTENCY:** When a character speaks in multiple scenes, use the EXACT SAME voice description in the audioNotes field across all scenes
  - Extract voice characteristics from the hook scene (e.g., "a warm female voice", "a deep male voice", "a young energetic voice")
  - Maintain the same voice description for each character throughout all scenes where they speak
  - Include voice characteristics in the hook scene audioNotes, then reference the same voice in subsequent scenes
  - Example: If hook scene has "a warm, confident female voice", use "the same warm, confident female voice" in body and CTA scenes

🚨🚨🚨 CRITICAL: Create a CONTINUOUS story flow with ZERO cuts, ZERO transitions, ZERO edits. Each scene must flow seamlessly from the previous scene with NO cuts, NO jumps, NO scene changes, NO transitions, NO edits. Use language emphasizing continuous action and unbroken flow. Each segment must feel like a natural continuation of the previous segment with NO visual breaks, NO cuts, NO transitions, NO edits, NO scene changes. Maintain the same camera perspective, same environment, same moment in time flowing forward. VEO must generate each segment as ONE unbroken continuous shot without any cuts or transitions.

The storyboard should:
- Follow the specific strategy for ${selectedAdType} ads
- Use a ${selectedMood} emotional tone and mood throughout all scenes
- Include detailed visual prompts for each scene that create emotional captivation
- Use emotional visual storytelling: include facial expressions, body language, and visual mood that connects with viewers
- Limit scenes to 3-4 people maximum per scene (prefer 1-3 people for better face quality)
- Include face quality instructions: use close-ups and medium shots, emphasize "sharp faces, clear facial features, detailed faces, professional portrait quality"
- Avoid large groups, crowds, or more than 4 people in any scene
- Match the story content provided
- Be suitable for ${aspectRatio} aspect ratio

Return ONLY valid JSON with this structure:
{
    "storyboard": {
      "id": "storyboard-1",
    "segments": [
      {
        "type": "hook",
        "description": "Hook scene description - attention-grabbing opening",
        "visualPrompt": "Detailed visual prompt for hook scene following the 5-part formula. Single continuous shot, no cuts. End on mini-resolve.",
        "audioNotes": "Spoken dialogue or voiceover script for this scene",
        "startTime": 0,
        "endTime": 6
      },
      {
        "type": "body",
        "description": "Product introduction + transformation scene - delivers 'oh shit' moment",
        "visualPrompt": "Detailed visual prompt for product intro scene following the 5-part formula. Single continuous shot, no cuts. Camera matches momentum from hook. Slow-motion reveal at 4-5s of this clip. End on mini-resolve. CRITICAL: Do NOT use '${conflictDetails.item}' - use a DIFFERENT solution.",
        "audioNotes": "Spoken dialogue or voiceover script for this scene",
        "startTime": 6,
        "endTime": 12
      },
      {
        "type": "cta",
        "description": "Hero shot + CTA + logo lockup scene",
        "visualPrompt": "Detailed visual prompt for CTA scene following the 5-part formula. Single continuous shot, no cuts. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline. Ends exactly at 16.000s.",
        "audioNotes": "Spoken dialogue or voiceover script for this scene",
        "startTime": 12,
        "endTime": 16
      }
    ]
  }
}`

    // Support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
    const bodyContent = originalStory.body || originalStory.bodyOne || ''
    const bodyTwoContent = originalStory.bodyTwo || ''
    
    const userPrompt = `Create an emotionally captivating storyboard based on this story, but with a DIFFERENT solution in the body segment (avoid using "${conflictDetails.item}"):

Story Description: ${originalStory.description}
Hook: ${originalStory.hook}
Body: ${bodyContent}${bodyTwoContent ? `\n(Note: Legacy format detected. Body 2 content: ${bodyTwoContent} - incorporate into CTA if needed)` : ''}
CTA: ${originalStory.callToAction}

Original Prompt: ${originalPrompt}
Ad Type: ${selectedAdType}
${productImages.length > 0 ? `Product images are available for reference.` : ''}

🚨 CRITICAL: The body segment must provide a DIFFERENT solution that does NOT use "${conflictDetails.item}". The solution should solve the same problem but use a different approach, item, or method.

🚨 CHARACTER CONSISTENCY REQUIREMENT:
- Extract all characters from the hook scene and ensure they maintain IDENTICAL appearance (gender, age, physical features, clothing) across all segments
- In the hook segment: Include explicit character descriptions (e.g., "a teenage [gender] with [hair color] hair, [build], wearing [clothing]")
- In body and CTA segments: Reference characters as "the same [age] [gender] person with [features]" to maintain consistency
- Do NOT change character gender, age, or physical appearance between scenes
- **VOICE CONSISTENCY:** Extract voice characteristics from the hook scene audioNotes and use the EXACT SAME voice description for each character in all subsequent scenes where they speak

Stay true to the story content. Focus on creating emotionally compelling visuals that evoke emotions through facial expressions, body language, and visual mood. Limit all scenes to 3-4 people maximum and ensure clear, sharp faces through close-ups and medium shots.

🚨 REMEMBER: This is a 16-second format with 3 segments (6s + 6s + 4s). Each segment must be a single continuous shot with zero cuts. Match camera momentum between segments. End each clip on a mini-resolve. The CTA segment must end exactly at 16.000s.`

    // Use OpenAI chat completion via MCP
    const storyboardsData = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    })

    // Handle response - chat_completion returns content wrapped in JSON
    let data = storyboardsData
    if (storyboardsData.content && typeof storyboardsData.content === 'string') {
      // Parse the content string which contains JSON
      const parsedContent = JSON.parse(storyboardsData.content)
      if (parsedContent.content) {
        // Parse the actual content
        data = JSON.parse(parsedContent.content)
      } else {
        data = parsedContent
      }
    } else if (storyboardsData.content && Array.isArray(storyboardsData.content) && storyboardsData.content[0]?.text) {
      const parsedContent = JSON.parse(storyboardsData.content[0].text)
      if (parsedContent.content) {
        data = JSON.parse(parsedContent.content)
      } else {
        data = parsedContent
      }
    } else if (typeof storyboardsData === 'string') {
      data = JSON.parse(storyboardsData)
    } else if (storyboardsData.choices && storyboardsData.choices[0]?.message?.content) {
      data = JSON.parse(storyboardsData.choices[0].message.content)
    }

    // Extract storyboard from response
    const sbData = data.storyboard || data
    const segments: Segment[] = (sbData.segments || []).map((seg: any) => ({
      type: seg.type as 'hook' | 'body' | 'cta',
      description: seg.description || '',
      startTime: seg.startTime || 0,
      endTime: seg.endTime || 6,
      visualPrompt: seg.visualPrompt || '',
      visualPromptAlternatives: seg.visualPromptAlternatives || [],
      audioNotes: seg.audioNotes || '',
      status: 'pending' as const,
    }))

    // Ensure we have exactly 3 segments for 16-second format
    if (segments.length !== 3) {
      // Fill in missing segments from story - support both new format (body) and old format (bodyOne/bodyTwo)
      const bodyContent = originalStory.body || originalStory.bodyOne || ''
      const ctaContent = originalStory.body ? originalStory.callToAction : `${originalStory.bodyTwo || ''} ${originalStory.callToAction}`.trim()
      const bodyDescription = originalStory.body || originalStory.bodyOne || ''
      
      const baseSegments: Segment[] = [
        { type: 'hook', description: originalStory.hook, startTime: 0, endTime: 6, visualPrompt: `${originalStory.hook}, professional ad quality, single continuous shot, no cuts`, status: 'pending', audioNotes: '' },
        { type: 'body', description: bodyDescription, startTime: 6, endTime: 12, visualPrompt: `${bodyContent}, professional ad quality, single continuous shot, no cuts, slow-motion reveal at 4-5s, DO NOT use ${conflictDetails.item}`, status: 'pending', audioNotes: '' },
        { type: 'cta', description: ctaContent, startTime: 12, endTime: 16, visualPrompt: `${ctaContent}, professional ad quality, single continuous shot, no cuts, ends at exactly 16.000s`, status: 'pending', audioNotes: '' },
      ]
      segments.splice(0, segments.length, ...baseSegments)
    }

    // Extract characters from the story
    const hookSegment = segments.find(s => s.type === 'hook')
    const characters = await extractCharacters(originalStory.description, hookSegment?.description || originalStory.hook)

    // Enhance visual prompts with character consistency instructions
    if (characters.length > 0) {
      const characterInstruction = createCharacterConsistencyInstruction(characters)
      
      // Enhance hook segment with explicit character descriptions
      if (hookSegment) {
        // Add character instruction to hook if not already present
        if (!hookSegment.visualPrompt.includes('CHARACTER CONSISTENCY')) {
          hookSegment.visualPrompt = `${characterInstruction}\n\n${hookSegment.visualPrompt}`
        }
      }

      // Enhance body and CTA segments with character consistency references
      segments.forEach((segment) => {
        if (segment.type !== 'hook') {
          // Add character consistency instruction if not already present
          if (!segment.visualPrompt.includes('CHARACTER CONSISTENCY') && !segment.visualPrompt.includes('the same')) {
            segment.visualPrompt = `${characterInstruction}\n\n${segment.visualPrompt}`
          }
        }
      })
    }

    const storyboard: Storyboard = {
      id: sbData.id || nanoid(),
      segments,
      characters: characters.length > 0 ? characters : undefined,
      meta: {
        duration: 16,
        aspectRatio,
        model: model || 'google/veo-3.1-fast',
        adType: selectedAdType,
        format: '16s', // 16-second format (default)
        mood: selectedMood,
      },
      promptJourney: {
        userInput: {
          prompt: originalPrompt,
          adType: selectedAdType,
          mood: selectedMood,
          aspectRatio,
          model: model || 'google/veo-3.1-fast',
          productImages: [],
          subjectReference: originalStoryboard?.meta.subjectReference,
        },
        storyGeneration: originalStory ? {
          systemPrompt: 'Story generation handled by MCP server',
          userPrompt: originalPrompt,
          output: {
            hook: originalStory.hook,
            body: originalStory.body || originalStory.bodyOne || '',
            bodyOne: originalStory.bodyOne || '', // Keep for backward compatibility
            bodyTwo: originalStory.bodyTwo || '', // Keep for backward compatibility
            callToAction: originalStory.callToAction,
            description: originalStory.description,
          },
        } : undefined,
        storyboardGeneration: {
          systemPrompt,
          userPrompt,
          output: segments,
        },
      },
      createdAt: Date.now(),
    }

    // Save storyboard
    await saveStoryboard(storyboard)

    console.log(`[Regenerate Storyboard Conflict] Successfully regenerated storyboard ${storyboard.id}`)

    return {
      storyboard,
      regenerated: true,
      conflictItem: conflictDetails.item,
    }
  } catch (error: any) {
    console.error('[Regenerate Storyboard Conflict] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to regenerate storyboard',
    })
  }
})

