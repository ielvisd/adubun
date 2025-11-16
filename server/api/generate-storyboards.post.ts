import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { nanoid } from 'nanoid'
import { saveStoryboard } from '../utils/storage'
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
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  model: z.string().optional(),
  style: z.string().optional(), // Optional style parameter
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { story, prompt, productImages = [], aspectRatio, model, style } = generateStoryboardsSchema.parse(body)

    // Track cost
    await trackCost('generate-storyboards', 0.002, { storyId: story.id })

    // Generate 1 storyboard using OpenAI directly
    // Use chat completion to generate a single storyboard
    const selectedStyle = style || 'Cinematic'
    const systemPrompt = `You are an expert at creating video storyboards for ad content.

Generate a single storyboard for a 16-second ad with ${selectedStyle} visual style. The storyboard must have 4 scenes:
1. Hook (0-4s): Opening scene that grabs attention
2. Body 1 (4-8s): First key message or benefit
3. Body 2 (8-12s): Second key message or benefit
4. CTA (12-16s): Call to action

The storyboard should:
- Have a ${selectedStyle} visual style
- Include detailed visual prompts for each scene
- Match the story content provided
- Be suitable for ${aspectRatio} aspect ratio

Return ONLY valid JSON with this structure:
{
  "storyboard": {
    "id": "storyboard-1",
    "style": "${selectedStyle}",
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

    const userPrompt = `Create a ${selectedStyle} style storyboard based on this story:

Story Description: ${story.description}
Hook: ${story.hook}
Body 1: ${story.bodyOne}
Body 2: ${story.bodyTwo}
CTA: ${story.callToAction}

Original Prompt: ${prompt}
${productImages.length > 0 ? `Product images are available for reference.` : ''}

The storyboard should have a ${selectedStyle} visual style and approach while staying true to the story content.`

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

    const storyboard: Storyboard = {
      id: sbData.id || nanoid(),
      segments,
      meta: {
        duration: 16,
        aspectRatio,
        style: sbData.style || selectedStyle,
        model: model || 'google/veo-3-fast',
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

