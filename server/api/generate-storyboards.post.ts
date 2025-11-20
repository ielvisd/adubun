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
    bodyOne: z.string(),
    bodyTwo: z.string(),
    callToAction: z.string(),
  }),
  prompt: z.string(),
  productImages: z.array(z.string()).optional(),
  aspectRatio: z.enum(['16:9', '9:16']),
  model: z.string().optional(),
  mood: z.string().optional(), // Video tone/mood from homepage
  adType: z.string().optional(), // Ad Type from homepage
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { story, prompt, productImages = [], aspectRatio, model, mood, adType } = generateStoryboardsSchema.parse(body)

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
- Focus on the product being used in real-life situations
- Emphasize human interaction, social context, and environmental details
- Show the benefits and emotional payoff of using the product
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
- Camera Angle: Top-down overhead view (bird's eye) OR slightly angled view showing hands and product clearly
- Setting: Clean, minimal surface (white marble table, wood desk, or neutral backdrop)
- Lighting: Soft, even lighting from above and sides to eliminate harsh shadows
- Structure the narrative as a reveal process:
  1. Hook: Sealed box/packaging centered on clean surface (anticipation)
     - Show FULL box in frame, unopened, centered
     - Include branding, logos, and any seals visible
     - Hands may be positioned near but not touching yet
  
  2. Body 1: Hands opening the package (action)
     - Show hands carefully lifting lid or unwrapping outer packaging
     - Capture the moment of breaking seals, lifting flaps
     - Focus on the tactile interaction with packaging materials
     - Show any tissue paper, foam, or protective layers being removed
  
  3. Body 2: Hands holding and beginning to ROTATE the product (satisfaction)
     - Show hands lifting product out of box and holding it firmly
     - Hands must be VISIBLE throughout, gently gripping the product
     - Begin a SMOOTH ROTATION motion to show different angles
     - Product should be clearly visible, centered in frame
     - Show the product starting to turn: front view transitioning to side view
     - If multiple reference images provided, the rotation reveals those different angles:
       * Start with front view, begin rotating toward side view
       * Smooth, continuous motion - not static poses
     - Capture the "wow" moment as product begins rotating to reveal all sides
  
  4. CTA: Hands smoothly rotating product to show ALL ANGLES - 360° turn (completeness)
     - Hands continue the SMOOTH CONTINUOUS ROTATION of the product
     - Product rotates from side view → back view → full circle back to front
     - Hands remain steady and VISIBLE throughout the entire rotation
     - Showcase the product from all angles in one continuous motion
     - If multiple reference images provided, show each angle during rotation:
       * Front features, side profile, back details - all visible as product turns
     - The rotation should feel fluid and natural, completing a full 360° showcase
     
- Visual Requirements:
  * Hands should be well-manicured, neutral skin tone unless specified
  * Hands must be VISIBLE throughout Body 2 and CTA scenes
  * Same hands throughout (consistent skin tone, manicured nails)
  * Movements should be slow, deliberate, and graceful
  * Smooth, continuous rotation motion - not static poses
  * Keep composition clean and uncluttered
  * Maintain consistent camera angle throughout (no jarring changes)
  * Product should always be in focus and clearly visible
  * Show packaging details: textures, materials, premium finishes
  
- MULTIPLE PRODUCT ANGLES (if user provides multiple reference images):
  * Body 2: Hands holding product, beginning smooth rotation to reveal angles
  * CTA: Hands completing 360° rotation showing all angles continuously
  * Each angle should match one of the reference images during rotation
  * Rotation should be fluid and natural - one continuous motion
  
- CRITICAL: Each scene must clearly show the SAME product throughout
- Maintain spatial consistency: if box is on left in Hook, keep it on left in Body 1`
        break
      case 'testimonial':
        adTypeInstruction = `TESTIMONIAL AD STRATEGY:
- Visual style should feel authentic and user-generated (UGC)
- Use "selfie-style" angles or intimate interview setups
- Focus on facial expressions of satisfaction and trust
- Show the user interacting with the product naturally`
        break
      case 'tutorial':
        adTypeInstruction = `TUTORIAL AD STRATEGY:
- Structure as a clear step-by-step guide:
  1. Hook: The problem or the "before" state
  2. Body 1: Step 1 of using the product (clear action)
  3. Body 2: Step 2/Result of using the product
  4. CTA: The final result/benefit achieved
- Visuals must be instructional and clear (no distracting elements)`
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
    
${adTypeInstruction}

Generate a single storyboard for a 16-second ad. The storyboard must have 4 scenes:
1. Hook (0-4s): Opening scene that grabs attention and creates emotional connection
2. Body 1 (4-8s): First key message or benefit with emotional impact
3. Body 2 (8-12s): Second key message or benefit with emotional impact
4. CTA (12-16s): Call to action with emotional payoff

🚨 VEO 3.1 PROMPTING FORMULA:
For the 'visualPrompt' field, you MUST use this specific 5-part structure for EVERY scene:
[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]

Definitions:
- Cinematography: Camera work, shot composition, movement (e.g., "Wide shot, slow pan", "Close-up with shallow depth of field")
- Subject: Main character or focal point (e.g., "a young woman", "a sleek product bottle")
- Action: What the subject is doing (e.g., "walking briskly", "catching the light")
- Context: Environment and background (e.g., "in a busy city street", "on a wooden table")
- Style & Ambiance: Aesthetic, mood, lighting (e.g., "cinematic lighting", "warm golden hour glow")

🚨 TIMECODE & AUDIO REQUIREMENTS:
- Veo 3.1 supports native audio generation. You MUST include audio cues within the visualPrompt if applicable.
- Add timecodes for specific actions if needed: "[00:00-00:02] The woman smiles. [00:02-00:04] She turns to the camera."
- For DIALOGUE:
  - If a character speaks, write it explicitly: 'The man says: "Hello, world."'
  - Use ellipses (...) for natural pauses.
  - Include audio actions: "(laughs)", "(sighs)", "(claps)".
- Audio inputs are strictly ignored by the video model, so all audio intent must be in the prompt text.

🚨 CRITICAL CHARACTER CONSISTENCY REQUIREMENTS:
- Extract ALL characters mentioned in the hook scene and maintain their EXACT appearance across ALL segments
- For each character, identify: gender (male/female/non-binary), age (teenage/elderly/young adult/etc.), physical features (hair color/style, build, distinctive features), and clothing style
- In the hook segment visualPrompt: Include explicit character descriptions with gender, age, and physical features
- In body and CTA segment visualPrompts: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance" to maintain consistency
- CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
- Do NOT change character gender, age, or physical appearance between scenes
- Reference characters consistently: "the same character from the hook scene" or "the identical [age] [gender] person"

The storyboard should:
- Follow the specific strategy for ${selectedAdType} ads
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
        "description": "Hook scene description",
        "visualPrompt": "Detailed visual prompt for hook scene following the 5-part formula",
        "startTime": 0,
        "endTime": 4
      },
      {
        "type": "body",
        "description": "Body 1 scene description",
        "visualPrompt": "Detailed visual prompt for body 1 scene following the 5-part formula",
        "startTime": 4,
        "endTime": 8
      },
      {
        "type": "body",
        "description": "Body 2 scene description",
        "visualPrompt": "Detailed visual prompt for body 2 scene following the 5-part formula",
        "startTime": 8,
        "endTime": 12
      },
      {
        "type": "cta",
        "description": "CTA scene description",
        "visualPrompt": "Detailed visual prompt for CTA scene following the 5-part formula",
        "startTime": 12,
        "endTime": 16
      }
    ]
  }
}`

    const userPrompt = `Create an emotionally captivating storyboard based on this story:

Story Description: ${story.description}
Hook: ${story.hook}
Body 1: ${story.bodyOne}
Body 2: ${story.bodyTwo}
CTA: ${story.callToAction}

Original Prompt: ${prompt}
Ad Type: ${selectedAdType}
${productImages.length > 0 ? `Product images are available for reference.` : ''}

🚨 CHARACTER CONSISTENCY REQUIREMENT:
- Extract all characters from the hook scene and ensure they maintain IDENTICAL appearance (gender, age, physical features, clothing) across all segments
- In the hook segment: Include explicit character descriptions (e.g., "a teenage [gender] with [hair color] hair, [build], wearing [clothing]")
- In body and CTA segments: Reference characters as "the same [age] [gender] person with [features]" to maintain consistency
- Do NOT change character gender, age, or physical appearance between scenes

Stay true to the story content. Focus on creating emotionally compelling visuals that evoke emotions through facial expressions, body language, and visual mood. Limit all scenes to 3-4 people maximum and ensure clear, sharp faces through close-ups and medium shots.`

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
      endTime: seg.endTime || 4,
      visualPrompt: seg.visualPrompt || '',
      visualPromptAlternatives: seg.visualPromptAlternatives || [],
      status: 'pending' as const,
    }))

    // Ensure we have exactly 4 segments
    if (segments.length !== 4) {
      // Fill in missing segments from story
      const baseSegments: Segment[] = [
        { type: 'hook', description: story.hook, startTime: 0, endTime: 4, visualPrompt: `${story.hook}, professional ad quality`, status: 'pending' },
        { type: 'body', description: story.bodyOne, startTime: 4, endTime: 8, visualPrompt: `${story.bodyOne}, professional ad quality`, status: 'pending' },
        { type: 'body', description: story.bodyTwo, startTime: 8, endTime: 12, visualPrompt: `${story.bodyTwo}, professional ad quality`, status: 'pending' },
        { type: 'cta', description: story.callToAction, startTime: 12, endTime: 16, visualPrompt: `${story.callToAction}, professional ad quality`, status: 'pending' },
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
      })
    }

    const storyboard: Storyboard = {
      id: sbData.id || nanoid(),
      segments,
      characters: characters.length > 0 ? characters : undefined,
      meta: {
        duration: 16,
        aspectRatio,
        model: model || 'google/veo-3-fast',
        adType: selectedAdType,
      },
      promptJourney: {
        userInput: {
          prompt,
          adType: selectedAdType,
          mood: selectedMood,
          aspectRatio,
          model: model || 'google/veo-3-fast',
          productImages: [],
          subjectReference: undefined,
        },
        storyGeneration: story ? {
          systemPrompt: 'Story generation handled by MCP server',
          userPrompt: prompt,
          output: {
            hook: story.hook,
            bodyOne: story.bodyOne,
            bodyTwo: story.bodyTwo,
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
