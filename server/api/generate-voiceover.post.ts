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
    const systemPrompt = `You are an expert at writing dialogue scripts for short-form video ads.

Generate dialogue for characters visible in the video who speak on-camera. This is NOT narration or voiceover - characters must speak directly on-camera.

The dialogue should:
- Be concise and impactful (fit within 16 seconds when spoken)
- Match the tone and content of each scene
- Flow naturally from scene to scene as a conversation or monologue
- Be spoken by characters visible in the scene (on-camera dialogue)
- Include a clear call to action at the end
- **CRITICAL:** Characters must speak on-camera - this is dialogue, not off-screen narration

Return ONLY valid JSON with this structure:
{
  "script": "Full dialogue script text that matches all scenes",
  "segments": [
    {
      "type": "hook",
      "script": "Dialogue text for hook scene - character speaks on-camera (0-4s). Format: '[Character description] says: [dialogue text]'"
    },
    {
      "type": "body",
      "script": "Dialogue text for body 1 scene - character speaks on-camera (4-8s). Format: '[Character description] says: [dialogue text]'"
    },
    {
      "type": "body",
      "script": "Dialogue text for body 2 scene - character speaks on-camera (8-12s). Format: '[Character description] says: [dialogue text]'"
    },
    {
      "type": "cta",
      "script": "Dialogue text for CTA scene - character speaks on-camera (12-16s). Format: '[Character description] says: [dialogue text]'"
    }
  ]
}

IMPORTANT: Format each script as "[Character] says: '[dialogue text]'" so it can be used in the audioNotes field as "Dialogue: [Character] says: '[dialogue text]'"`

    const userPrompt = `Create dialogue for characters in this ad. Characters must speak on-camera (this is dialogue, not narration).

Story:
Hook: ${story.hook}
Body 1: ${story.bodyOne}
Body 2: ${story.bodyTwo}
CTA: ${story.callToAction}

Storyboard Scenes:
${storyboard.segments.map((seg, idx) => `${idx + 1}. ${seg.type}: ${seg.description}`).join('\n')}

The dialogue should:
- Be engaging, concise, and match the storyboard content
- Be spoken by characters visible in each scene (on-camera dialogue)
- Progress the story naturally from scene to scene
- Format each segment's script as "[Character description] says: '[dialogue text]'"
- Example: "The young woman says: 'How am I going to finish all of this?'"

CRITICAL: This is on-camera dialogue, not off-screen narration. Characters must be shown speaking in the video.`

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


