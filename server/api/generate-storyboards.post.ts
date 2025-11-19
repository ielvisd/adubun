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
- CRITICAL: The product MUST be the main focus in 100% of frames
- Use macro shots, close-ups, and slow pans to show details
- Minimal or blurred backgrounds (bokeh) to keep attention on the product
- Highlight craftsmanship, texture, and quality`
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
      default:
        adTypeInstruction = `Create a professional, high-quality ad that showcases the product effectively.`
    }

    const systemPrompt = `You are an expert at creating emotionally captivating video storyboards for ad content.
    
${adTypeInstruction}

Generate a single storyboard for a 16-second ad with ${selectedMood} tone and visual style. The storyboard must have 4 scenes:
1. Hook (0-4s): Opening scene that grabs attention and creates emotional connection
2. Body 1 (4-8s): First key message or benefit with emotional impact
3. Body 2 (8-12s): Second key message or benefit with emotional impact
4. CTA (12-16s): Call to action with emotional payoff

🚨 CRITICAL CHARACTER CONSISTENCY REQUIREMENTS:
- Extract ALL characters mentioned in the hook scene and maintain their EXACT appearance across ALL segments
- For each character, identify: gender (male/female/non-binary), age (teenage/elderly/young adult/etc.), physical features (hair color/style, build, distinctive features), and clothing style
- In the hook segment visualPrompt: Include explicit character descriptions with gender, age, and physical features
- In body and CTA segment visualPrompts: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance" to maintain consistency
- CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
- Do NOT change character gender, age, or physical appearance between scenes
- Reference characters consistently: "the same character from the hook scene" or "the identical [age] [gender] person"

The storyboard should:
- Have a ${selectedMood} tone and visual style
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
      "mood": "${selectedMood}",
    "segments": [
      {
        "type": "hook",
        "description": "Hook scene description",
        "visualPrompt": "Detailed visual prompt for hook scene",
        "startTime": 0,
        "endTime": 4
      },
      {
        "type": "body",
        "description": "Body 1 scene description",
        "visualPrompt": "Detailed visual prompt for body 1 scene",
        "startTime": 4,
        "endTime": 8
      },
      {
        "type": "body",
        "description": "Body 2 scene description",
        "visualPrompt": "Detailed visual prompt for body 2 scene",
        "startTime": 8,
        "endTime": 12
      },
      {
        "type": "cta",
        "description": "CTA scene description",
        "visualPrompt": "Detailed visual prompt for CTA scene",
        "startTime": 12,
        "endTime": 16
      }
    ]
  }
}`

    const userPrompt = `Create an emotionally captivating ${selectedMood} tone storyboard based on this story:

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

The storyboard should have a ${selectedMood} tone and visual style while staying true to the story content. Focus on creating emotionally compelling visuals that evoke emotions through facial expressions, body language, and visual mood. Limit all scenes to 3-4 people maximum and ensure clear, sharp faces through close-ups and medium shots.`

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
        mood: sbData.mood || selectedMood,
        model: model || 'google/veo-3-fast',
        adType: selectedAdType,
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
