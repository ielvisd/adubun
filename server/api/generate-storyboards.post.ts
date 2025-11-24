import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'
import { saveStoryboard } from '../utils/storage'
import { extractCharacters, createCharacterConsistencyInstruction } from '../utils/character-extractor'
import type { Storyboard, Segment } from '~/types/generation'

const generateStoryboardsSchema = z.object({
  story: z.object({
    id: z.string(),
    description: z.string(),
    hook: z.string(),
    body: z.string().optional(), // New format - single body field
    bodyOne: z.string().optional(), // Old format - for backward compatibility
    bodyTwo: z.string().optional(), // Old format - for backward compatibility
    callToAction: z.string(),
  }),
  prompt: z.string(),
  productImages: z.array(z.string()).optional(),
  aspectRatio: z.enum(['16:9', '9:16']),
  model: z.string().optional(),
  mood: z.string().optional(), // Video tone/mood from homepage
  adType: z.string().optional(), // Ad Type from homepage
  seamlessTransition: z.boolean().optional(), // Seamless transition toggle (default: true)
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { story, prompt, productImages = [], aspectRatio, model, mood, adType, seamlessTransition = true } = generateStoryboardsSchema.parse(body)

    // Track cost
    await trackCost('generate-storyboards', 0.002, { storyId: story.id })

    // Generate 1 storyboard using OpenAI directly
    // Use chat completion to generate a single storyboard
    // Use mood (Video Tone) from homepage, default to 'professional' if not provided
    const selectedMood = mood || 'professional'
    const selectedAdType = adType || 'lifestyle'
    
    // Construct system prompt with Ad Type logic
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

    const systemPrompt = `You are an expert at creating emotionally captivating video storyboards for ad content.

🚨🚨🚨 CRITICAL CTA DIALOGUE WORD LIMIT - READ THIS FIRST - ABSOLUTE MANDATORY (ZERO TOLERANCE) 🚨🚨🚨
For CTA segments, any dialogue MUST be EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE.
- You MUST NEVER generate CTA dialogue with more than 5 words
- BEFORE writing any CTA dialogue, COUNT the words FIRST
- If your intended dialogue exceeds 5 words, shorten it to 5 words or less BEFORE writing it
- Examples: ✅ "Buy now to transform." (5 words) ✅ "Shop now and save." (4 words) ✅ "Get yours today." (3 words)
- Examples to NEVER generate: ❌ "Purchase now to enjoy 60% off." (6 words - FORBIDDEN) ❌ "Buy now to transform your skin." (7 words - FORBIDDEN)
- Any CTA dialogue exceeding 5 words will cause the ENTIRE storyboard to be REJECTED and regenerated
- COUNT WORDS BEFORE WRITING, NOT AFTER
    
${adTypeInstruction}

🚨 FORMAT: 16-Second "Lego Block" Structure (Default)
Generate a single storyboard for a 16-second ad. The storyboard must have 3 segments with ZERO cuts inside each clip:
1. Hook (0-6s): Attention-grabbing opening - can be problem-focused (frustrated face, spilled coffee, sweaty gym guy) or any compelling opening. Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End clip on the peak of emotion/action. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.
2. Product Intro (6-12s): Product introduction + discussion - one continuous shot delivering the "oh shit" moment. Camera continues moving (match the energy of clip 1), product enters frame magically or talent holds it and talks about it in real-time → character discusses benefits and transformation. Slow-motion reveal at second 4-5 of this clip (around 10-11s total timeline). CRITICAL: The character must be actively moving and performing actions throughout the ENTIRE segment - holding the product, gesturing with it, moving hands, changing expressions, evolving body language while talking. Do NOT show the character as still or motionless. Show continuous motion and dynamic action. The character holds the product and talks about it, never actually using it. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.
3. CTA (12-16s): Hero shot + CTA + logo lockup - static or very slow push. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish.

🚨 CINEMATIC FLOW REQUIREMENTS:
- CAMERA MOMENTUM MATCHING: Match camera momentum across cuts. If clip 1 ends pushing in, clip 2 should start already pushing or whip from the motion. Maintain energy flow between segments.
- COLOR GRADING: Color-grade all clips identically before sequencing for visual consistency.
- MINI-RESOLVE ENDINGS: End every clip on a "mini-resolve" (beat drop, head turn, smile, product glint) so even if someone watches only the first 4-8s it still feels complete.
- 🚨🚨🚨 ZERO CUTS - ABSOLUTE MANDATORY REQUIREMENT: Each segment must be a SINGLE CONTINUOUS SHOT with ZERO cuts, ZERO transitions, ZERO edits, ZERO scene changes inside the clip. NO cuts, NO transitions, NO edits, NO scene changes within the segment. This is a HARD REQUIREMENT - each segment must be ONE unbroken shot from start to finish. VEO must generate continuous footage without any cuts or transitions.
- **CTA SEGMENT LANGUAGE GUIDELINES (CRITICAL FOR CONTENT MODERATION):** For CTA segments, especially for beauty/skincare products, use safer terminology to avoid content moderation filters:
  - Prefer "complexion", "appearance", "radiant results", "visible transformation" over "skin" when describing results
  - Use "achieve radiant results" or "transform your appearance" instead of "transform your skin"
  - Use "clear complexion" or "radiant appearance" instead of "clear skin"
  - Focus on product benefits and visible results rather than skin appearance changes
  - Emphasize product focus over appearance changes in CTA descriptions
  - Example: ✅ "Transform your appearance overnight" ❌ "Transform your skin overnight"
  - Example: ✅ "Achieve a clear complexion" ❌ "Get clear skin"
  - **🚨 OPENING/CLOSING DISTINCTION (CRITICAL)**: The hook (opening) and CTA (closing) segments MUST have moderate visual distinction - at least 2 of the following must differ: 1) Camera angle (e.g., if hook is close-up, CTA should be medium/wide; if hook is front-facing, CTA should be side/three-quarter; or change elevation), 2) Character pose (different body position, gesture, expression, orientation), 3) Composition (different framing, focal point, depth of field). This applies to ALL ad types. Hook should establish the scene/problem with one style. CTA should conclude with a visually distinct style while maintaining the same character and setting. DO NOT create identical opening and closing shots - they must be visually different.
  - **🚨🚨🚨 CRITICAL CTA DIALOGUE WORD LIMIT (ABSOLUTE MANDATORY - ZERO TOLERANCE)**: For CTA segments, any dialogue MUST be EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE. You MUST NEVER generate CTA dialogue with more than 5 words. Before generating any dialogue in the CTA segment's audioNotes field, you MUST:
    1. FIRST, count the words in your intended dialogue text BEFORE writing it - count each word carefully
    2. If your intended dialogue exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it - take only the first 5 words
    3. Generate ONLY dialogue that is 5 words or less - do NOT generate dialogue and then truncate it
    4. Examples of VALID CTA dialogue: "Buy now to transform." (5 words), "Shop now and save." (4 words), "Get yours today." (3 words), "Transform your life now." (5 words)
    5. Examples of INVALID dialogue that you MUST NOT generate: 
       ❌ "Purchase now to enjoy 60% off." (6 words - DO NOT GENERATE THIS - FORBIDDEN)
       ❌ "Buy now to transform your skin overnight!" (8 words - DO NOT GENERATE THIS - FORBIDDEN)
       ❌ "Purchase now to transform your skin." (7 words - DO NOT GENERATE THIS - FORBIDDEN)
       ❌ "Shop now and save big today!" (6 words - DO NOT GENERATE THIS - FORBIDDEN)
    6. CRITICAL: If the user provides dialogue that exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it. Take only the first 5 words. Do NOT include the original long dialogue.
    7. COUNT WORDS BEFORE WRITING: Always count words BEFORE you write the dialogue in audioNotes. Do not write dialogue first and then count - count first, then write only if it's 5 words or less.
  - This requirement applies to ALL CTA segments. Any dialogue exceeding 5 words will cause the storyboard to be REJECTED and the entire response will be regenerated. You MUST count words BEFORE generating dialogue, not after. If you generate dialogue with more than 5 words, the ENTIRE storyboard will be rejected.
- **🚨🚨🚨 HARD REJECTION RULE - NO MIRRORS/REFLECTIONS (ABSOLUTE MANDATORY)**: DO NOT use mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection. DO NOT include mirrors in visual prompts. DO NOT generate images with mirrors visible. Any storyboard containing these elements will be automatically rejected. This is a hard requirement that applies to ALL storyboard generations. The visualPrompt MUST explicitly avoid any mention of mirrors, reflections, or reflective surfaces. Generated images must NOT show mirrors or reflections.
- **CRITICAL: NO CHILDREN**: DO NOT include children in any scenes. No children visible in any part of the storyboard. All characters must be adults.
- **CRITICAL: NO ELECTRONIC DEVICES**: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the storyboard will be rejected.
- **CRITICAL: MINIMAL BACKGROUND**: Keep scenes clean and focused. Avoid cluttered backgrounds with lots of objects, furniture, or visual distractions. Minimize background elements to keep focus on the product and characters. Simple, uncluttered environments work best. Use shallow depth of field or selective focus to blur background distractions when needed.
- **CRITICAL: NO MESSY SURFACES**: DO NOT use "messy", "cluttered", "disorganized", or "chaotic" to describe surfaces, countertops, tables, desks, or any surfaces. Keep all surfaces clean, organized, and minimal. Examples to avoid: ❌ "messy countertop", ❌ "cluttered table", ❌ "disorganized workspace". Instead use: ✅ "clean countertop", ✅ "minimal table", ✅ "organized workspace". Messy surfaces lead to duplicate or weird items appearing in scenes.
- **CRITICAL: ONE ACTION ONLY**: The body segment should show ONLY ONE action happening. The product/character should do ONE thing, not multiple things. For example: ✅ "Robot offers a cup of tea" (single action) ❌ "Robot tidies magazine AND offers tea AND helps zip dress" (multiple actions - REJECTED). Keep the action simple and achievable within the segment duration. Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate.
- **CRITICAL: ITEM VISIBILITY IN PRODUCT HANDS**: When a product/robot offers, gives, or brings an item (e.g., coffee cup, tea, food), the visualPrompt MUST explicitly describe:
  - The product/robot HOLDING the item in its hands (e.g., "the robot holds a coffee cup in its hands", "the robot's hands grasp a steaming coffee cup")
  - The product/robot EXTENDING or OFFERING the item toward the character (e.g., "the robot extends the coffee cup toward the person", "the robot offers the coffee cup with its hands outstretched")
  - The item being VISIBLE in the product's hands BEFORE it transitions to the character
  - Example: ✅ "The robot holds a coffee cup in its hands and extends it toward the person" ❌ "The robot offers coffee" (too vague - doesn't show item in hands)
  - If the story mentions an item being given/offered, the visual prompt MUST show the item in the product's hands, not just mention it abstractly
- **CRITICAL: ONE PRODUCT ONLY**: Each scene must contain ONLY ONE product. Do NOT include multiple products, product variations, or different product models in the same scene. If the product is a robot, there should be only ONE robot. If the product is a bottle, there should be only ONE bottle. Multiple products in a scene will cause visual confusion and inconsistency. Examples to avoid: ❌ "two robots", ❌ "multiple bottles", ❌ "several products". Instead use: ✅ "one robot", ✅ "a single bottle", ✅ "the product".
- **CRITICAL: ONE CHARACTER SPEAKING**: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.
- **🚨🚨🚨 CRITICAL BODY PART CONSISTENCY (MANDATORY)**: Each character must have EXACTLY the correct number of body parts. DO NOT generate duplicate or extra body parts. Each person must have:
  - EXACTLY 2 hands (one left, one right) - NO MORE, NO LESS
  - EXACTLY 2 arms (one left, one right) - NO MORE, NO LESS
  - EXACTLY 2 legs (one left, one right) - NO MORE, NO LESS
  - EXACTLY 1 head - NO MORE, NO LESS
  - DO NOT show 3 hands, 3 arms, or any extra body parts. If a character is holding a product with one hand and applying with the other, show EXACTLY 2 hands total. This is a MANDATORY requirement - any storyboard showing incorrect number of body parts (e.g., 3 hands) will be rejected.

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
  - **🚨🚨🚨 CRITICAL: DIALOGUE REQUIREMENT - MANDATORY FOR ALL SCENES (NO EXCEPTIONS) 🚨🚨🚨**: EVERY scene (hook, body, CTA) MUST include character dialogue in the audioNotes field. NO EXCEPTIONS - dialogue is required for ALL scenes, including product reveals and transitions. No scene should be silent. If the user has not provided dialogue, you MUST generate appropriate dialogue for each scene that matches the story content and scene purpose. Dialogue should: Hook scene - introduce the problem or situation; Body scene(s) - develop the story, show product interaction; CTA scene - conclude with call to action (5 words or less for CTA). If a scene would naturally be silent, add dialogue that fits the context (e.g., character thinking aloud, reacting, or speaking to themselves).
  - Write dialogue explicitly in the 'audioNotes' field using format: "Dialogue: [character] says: '[text]'"
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
        "visualPrompt": "Detailed visual prompt for hook scene following the 5-part formula. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish. End on mini-resolve. 🚨 CRITICAL SKIN QUALITY: ALL characters in the hook/opening frame MUST have PERFECT, FLAWLESS, HEALTHY skin with ZERO imperfections (no blemishes, acne, marks, redness, or any skin defects). This applies to the opening frame - characters must have perfect skin from the very first frame.",
        "audioNotes": "🚨 MANDATORY: This scene MUST include character dialogue. Generate appropriate dialogue that matches the story content and scene purpose. Format: 'Dialogue: [character] says: [text]'. If user provided dialogue, use it. If not, generate dialogue that fits the scene context.",
        "startTime": 0,
        "endTime": 6
      },
      {
        "type": "body",
        "description": "Product introduction + transformation scene - delivers 'oh shit' moment",
        "visualPrompt": "Detailed visual prompt for product intro scene following the 5-part formula. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish. 🚨🚨🚨 CRITICAL: Maintain the EXACT same background, environment, and setting as the hook segment - same room, same location, same background elements. Do NOT change scenes, backgrounds, or environments. The background must remain IDENTICAL throughout. Camera matches momentum from hook. Slow-motion reveal at 4-5s of this clip. CRITICAL: Show continuous motion and active action throughout - character reaching, applying, moving hands, changing expressions. Do NOT show character as still or motionless. ${isMakeupProduct ? 'CRITICAL FOR MAKEUP PRODUCTS: The character must be shown HOLDING the product container and ACTIVELY APPLYING the product FROM the container TO the appropriate body part (face, lips, eyes, etc.). Show the complete application sequence: product in hand → applying to body part → product visible. Do NOT show the product randomly appearing on the character - it must be shown being applied.' : ''}${isSkincareProduct ? 'CRITICAL FOR SKINCARE PRODUCTS: The character must be shown HOLDING the product container (bottle, tube, pump, etc.) and ACTIVELY APPLYING the product FROM the container TO the appropriate skin area (face, cheeks, forehead, etc.). Show the complete application sequence: product container in hand → applying to skin → product visible on skin. Do NOT show the product randomly appearing on the character\'s face/skin from fingers/hands without showing the container first - it must be shown being applied from the container.' : ''} End on mini-resolve.",
        "audioNotes": "🚨 MANDATORY: This scene MUST include character dialogue. Generate appropriate dialogue that matches the story content and scene purpose. Format: 'Dialogue: [character] says: [text]'. If user provided dialogue, use it. If not, generate dialogue that fits the scene context.",
        "startTime": 6,
        "endTime": 12
      },
      {
        "type": "cta",
        "description": "Hero shot + CTA + logo lockup scene - MUST be visually distinct from hook opening (at least 2 of: different camera angle, different pose, or different composition)",
        "visualPrompt": "Detailed visual prompt for CTA scene following the 5-part formula. 🚨🚨🚨 ABSOLUTE REQUIREMENT: Single continuous shot with NO cuts, NO transitions, NO edits, NO scene changes. This must be ONE unbroken shot from start to finish. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline. Ends exactly at 16.000s. CRITICAL: This closing shot must be visually distinct from the opening hook shot - use at least 2 of: different camera angle, different character pose, or different composition while maintaining the same character and setting. IMPORTANT: For beauty/skincare products, prefer terms like 'complexion', 'appearance', 'radiant results', 'visible transformation' over 'skin' in CTA descriptions. Focus on product benefits and results rather than skin appearance changes. 🚨 CRITICAL PRICING REQUIREMENT: If the prompt mentions pricing (e.g., 'Now only $X (was $Y)'), you MUST use ONLY the SALE PRICE ($X) in any pricing displays, text overlays, or descriptions. DO NOT use the original price ($Y) or any calculated price. The sale price is the price that appears after 'Now only' or 'only $'. This is MANDATORY - any pricing display must show the sale price only.",
        "audioNotes": "ONLY include dialogue if explicitly provided by user. If no dialogue is provided, set to empty string (\"\"). Do NOT auto-generate dialogue. 🚨🚨🚨 CRITICAL CTA DIALOGUE WORD LIMIT - ABSOLUTE MANDATORY (ZERO TOLERANCE): If dialogue is provided for the CTA segment, it MUST be EXACTLY 5 words or less. You MUST NEVER generate CTA dialogue with more than 5 words. BEFORE including any dialogue, you MUST: 1) COUNT the words in the dialogue text FIRST (before writing), 2) If it exceeds 5 words, shorten it to 5 words or less BEFORE including it (take only first 5 words), 3) Generate ONLY dialogue that is 5 words or less. Examples of VALID CTA dialogue: 'Buy now to transform.' (5 words), 'Shop now and save.' (4 words), 'Get yours today.' (3 words). Examples of INVALID dialogue you MUST NOT generate: ❌ 'Purchase now to enjoy 60% off.' (6 words - FORBIDDEN - DO NOT GENERATE), ❌ 'Purchase now to transform your skin.' (7 words - FORBIDDEN - DO NOT GENERATE), ❌ 'Buy now to transform your skin overnight!' (8 words - FORBIDDEN - DO NOT GENERATE). This is a MANDATORY requirement - any CTA dialogue exceeding 5 words will cause the storyboard to be REJECTED and regenerated. COUNT WORDS BEFORE WRITING, NOT AFTER. IMPORTANT: For CTA dialogue, if the user provides dialogue mentioning 'skin', prefer alternatives like 'complexion', 'appearance', or 'results' to avoid content moderation filters.",
        "startTime": 12,
        "endTime": 16
      }
    ]
  }
}`

    // Support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
    const bodyContent = story.body || story.bodyOne || ''
    const bodyTwoContent = story.bodyTwo || ''
    
    // Detect if product is makeup/cosmetics
    const isMakeupProduct = (() => {
      const storyText = `${story.description} ${story.hook} ${bodyContent} ${story.callToAction} ${prompt}`.toLowerCase()
      const makeupKeywords = ['makeup', 'cosmetic', 'lipstick', 'foundation', 'concealer', 'mascara', 'eyeliner', 'blush', 'bronzer', 'highlighter', 'eyeshadow', 'lip gloss', 'lip balm', 'make-up', 'beauty product', 'beauty item']
      return makeupKeywords.some(keyword => storyText.includes(keyword))
    })()
    
    // Detect if product is skincare
    const isSkincareProduct = (() => {
      const storyText = `${story.description} ${story.hook} ${bodyContent} ${story.callToAction} ${prompt}`.toLowerCase()
      const skincareKeywords = ['skincare', 'serum', 'acne', 'treatment', 'moisturizer', 'cleanser', 'toner', 'essence', 'cream', 'lotion', 'skincare product', 'beauty serum', 'acne treatment', 'skin care', 'face serum', 'skin serum', 'anti-aging', 'anti aging', 'wrinkle', 'dark spot', 'spot treatment']
      return skincareKeywords.some(keyword => storyText.includes(keyword))
    })()
    
    // Add makeup-specific instructions if detected
    const makeupInstructions = isMakeupProduct ? `
🚨🚨🚨 CRITICAL: MAKEUP/COSMETICS PRODUCT HOLDING REQUIREMENTS 🚨🚨🚨
For makeup/cosmetics products, the visualPrompt MUST explicitly describe the character holding the product and talking about it:
1. **Product Container Visible**: The character must be shown HOLDING the product container (bottle, tube, palette, compact, applicator, etc.) in their hand(s) - the container must be clearly visible
2. **NO APPLICATION**: The character must NEVER apply the product to their face, eyes, lips, or any body part. NO application motion, NO product on skin/face, NO using the product.
3. **Holding and Talking**: The character must hold the product container clearly visible in hand(s) and talk about the product. The visualPrompt MUST describe the character holding the product and discussing it.
4. **Body Segment Focus**: In the body segment (Product Intro), the visualPrompt MUST include explicit holding and discussion instructions like:
   - "The character holds [product name] in hand and talks about its benefits"
   - "The character holds [product name] and discusses how it works"
   - "The character holds [product name] container, clearly visible, and talks about the product"
5. **Product Details**: The character can gesture with the product, point to it, or show it to the camera while talking, but must NEVER apply it.
Example for foundation: ✅ "The character holds a foundation bottle in hand, clearly visible, and talks about how it provides coverage and benefits" ❌ "The character applies foundation to face" (FORBIDDEN - no application)
Example for lipstick: ✅ "The character holds a lipstick tube, clearly visible, and talks about the color and formula" ❌ "The character applies lipstick to lips" (FORBIDDEN - no application)
` : ''
    
    // Add skincare-specific instructions if detected
    const skincareInstructions = isSkincareProduct ? `
🚨🚨🚨 CRITICAL: SKINCARE PRODUCT HOLDING REQUIREMENTS 🚨🚨🚨
For skincare products (serum, acne treatment, moisturizer, cream, etc.), the visualPrompt MUST explicitly describe the character holding the product and talking about it:
1. **Product Container Visible**: The character must be shown HOLDING the product container (bottle, tube, pump, jar, dropper, etc.) in their hand(s) - the container must be clearly visible
2. **NO APPLICATION**: The character must NEVER apply the product to their face, skin, or any body part. NO application motion, NO product on skin/face, NO using the product.
3. **Holding and Talking**: The character must hold the product container clearly visible in hand(s) and talk about the product. The visualPrompt MUST describe the character holding the product and discussing it.
4. **Body Segment Focus**: In the body segment (Product Intro), the visualPrompt MUST include explicit holding and discussion instructions like:
   - "The character holds [product name] in hand and talks about its benefits"
   - "The character holds [product name] and discusses how it works"
   - "The character holds [product name] container, clearly visible, and talks about the product"
5. **Product Details**: The character can gesture with the product, point to it, or show it to the camera while talking, but must NEVER apply it.
6. **🚨🚨🚨 NO DROPPER WATER DROPLETS - ABSOLUTE MANDATORY REQUIREMENT**: DO NOT show water droplets coming out of droppers, dropper tips with liquid drops, or liquid being dispensed from droppers. When showing dropper bottles, the dropper should be shown in the container or being held, but DO NOT show any visible water droplets, liquid drops, or liquid being dispensed from the dropper tip. The dropper should appear dry and without any visible liquid drops. This is a MANDATORY requirement - any visualPrompt describing water droplets from droppers will be REJECTED.
7. **🚨 NO PRODUCT ON SKIN**: The product must NEVER appear on the character's skin, face, or any body part. The skin should always appear clean and natural. NO visible product on skin, NO application residue, NO product visible on face/body.
Example for serum: ✅ "The character holds a serum bottle in hand, clearly visible, and talks about how it improves skin texture and benefits" ❌ "The character applies serum to face" (FORBIDDEN - no application)
Example for acne treatment: ✅ "The character holds an acne treatment tube, clearly visible, and talks about how it targets blemishes" ❌ "The character applies treatment to face" (FORBIDDEN - no application)
` : ''
    
    const userPrompt = `Create an emotionally captivating storyboard based on this story:

Story Description: ${story.description}
Hook: ${story.hook}
Body: ${bodyContent}${bodyTwoContent ? `\n(Note: Legacy format detected. Body 2 content: ${bodyTwoContent} - incorporate into CTA if needed)` : ''}
CTA: ${story.callToAction}

Original Prompt: ${prompt}
Ad Type: ${selectedAdType}
${productImages.length > 0 ? `Product images are available for reference.` : ''}
${makeupInstructions}
${skincareInstructions}

🚨 CRITICAL PRICING REQUIREMENT: If the Original Prompt mentions pricing (e.g., "Now only $X (was $Y)" or "only $X"), you MUST use ONLY the SALE PRICE ($X) in any pricing displays, text overlays, or descriptions in the CTA segment. The sale price is the price that appears after "Now only" or "only $". DO NOT use the original price ($Y) or any calculated price. When displaying pricing in the CTA segment's visualPrompt or description, use ONLY the sale price. This is MANDATORY - any pricing display must show the sale price only.

🚨🚨🚨 CRITICAL CTA DIALOGUE WORD LIMIT REQUIREMENT - ABSOLUTE MANDATORY (ZERO TOLERANCE) 🚨🚨🚨
For the CTA segment, any dialogue in the audioNotes field MUST be EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE. You MUST NEVER generate CTA dialogue with more than 5 words. 

BEFORE including dialogue in the CTA segment, you MUST:
1. FIRST, count the words in your intended dialogue text BEFORE writing it - count each word carefully
2. If your intended dialogue exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it - take only the first 5 words
3. Generate ONLY dialogue that is 5 words or less - do NOT generate dialogue and then truncate it
4. Examples of VALID CTA dialogue: ✅ "Buy now to transform." (5 words), ✅ "Shop now and save." (4 words), ✅ "Get yours today." (3 words)
5. Examples of INVALID dialogue you MUST NOT generate: 
   ❌ "Purchase now to enjoy 60% off." (6 words - FORBIDDEN - DO NOT GENERATE)
   ❌ "Purchase now to transform your skin." (7 words - FORBIDDEN - DO NOT GENERATE)
   ❌ "Buy now to transform your skin overnight!" (8 words - FORBIDDEN - DO NOT GENERATE)
   ❌ "Shop now and save big today!" (6 words - FORBIDDEN - DO NOT GENERATE)
6. CRITICAL: If the user provides dialogue that exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it. Take only the first 5 words. Do NOT include the original long dialogue.
7. COUNT WORDS BEFORE WRITING: Always count words BEFORE you write the dialogue in audioNotes. Do not write dialogue first and then count - count first, then write only if it's 5 words or less.

This requirement applies to ALL CTA segments. Any dialogue exceeding 5 words will cause the storyboard to be REJECTED and the entire response will be regenerated. You MUST count words BEFORE generating dialogue, not after. If you generate dialogue with more than 5 words, the ENTIRE storyboard will be rejected.

🚨 CHARACTER CONSISTENCY REQUIREMENT:
- Extract all characters from the hook scene and ensure they maintain IDENTICAL appearance (gender, age, physical features, clothing) across all segments
- In the hook segment: Include explicit character descriptions (e.g., "a woman in her mid-20s with [hair color] hair, [build], wearing [clothing]")
- In body and CTA segments: Reference characters as "the same [age] [gender] person with [features]" to maintain consistency
- Do NOT change character gender, age, or physical appearance between scenes
- DO NOT use "teenage", "teen", or "late teens" - use specific age ranges like "mid-20s", "early 30s", "young adult", etc.
- **VOICE CONSISTENCY:** Extract voice characteristics from the hook scene audioNotes and use the EXACT SAME voice description for each character in all subsequent scenes where they speak

Stay true to the story content. Focus on creating emotionally compelling visuals that evoke emotions through facial expressions, body language, and visual mood. Limit all scenes to 3-4 people maximum and ensure clear, sharp faces through close-ups and medium shots.

🚨 REMEMBER: This is a 16-second format with 3 segments (6s + 6s + 4s). Each segment must be a single continuous shot with zero cuts. Match camera momentum between segments. End each clip on a mini-resolve. The CTA segment must end exactly at 16.000s.`

    // Retry logic for CTA dialogue validation
    const maxRetries = 3
    let attempt = 0
    let segments: Segment[] = []
    let lastError: Error | null = null
    
    while (attempt < maxRetries) {
      attempt++
      try {
        // Add rejection feedback if this is a retry
        let currentUserPrompt = userPrompt
        if (attempt > 1 && lastError) {
          const errorMessage = lastError.message
          const dialogueMatch = errorMessage.match(/"(.+?)" \((\d+) words\)/)
          if (dialogueMatch) {
            const failedDialogue = dialogueMatch[1]
            const wordCount = dialogueMatch[2]
            currentUserPrompt = `${userPrompt}

🚨🚨🚨 REGENERATION REQUEST - PREVIOUS ATTEMPT REJECTED 🚨🚨🚨
Your previous CTA dialogue was REJECTED because it exceeded the 5-word limit.
- Previous CTA dialogue: "${failedDialogue}" (${wordCount} words)
- Required: EXACTLY 5 words or less (ZERO TOLERANCE)
- You MUST count the words before submitting. The word count MUST be 5 or fewer.
- CRITICAL: Count each word individually. Contractions count as one word (e.g., "don't" = 1 word, "you're" = 1 word).
- Examples of VALID CTA dialogue:
  ✅ "Buy now to transform." (5 words)
  ✅ "Shop now and save." (4 words)
  ✅ "Get yours today." (3 words)
  ✅ "Purchase now to save." (4 words)
- Examples of INVALID dialogue that must be fixed:
  ❌ "${failedDialogue}" (${wordCount} words - TOO LONG - DO NOT GENERATE THIS AGAIN)
  ❌ "Purchase now to enjoy 60% off." (6 words - TOO LONG)
  ❌ "Buy now to transform your skin." (7 words - TOO LONG)
- If the original dialogue exceeds 5 words, you MUST shorten it to the first 5 words only.
- Generate a NEW dialogue that is EXACTLY 5 words or less. COUNT YOUR WORDS CAREFULLY before submitting.
- This is attempt ${attempt} of ${maxRetries}. The storyboard will be rejected if CTA dialogue exceeds 5 words.`
          }
        }

        // Use OpenAI chat completion via MCP
        const storyboardsData = await callOpenAIMCP('chat_completion', {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: currentUserPrompt },
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
        segments = (sbData.segments || []).map((seg: any) => {
      // Validate audioNotes: ensure dialogue exists (mandatory for all scenes)
      let audioNotes = seg.audioNotes || ''
      // Check if audioNotes is a placeholder/instruction rather than actual dialogue
      const placeholderPatterns = [
        /^(Spoken dialogue|dialogue|voiceover|script|audio|notes|ONLY include|Do NOT auto-generate|MANDATORY|🚨)/i,
        /^(Spoken dialogue or voiceover script for this scene)$/i,
        /^(ONLY include dialogue if explicitly provided)/i,
      ]
      if (placeholderPatterns.some(pattern => pattern.test(audioNotes.trim()))) {
        audioNotes = ''
      }
      
      // Validate that dialogue exists (mandatory for all scenes)
      const hasDialogue = audioNotes && (
        /Dialogue:\s*[^:]+?\s+says:\s*['"]/i.test(audioNotes) ||
        /Voiceover:/i.test(audioNotes)
      )
      
      if (!hasDialogue) {
        console.warn(`[Generate Storyboards] ⚠️ Missing dialogue in ${seg.type} segment - this violates mandatory dialogue requirement`)
      }
      
      // Validate CTA dialogue word count - do not truncate, will retry if invalid
      if (seg.type === 'cta' && audioNotes) {
        const dialogueMatch = audioNotes.match(/Dialogue:\s*[^:]+?\s+says:\s*['"](.+?)['"]/i)
        if (dialogueMatch) {
          const dialogueText = dialogueMatch[1].trim()
          const wordCount = dialogueText.split(/\s+/).filter(word => word.length > 0).length
          
          if (wordCount > 5) {
            console.warn(`[Generate Storyboards] ⚠️ CTA dialogue has ${wordCount} words (exceeds 5-word limit): "${dialogueText}"`)
            // Don't truncate - will trigger retry with stronger instructions
            throw new Error(`CTA dialogue exceeds 5-word limit: "${dialogueText}" (${wordCount} words). The AI model should never generate CTA dialogue exceeding 5 words.`)
          }
        }
      }
      
      return {
        type: seg.type as 'hook' | 'body' | 'cta',
        description: seg.description || '',
        startTime: seg.startTime || 0,
        endTime: seg.endTime || 6,
        visualPrompt: seg.visualPrompt || '',
        visualPromptAlternatives: seg.visualPromptAlternatives || [],
        audioNotes,
        status: 'pending' as const,
      }
        })
        
        // Validate that all segments have dialogue (mandatory requirement)
        const allSegmentsHaveDialogue = segments.every((seg: any) => {
          const audioNotes = seg.audioNotes || ''
          return audioNotes && (
            /Dialogue:\s*[^:]+?\s+says:\s*['"]/i.test(audioNotes) ||
            /Voiceover:/i.test(audioNotes)
          )
        })
        
        if (!allSegmentsHaveDialogue) {
          const missingSegments = segments
            .map((seg: any, idx: number) => {
              const audioNotes = seg.audioNotes || ''
              const hasDialogue = audioNotes && (
                /Dialogue:\s*[^:]+?\s+says:\s*['"]/i.test(audioNotes) ||
                /Voiceover:/i.test(audioNotes)
              )
              return hasDialogue ? null : `${seg.type} (segment ${idx})`
            })
            .filter(Boolean)
          
          console.warn(`[Generate Storyboards] ⚠️ Missing dialogue in segments: ${missingSegments.join(', ')} - this violates mandatory dialogue requirement`)
          if (attempt < maxRetries) {
            console.warn(`[Generate Storyboards] Will retry to ensure all segments have dialogue (attempt ${attempt + 1}/${maxRetries})`)
            throw new Error(`Missing dialogue in segments: ${missingSegments.join(', ')}. All scenes must have dialogue.`)
          } else {
            console.error(`[Generate Storyboards] ✗ All ${maxRetries} attempts failed. Missing dialogue in segments: ${missingSegments.join(', ')}`)
            throw new Error(`Failed to generate storyboard with dialogue in all segments after ${maxRetries} attempts. Missing dialogue in: ${missingSegments.join(', ')}`)
          }
        }
        
        // If we get here, validation passed
        console.log(`[Generate Storyboards] ✓ CTA dialogue validation passed on attempt ${attempt}`)
        console.log(`[Generate Storyboards] ✓ All segments have dialogue (mandatory requirement satisfied)`)
        break // Exit retry loop
      } catch (error: any) {
        lastError = error
        if (error.message && error.message.includes('CTA dialogue exceeds 5-word limit')) {
          console.warn(`[Generate Storyboards] ✗ Attempt ${attempt} failed: ${error.message}`)
          if (attempt < maxRetries) {
            console.log(`[Generate Storyboards] Retrying with stronger instructions (attempt ${attempt + 1}/${maxRetries})...`)
            continue // Retry with stronger instructions
          } else {
            console.error(`[Generate Storyboards] ✗ All ${maxRetries} attempts failed. CTA dialogue validation failed.`)
            throw new Error(`Failed to generate storyboard with valid CTA dialogue after ${maxRetries} attempts. Last error: ${error.message}`)
          }
        } else {
          // Non-validation error, don't retry
          throw error
        }
      }
    }

    // Ensure we have exactly 3 segments for 16-second format
    if (segments.length !== 3) {
      // Fill in missing segments from story - support both new format (body) and old format (bodyOne/bodyTwo)
      const bodyContent = story.body || story.bodyOne || ''
      const ctaContent = story.body ? story.callToAction : `${story.bodyTwo || ''} ${story.callToAction}`.trim()
      const bodyDescription = story.body || story.bodyOne || ''
      
      const baseSegments: Segment[] = [
        { type: 'hook', description: story.hook, startTime: 0, endTime: 6, visualPrompt: `${story.hook}, professional ad quality, single continuous shot, no cuts`, status: 'pending', audioNotes: '' },
        { type: 'body', description: bodyDescription, startTime: 6, endTime: 12, visualPrompt: `${bodyContent}, professional ad quality, single continuous shot, no cuts, slow-motion reveal at 4-5s`, status: 'pending', audioNotes: '' },
        { type: 'cta', description: ctaContent, startTime: 12, endTime: 16, visualPrompt: `${ctaContent}, professional ad quality, single continuous shot, no cuts, ends at exactly 16.000s`, status: 'pending', audioNotes: '' },
      ]
      segments.splice(0, segments.length, ...baseSegments)
    }

    // Extract characters from the story
    const hookSegment = segments.find(s => s.type === 'hook')
    const characters = await extractCharacters(story.description, hookSegment?.description || story.hook)

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
        
        // Add character visibility requirement for all segments (especially CTA)
        if (!segment.visualPrompt.includes('CHARACTER VISIBILITY') && !segment.visualPrompt.includes('character must be visible')) {
          const visibilityInstruction = `🚨🚨🚨 CRITICAL CHARACTER VISIBILITY - MANDATORY REQUIREMENT: The main character MUST be VISIBLE in this frame at all times. Even when showing products, text overlays, or logo lockups, the character must remain visible in the frame. The character can be in the background, side, foreground, or any position, but MUST be present and visible. DO NOT create frames that show only the product without the character visible. This is a MANDATORY requirement - the character must appear in EVERY frame. `
          segment.visualPrompt = `${visibilityInstruction}${segment.visualPrompt}`
        }
        
        // Add product visibility requirement for all segments when product is part of the story
        const hasProductInStory = productImages.length > 0 || 
          /product|bottle|container|item|package|tube|jar|pump|dropper|serum|cream|moisturizer|makeup|cosmetic|lipstick|foundation/i.test(`${story.description} ${story.hook} ${bodyContent} ${story.callToAction} ${prompt} ${segment.visualPrompt}`)
        
        if (hasProductInStory && !segment.visualPrompt.includes('PRODUCT VISIBILITY') && !segment.visualPrompt.includes('product must be visible')) {
          const productVisibilityInstruction = `🚨🚨🚨 CRITICAL PRODUCT VISIBILITY - MANDATORY REQUIREMENT: The product MUST be VISIBLE in this frame at all times. Even when focusing on the character, showing character close-ups, text overlays, logo lockups, or character actions, the product must remain visible in the frame. The product can be in the character's hands, on a surface, in the background, foreground, or any position, but MUST be present and visible. DO NOT create frames that show only the character without the product visible. This is a MANDATORY requirement - the product must appear in EVERY frame. Both the character AND the product must be visible together in the same frame. `
          segment.visualPrompt = `${productVisibilityInstruction}${segment.visualPrompt}`
        }
        
        // Add character speaking requirement for CTA if dialogue is provided
        if (segment.type === 'cta' && segment.audioNotes && segment.audioNotes.includes('Dialogue:')) {
          const dialogueMatch = segment.audioNotes.match(/Dialogue:\s*([^:]+?)\s+says:\s*['"](.+?)['"]/i)
          if (dialogueMatch) {
            const character = dialogueMatch[1].trim()
            const dialogueText = dialogueMatch[2].trim()
            if (!segment.visualPrompt.includes('speaks:') && !segment.visualPrompt.includes('speaking')) {
              const speakingInstruction = `🚨🚨🚨 CRITICAL CHARACTER SPEAKING REQUIREMENT: The character (${character}) MUST be shown SPEAKING on-camera in this CTA segment. Add explicit timecodes: "[00:00-00:04] The ${character} speaks: '${dialogueText}', mouth moving, speaking gesture visible". Describe the character's speaking action: "speaking to camera", "saying '${dialogueText}'", "mouth moving as ${character.toLowerCase()} speaks". Ensure the character is shown actively speaking on-camera, not just reacting or thinking. The character MUST be visible AND speaking in this frame. `
              segment.visualPrompt = `${speakingInstruction}${segment.visualPrompt}`
            }
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
        seamlessTransition, // Seamless transition toggle (default: true)
      },
      promptJourney: {
        userInput: {
          prompt,
          adType: selectedAdType,
          mood: selectedMood,
          aspectRatio,
          model: model || 'google/veo-3.1-fast',
          productImages: [],
          subjectReference: undefined,
        },
        storyGeneration: story ? {
          systemPrompt: 'Story generation handled by MCP server',
          userPrompt: prompt,
          output: {
            hook: story.hook,
            body: story.body || story.bodyOne || '',
            bodyOne: story.bodyOne || '', // Keep for backward compatibility
            bodyTwo: story.bodyTwo || '', // Keep for backward compatibility
            callToAction: story.callToAction,
            description: story.description,
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

    return {
      storyboard,
    }
  } catch (error: any) {
    console.error('[Generate Storyboards] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate storyboards',
    })
  }
})
