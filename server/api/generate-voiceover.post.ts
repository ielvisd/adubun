import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import type { Storyboard } from '~/types/generation'

const generateVoiceoverSchema = z.object({
  storyboard: z.object({
    segments: z.array(z.object({
      type: z.enum(['hook', 'body', 'cta']),
      description: z.string(),
      visualPrompt: z.string(),
    })),
  }),
  story: z.object({
    hook: z.string(),
    bodyOne: z.string(),
    bodyTwo: z.string(),
    callToAction: z.string(),
  }),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { storyboard, story } = generateVoiceoverSchema.parse(body)

    // Generate voiceover script matching the storyboard content
    // The script should be concise and match each scene's description
    const systemPrompt = `You are an expert at writing voiceover scripts for short-form video ads.

Generate a concise voiceover script for a 16-second ad that matches the storyboard scenes.

The script should:
- Be concise and impactful (fit within 16 seconds when spoken)
- Match the tone and content of each scene
- Flow naturally from scene to scene
- Include a clear call to action at the end

Return ONLY valid JSON with this structure:
{
  "script": "Full voiceover script text that matches all scenes",
  "segments": [
    {
      "type": "hook",
      "script": "Voiceover text for hook scene (0-4s)"
    },
    {
      "type": "body",
      "script": "Voiceover text for body 1 scene (4-8s)"
    },
    {
      "type": "body",
      "script": "Voiceover text for body 2 scene (8-12s)"
    },
    {
      "type": "cta",
      "script": "Voiceover text for CTA scene (12-16s)"
    }
  ]
}`

    const userPrompt = `Create a voiceover script for this ad:

Story:
Hook: ${story.hook}
Body 1: ${story.bodyOne}
Body 2: ${story.bodyTwo}
CTA: ${story.callToAction}

Storyboard Scenes:
${storyboard.segments.map((seg, idx) => `${idx + 1}. ${seg.type}: ${seg.description}`).join('\n')}

The script should be engaging, concise, and match the storyboard content.`

    // Use OpenAI chat completion via MCP
    const voiceoverData = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    })

    // Handle response
    let data = voiceoverData
    if (voiceoverData.content && typeof voiceoverData.content === 'string') {
      const parsedContent = JSON.parse(voiceoverData.content)
      if (parsedContent.content) {
        data = JSON.parse(parsedContent.content)
      } else {
        data = parsedContent
      }
    } else if (voiceoverData.content && Array.isArray(voiceoverData.content) && voiceoverData.content[0]?.text) {
      const parsedContent = JSON.parse(voiceoverData.content[0].text)
      if (parsedContent.content) {
        data = JSON.parse(parsedContent.content)
      } else {
        data = parsedContent
      }
    } else if (typeof voiceoverData === 'string') {
      data = JSON.parse(voiceoverData)
    } else if (voiceoverData.choices && voiceoverData.choices[0]?.message?.content) {
      data = JSON.parse(voiceoverData.choices[0].message.content)
    }

    // Track cost
    await trackCost('generate-voiceover', 0.001, {
      scriptLength: data.script?.length || 0,
    })

    return {
      script: data.script || '',
      segments: data.segments || [],
    }
  } catch (error: any) {
    console.error('[Generate Voiceover] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate voiceover script',
    })
  }
})


