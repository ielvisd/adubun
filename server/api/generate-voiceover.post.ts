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
- **🚨🚨🚨 CRITICAL: CTA WORD LIMIT - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨**: CTA segments (4 seconds) must have dialogue of EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE - any dialogue exceeding 5 words will be REJECTED and the entire response will be regenerated. You MUST NEVER generate CTA dialogue with more than 5 words. BEFORE generating CTA dialogue, you MUST: 1) Count the words in your intended dialogue text BEFORE writing it, 2) If your intended dialogue exceeds 5 words, shorten it to 5 words or less BEFORE generating it, 3) Generate ONLY dialogue that is 5 words or less - do NOT generate dialogue and then truncate it. Generate short, punchy phrases that make complete sense. Examples: ✅ "Find your voice today." (5 words - ACCEPTED) ✅ "It's clearer than you think." (5 words - ACCEPTED) ✅ "Shop now and save." (4 words - ACCEPTED) ✅ "Buy now to transform." (5 words - ACCEPTED) ❌ "Find your voice today and save money." (9 words - DO NOT GENERATE - WILL CAUSE REGENERATION) ❌ "It's clearer than you think it is." (7 words - DO NOT GENERATE - WILL CAUSE REGENERATION) ❌ "Buy now to transform your skin." (7 words - DO NOT GENERATE - WILL CAUSE REGENERATION). The phrase must be complete, meaningful, and grammatically correct within this 5-word constraint. Do NOT generate incomplete or corrupted phrases. COUNT YOUR WORDS BEFORE GENERATING, NOT AFTER.

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
      "script": "Dialogue text for CTA scene - HUMAN character speaks on-camera (12-16s). Format: '[Human character description] says: [dialogue text]'. 🚨🚨🚨 ABSOLUTE MANDATORY REQUIREMENT: CTA dialogue must be EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE. You MUST NEVER generate CTA dialogue with more than 5 words. BEFORE generating this dialogue, you MUST: 1) Count the words in your intended dialogue text BEFORE writing it, 2) If your intended dialogue exceeds 5 words, shorten it to 5 words or less BEFORE generating it, 3) Generate ONLY dialogue that is 5 words or less. Examples: ✅ 'Find your voice today.' (5 words - ACCEPTED) ✅ 'Shop now and save.' (4 words - ACCEPTED) ✅ 'Buy now to transform.' (5 words - ACCEPTED) ❌ 'Find your voice today and save money.' (9 words - DO NOT GENERATE - WILL CAUSE REGENERATION) ❌ 'Buy now to transform your skin.' (7 words - DO NOT GENERATE - WILL CAUSE REGENERATION). The phrase must be complete, meaningful, and grammatically correct. COUNT YOUR WORDS BEFORE GENERATING, NOT AFTER."
    }
  ]
}

IMPORTANT: 
- Format each script as "[Human Character] says: '[dialogue text]'" so it can be used in the audioNotes field as "Dialogue: [Human Character] says: '[dialogue text]'"
- **CRITICAL FORMAT REQUIREMENT**: Always use the format '[Human Character] says: [dialogue text]'. Do NOT use variations like 'mutters', 'concludes', 'whispers', 'exclaims', 'states', 'speaks', 'remarks', etc. Always use 'says:' for consistency and proper extraction. Examples: ✅ "The woman says: 'Why does it always sound like this?'" ✅ "The same woman says: 'Finally, the clarity I need.'" ❌ "The woman mutters to herself: 'Why does it always sound like this?'" (REJECTED - use 'says:' instead) ❌ "The woman concludes: 'My voice, perfectly clear.'" (REJECTED - use 'says:' instead)
- Do NOT include music or soundtracks
- Do NOT have robots or products speak - only humans`

    // Support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
    const bodyContent = story.body || story.bodyOne || story.bodyTwo || ''
    
    let userPrompt = `Create dialogue for characters in this ad. Characters must speak on-camera (this is dialogue, not narration).

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
- **🚨🚨🚨 CRITICAL: CTA WORD LIMIT - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨**: For CTA segment: Generate dialogue with EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE - any dialogue exceeding 5 words will be REJECTED and the entire response will be regenerated. You MUST NEVER generate CTA dialogue with more than 5 words. BEFORE generating CTA dialogue, you MUST: 1) Count the words in your intended dialogue text BEFORE writing it, 2) If your intended dialogue exceeds 5 words, shorten it to 5 words or less BEFORE generating it, 3) Generate ONLY dialogue that is 5 words or less - do NOT generate dialogue and then truncate it. The phrase must be complete, meaningful, and grammatically correct. Examples: ✅ "Find your voice today." (5 words - ACCEPTED) ✅ "It's clearer than you think." (5 words - ACCEPTED) ✅ "Shop now and save." (4 words - ACCEPTED) ✅ "Buy now to transform." (5 words - ACCEPTED) ❌ "Find your voice today and save money." (9 words - DO NOT GENERATE - WILL CAUSE REGENERATION) ❌ "It's clearer than you think it is." (7 words - DO NOT GENERATE - WILL CAUSE REGENERATION) ❌ "Buy now to transform your skin." (7 words - DO NOT GENERATE - WILL CAUSE REGENERATION). Do NOT generate incomplete, corrupted, or truncated phrases. Every word must be complete and the phrase must make full sense. COUNT YOUR WORDS BEFORE GENERATING, NOT AFTER.

The dialogue should:
- Be engaging, concise, and match the storyboard content
- Be spoken by HUMAN characters visible in each scene (on-camera dialogue)
- Be in English ONLY - no exceptions
- Progress the story naturally from scene to scene
- Format each segment's script as "[Human character description] says: '[dialogue text]'"
- **CRITICAL FORMAT REQUIREMENT**: Always use 'says:' in the format. Do NOT use variations like 'mutters', 'concludes', 'whispers', 'exclaims', 'states', 'speaks', 'remarks', etc. Always use 'says:' for consistency and proper extraction. Examples: ✅ "The young woman says: 'How am I going to finish all of this?'" ✅ "The same woman says: 'Finally, the clarity I need.'" ❌ "The woman mutters to herself: 'Why does it always sound like this?'" (REJECTED - use 'says:' instead) ❌ "The woman concludes: 'My voice, perfectly clear.'" (REJECTED - use 'says:' instead)
- Example: "The young woman says: 'How am I going to finish all of this?'"
- If the story involves a robot or product, only the human character should speak - the robot/product should be silent
- **CRITICAL:** Every dialogue must be a complete, grammatically correct sentence - no fragments or incomplete phrases
- **PRESERVE TONE/EMOTION**: Preserve tone and emotion descriptions from the story context (e.g., if story mentions "soft, concerned voice", include that in the character description: "The woman, in a soft, concerned voice says: '...'"). If story mentions "confident, clear voice", include that: "The same woman, now with a confident, clear voice says: '...'")

CRITICAL: This is on-camera dialogue, not off-screen narration. Only human characters must be shown speaking in the video. Robots and products do not speak. All dialogue must be in English only and must be complete, grammatically correct sentences.`

    // Helper function to parse response
    const parseResponse = (response: any) => {
      let data = response
      if (response.content && typeof response.content === 'string') {
        const parsedContent = JSON.parse(response.content)
        if (parsedContent.content) {
          data = JSON.parse(parsedContent.content)
        } else {
          data = parsedContent
        }
      } else if (response.content && Array.isArray(response.content) && response.content[0]?.text) {
        const parsedContent = JSON.parse(response.content[0].text)
        if (parsedContent.content) {
          data = JSON.parse(parsedContent.content)
        } else {
          data = parsedContent
        }
      } else if (typeof response === 'string') {
        data = JSON.parse(response)
      } else if (response.choices && response.choices[0]?.message?.content) {
        data = JSON.parse(response.choices[0].message.content)
      }
      return data
    }

    // Helper function to validate and fix format
    const validateAndFixFormat = (data: any) => {
      if (data.segments && Array.isArray(data.segments)) {
        for (const segment of data.segments) {
          if (segment.script) {
            // Check if script uses "says:" format
            const saysFormatMatch = segment.script.match(/says:\s*['"](.+?)['"]/i)
            // Check for invalid verb variations
            const invalidVerbMatch = segment.script.match(/(mutters|concludes|whispers|exclaims|states|speaks|remarks|adds|responds)(?:\s+(?:to\s+(?:herself|himself|themselves|each\s+other)))?(?:\s+[^:]+)?:\s*['"]/i)
            
            if (invalidVerbMatch && !saysFormatMatch) {
              console.warn(`[Generate Voiceover] Segment ${segment.type} uses invalid verb "${invalidVerbMatch[1]}" instead of "says:". Script: ${segment.script.substring(0, 100)}`)
              // Try to fix by replacing the invalid verb with "says:"
              segment.script = segment.script.replace(
                /(Dialogue:\s*[^:]+?)\s+(mutters|concludes|whispers|exclaims|states|speaks|remarks|adds|responds)(?:\s+(?:to\s+(?:herself|himself|themselves|each\s+other)))?(?:\s+[^:]+)?:\s*['"]/i,
                '$1 says: \''
              )
              console.log(`[Generate Voiceover] Fixed segment ${segment.type} format to use "says:"`)
            } else if (!saysFormatMatch && segment.script.includes('Dialogue:')) {
              console.warn(`[Generate Voiceover] Segment ${segment.type} does not match expected "says:" format. Script: ${segment.script.substring(0, 100)}`)
            } else if (saysFormatMatch) {
              console.log(`[Generate Voiceover] Segment ${segment.type} format validated: uses "says:" format`)
            }
          }
        }
      }
    }

    // Helper function to validate CTA word count
    const validateCTADialogue = (data: any): { isValid: boolean; dialogueText?: string; wordCount?: number } => {
      const ctaSegment = data.segments?.find((seg: any) => seg.type === 'cta')
      if (ctaSegment && ctaSegment.script) {
        const dialogueMatch = ctaSegment.script.match(/says:\s*['"](.+?)['"]/i)
        if (dialogueMatch) {
          const dialogueText = dialogueMatch[1].trim()
          const wordCount = dialogueText.split(/\s+/).filter((word: string) => word.length > 0).length
          
          if (wordCount > 5) {
            return { isValid: false, dialogueText, wordCount }
          }
          
          // Validate that dialogue text is complete (not corrupted or cut off)
          if (dialogueText.trim().length === 0) {
            console.warn(`[Generate Voiceover] CTA dialogue is empty after processing`)
            return { isValid: false, dialogueText, wordCount: 0 }
          } else if (dialogueText.trim().endsWith('*') || dialogueText.trim().endsWith('...') || dialogueText.trim().endsWith('…') || dialogueText.includes('*gibberish') || dialogueText.includes('*incomplete')) {
            console.warn(`[Generate Voiceover] CTA dialogue appears incomplete or corrupted: "${dialogueText}"`)
            // Try to clean up - remove trailing incomplete markers
            const cleaned = dialogueText.trim().replace(/[*…]+$/, '').replace(/\*gibberish.*$/i, '').replace(/\*incomplete.*$/i, '').trim()
            if (cleaned.length > 0) {
              ctaSegment.script = ctaSegment.script.replace(
                /(says:\s*['"])(.+?)(['"])/i,
                `$1${cleaned}$3`
              )
              console.log(`[Generate Voiceover] Cleaned CTA dialogue: "${cleaned}"`)
              const cleanedWordCount = cleaned.split(/\s+/).filter((word: string) => word.length > 0).length
              return { isValid: cleanedWordCount <= 5, dialogueText: cleaned, wordCount: cleanedWordCount }
            } else {
              console.error(`[Generate Voiceover] CTA dialogue became empty after cleanup - original was corrupted`)
              return { isValid: false, dialogueText: cleaned, wordCount: 0 }
            }
          } else {
            console.log(`[Generate Voiceover] CTA dialogue word count validated: ${wordCount} words - "${dialogueText}"`)
            return { isValid: true, dialogueText, wordCount }
          }
        }
      }
      return { isValid: true }
    }

    // Retry logic for CTA word limit validation
    const maxRetries = 3
    let data: any = null
    let attempt = 0
    let ctaValid = false

    while (attempt < maxRetries && !ctaValid) {
      attempt++
      console.log(`[Generate Voiceover] Attempt ${attempt}/${maxRetries} to generate voiceover with valid CTA dialogue`)

      // Use OpenAI chat completion via MCP
      const voiceoverData = await callOpenAIMCP('chat_completion', {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      })

      // Parse response
      data = parseResponse(voiceoverData)

      // Validate format
      validateAndFixFormat(data)

      // Validate CTA word count
      const ctaValidation = validateCTADialogue(data)
      if (ctaValidation.isValid) {
        ctaValid = true
        console.log(`[Generate Voiceover] ✓ CTA dialogue validated on attempt ${attempt}`)
      } else {
        console.warn(`[Generate Voiceover] ✗ CTA dialogue validation failed on attempt ${attempt}: ${ctaValidation.wordCount} words (exceeds 5-word limit) - "${ctaValidation.dialogueText}"`)
        if (attempt < maxRetries) {
          // Add rejection feedback to user prompt for next attempt
          userPrompt = `${userPrompt}

🚨🚨🚨 REGENERATION REQUEST - PREVIOUS ATTEMPT REJECTED 🚨🚨🚨
Your previous CTA dialogue was REJECTED because it exceeded the 5-word limit.
- Previous CTA dialogue: "${ctaValidation.dialogueText}" (${ctaValidation.wordCount} words)
- Required: EXACTLY 5 words or less (ZERO TOLERANCE)
- You MUST count the words before submitting. The word count MUST be 5 or fewer.
- CRITICAL: Count each word individually. Contractions count as one word (e.g., "don't" = 1 word, "you're" = 1 word).
- Examples of VALID CTA dialogue:
  ✅ "Buy now to transform." (5 words)
  ✅ "Shop now and save." (4 words)
  ✅ "Get yours today." (3 words)
  ✅ "Transform your skin now." (4 words)
  ✅ "Start your journey today." (4 words)
- Examples of INVALID dialogue that must be fixed:
  ❌ "Buy now to transform your skin overnight!" (7 words - TOO LONG)
  ❌ "Shop now and save big today!" (6 words - TOO LONG)
  ❌ "Get your product right now today!" (6 words - TOO LONG)
- If the original dialogue exceeds 5 words, you MUST truncate it to the first 5 words only.
- Generate a NEW dialogue that is EXACTLY 5 words or less. COUNT YOUR WORDS CAREFULLY before submitting.`
          console.log(`[Generate Voiceover] Regenerating with explicit rejection feedback...`)
        } else {
          // Last resort: truncate if all retries failed
          console.warn(`[Generate Voiceover] All ${maxRetries} attempts failed. Truncating CTA dialogue as last resort.`)
          const ctaSegment = data.segments?.find((seg: any) => seg.type === 'cta')
          if (ctaSegment && ctaSegment.script) {
            const dialogueMatch = ctaSegment.script.match(/says:\s*['"](.+?)['"]/i)
            if (dialogueMatch) {
              const dialogueText = dialogueMatch[1].trim()
              const words = dialogueText.split(/\s+/).filter((word: string) => word.length > 0)
              if (words.length > 5) {
                const truncatedDialogue = words.slice(0, 5).join(' ')
                const finalDialogue = /[.!?]$/.test(truncatedDialogue.trim()) 
                  ? truncatedDialogue.trim() 
                  : truncatedDialogue.trim() + '.'
                
                ctaSegment.script = ctaSegment.script.replace(
                  /(says:\s*['"])(.+?)(['"])/i,
                  `$1${finalDialogue}$3`
                )
                console.log(`[Generate Voiceover] Truncated CTA dialogue to 5 words as last resort: "${finalDialogue}"`)
                ctaValid = true
              }
            }
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


