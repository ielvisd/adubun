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
    body: z.string().optional(), // New format - single body field
    bodyOne: z.string().optional(), // Old format - for backward compatibility
    bodyTwo: z.string().optional(), // Old format - for backward compatibility
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

**CRITICAL REQUIREMENTS:**
- **HUMAN CHARACTERS ONLY**: Only human characters should speak. Robots, products, or non-human entities should NEVER speak. If the story involves a robot or product, only the human character(s) should have dialogue.
- **NO MUSIC**: Do NOT include any music, background music, or soundtracks. Only dialogue should be generated.
- **3 SEGMENTS ONLY**: Generate exactly 3 segments: Hook (0-6s), Body (6-12s), and CTA (12-16s). Do NOT create 4 segments.
- **CRITICAL: COMPLETE SENTENCES**: All dialogue must be complete, grammatically correct English sentences. Do NOT generate incomplete phrases, fragments, or cut-off sentences. Each dialogue must be a full, meaningful sentence that makes sense on its own. Examples: ✅ "Oh, thank you! That's exactly what I needed." ✅ "How am I going to finish all of this?" ❌ "Oh, thank you, that" (incomplete - REJECTED) ❌ "That's exactly..." (cut-off - REJECTED). Before finalizing dialogue, verify that each sentence is complete and grammatically correct. If a sentence feels incomplete, expand it to be a full, meaningful statement.

The dialogue should:
- Be concise and impactful (fit within 16 seconds when spoken)
- Match the tone and content of each scene
- Flow naturally from scene to scene as a conversation or monologue
- Be spoken by HUMAN characters visible in the scene (on-camera dialogue)
- Include a clear call to action at the end
- **CRITICAL:** Characters must speak on-camera - this is dialogue, not off-screen narration
- **CRITICAL:** Only human characters speak - robots/products do not speak
- **CRITICAL:** Every dialogue must be a complete, grammatically correct sentence - no fragments or incomplete phrases
- **CRITICAL: CTA WORD LIMIT**: CTA segments (4 seconds) must have dialogue of exactly 5 words or less. Generate short, punchy phrases that make complete sense. The phrase must be complete and meaningful within this constraint.

Return ONLY valid JSON with this structure:
{
  "script": "Full dialogue script text that matches all scenes",
  "segments": [
    {
      "type": "hook",
      "script": "Dialogue text for hook scene - HUMAN character speaks on-camera (0-6s). Format: '[Human character description] says: [dialogue text]'"
    },
    {
      "type": "body",
      "script": "Dialogue text for body scene - HUMAN character speaks on-camera (6-12s). Format: '[Human character description] says: [dialogue text]'"
    },
    {
      "type": "cta",
      "script": "Dialogue text for CTA scene - HUMAN character speaks on-camera (12-16s). Format: '[Human character description] says: [dialogue text]'. CRITICAL: CTA segments (4 seconds) must have dialogue of exactly 5 words or less. Generate short, punchy phrases that make complete sense."
    }
  ]
}

IMPORTANT: 
- Format each script as "[Human Character] says: '[dialogue text]'" so it can be used in the audioNotes field as "Dialogue: [Human Character] says: '[dialogue text]'"
- Do NOT include music or soundtracks
- Do NOT have robots or products speak - only humans`

    // Support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
    const bodyContent = story.body || story.bodyOne || story.bodyTwo || ''
    
    const userPrompt = `Create dialogue for characters in this ad. Characters must speak on-camera (this is dialogue, not narration).

Story:
Hook: ${story.hook}
Body: ${bodyContent}
CTA: ${story.callToAction}

Storyboard Scenes:
${storyboard.segments.map((seg, idx) => `${idx + 1}. ${seg.type}: ${seg.description}`).join('\n')}

**CRITICAL REQUIREMENTS:**
- **ONLY HUMAN CHARACTERS SPEAK**: Robots, products, or non-human entities should NEVER speak. Only human characters visible in the scene should have dialogue.
- **ONLY ENGLISH LANGUAGE**: All dialogue must be in English ONLY. NO other languages whatsoever. NO foreign languages, NO non-English speech.
- **NO NARRATION**: ABSOLUTELY NO narration, NO voiceover, NO off-screen announcer, NO background voices. Only on-camera characters speaking directly.
- **NO MUSIC**: Do NOT include any music, background music, or soundtracks. Only dialogue.
- **3 SEGMENTS**: Generate exactly 3 segments (Hook, Body, CTA) - do NOT create 4 segments.
- **CRITICAL: COMPLETE SENTENCES**: All dialogue must be complete, grammatically correct English sentences. Do NOT generate incomplete phrases, fragments, or cut-off sentences. Each dialogue must be a full, meaningful sentence that makes sense on its own. Examples: ✅ "Oh, thank you! That's exactly what I needed." ✅ "How am I going to finish all of this?" ❌ "Oh, thank you, that" (incomplete - REJECTED) ❌ "That's exactly..." (cut-off - REJECTED). Before finalizing dialogue, verify that each sentence is complete and grammatically correct. If a sentence feels incomplete, expand it to be a full, meaningful statement.
- **CRITICAL: CTA WORD LIMIT**: For CTA segment: Generate dialogue with exactly 5 words or less. The phrase must be complete and meaningful. Examples: ✅ "Find your voice today." (5 words) ✅ "It's clearer than you think." (5 words) ❌ "Find your voice... it's clearer than you think." (too long - REJECTED)

The dialogue should:
- Be engaging, concise, and match the storyboard content
- Be spoken by HUMAN characters visible in each scene (on-camera dialogue)
- Be in English ONLY - no exceptions
- Progress the story naturally from scene to scene
- Format each segment's script as "[Human character description] says: '[dialogue text]'"
- Example: "The young woman says: 'How am I going to finish all of this?'"
- If the story involves a robot or product, only the human character should speak - the robot/product should be silent
- **CRITICAL:** Every dialogue must be a complete, grammatically correct sentence - no fragments or incomplete phrases
- **PRESERVE TONE/EMOTION**: Preserve tone and emotion descriptions from the story context (e.g., if story mentions "soft, concerned voice", include that in the character description: "The woman, in a soft, concerned voice says: '...'"). If story mentions "confident, clear voice", include that: "The same woman, now with a confident, clear voice says: '...'"

CRITICAL: This is on-camera dialogue, not off-screen narration. Only human characters must be shown speaking in the video. Robots and products do not speak. All dialogue must be in English only and must be complete, grammatically correct sentences.`

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

    // Validate CTA segment word count (must be 5 words or less)
    if (data.segments && Array.isArray(data.segments)) {
      const ctaSegment = data.segments.find((seg: any) => seg.type === 'cta')
      if (ctaSegment && ctaSegment.script) {
        // Extract dialogue text from format: "[Character] says: '[dialogue]'"
        const dialogueMatch = ctaSegment.script.match(/says:\s*['"](.+?)['"]/i)
        if (dialogueMatch) {
          const dialogueText = dialogueMatch[1].trim()
          const wordCount = dialogueText.split(/\s+/).filter(word => word.length > 0).length
          
          if (wordCount > 5) {
            console.warn(`[Generate Voiceover] CTA dialogue has ${wordCount} words (exceeds 5-word limit): "${dialogueText}"`)
            // Truncate to first 5 words
            const words = dialogueText.split(/\s+/).filter(word => word.length > 0)
            const truncatedDialogue = words.slice(0, 5).join(' ')
            ctaSegment.script = ctaSegment.script.replace(
              /(says:\s*['"])(.+?)(['"])/i,
              `$1${truncatedDialogue}$3`
            )
            console.log(`[Generate Voiceover] Truncated CTA dialogue to 5 words: "${truncatedDialogue}"`)
          } else {
            console.log(`[Generate Voiceover] CTA dialogue word count validated: ${wordCount} words - "${dialogueText}"`)
          }
        }
      }
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


