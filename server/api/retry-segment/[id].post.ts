import { getJob, saveJob } from '../generate-assets.post'
import { callReplicateMCP, callOpenAIMCP } from '../../utils/mcp-client'
import { trackCost } from '../../utils/cost-tracker'
import { saveAsset, readStoryboard, saveStoryboard } from '../../utils/storage'
import { uploadFileToReplicate } from '../../utils/replicate-upload'
import { sanitizeVideoPrompt } from '../../utils/prompt-sanitizer'
import path from 'path'
import { promises as fs } from 'fs'

// Helper function to prepare image input for Replicate
// Uploads local files to Replicate and returns public URLs
async function prepareImageInput(filePath: string | undefined | null): Promise<string | undefined> {
  if (!filePath) {
    return undefined
  }
  
  // If it's already a public URL (https://), return as-is
  if (filePath.startsWith('https://')) {
    return filePath
  }
  
  // If it's a localhost URL, convert it to a local file path first
  if (filePath.startsWith('http://localhost') || filePath.startsWith('http://127.0.0.1')) {
    try {
      // Extract filename from URL and convert to local path
      const urlPath = new URL(filePath).pathname
      const filename = path.basename(urlPath)
      const assetsDir = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')
      const localPath = path.join(assetsDir, filename)
      // Resolve to absolute path and upload
      const resolvedPath = path.resolve(localPath)
      return await uploadFileToReplicate(resolvedPath)
    } catch (e) {
      // If URL parsing fails, treat as file path
      console.warn('Failed to parse localhost URL, treating as file path:', filePath)
    }
  }
  
  // If it's already a URL (but not localhost), return as-is
  if (filePath.startsWith('http://')) {
    return filePath
  }
  
  // It's a local file path - resolve to absolute and upload to Replicate
  let resolvedPath: string
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath
  } else {
    // Resolve relative path to absolute
    const resolved = path.resolve(filePath)
    
    // Check if file exists at resolved path
    try {
      await fs.access(resolved)
      resolvedPath = resolved
    } catch {
      // Try relative to assets directory
      const assetsDir = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'assets')
      const assetsPath = path.isAbsolute(assetsDir) 
        ? path.join(assetsDir, path.basename(filePath))
        : path.resolve(assetsDir, path.basename(filePath))
      resolvedPath = path.resolve(assetsPath)
    }
  }
  
  // Upload to Replicate and get public URL
  return await uploadFileToReplicate(resolvedPath)
}

export default defineEventHandler(async (event) => {
  const segmentId = parseInt(getRouterParam(event, 'id') || '0')
  const { jobId, storyboard: providedStoryboard } = await readBody(event)

  if (!jobId) {
    throw createError({
      statusCode: 400,
      message: 'Job ID required',
    })
  }

  const job = await getJob(jobId)
  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  // Get storyboard: use provided one (latest from client) or read from backend
  let storyboard = providedStoryboard
  if (!storyboard) {
    storyboard = await readStoryboard(job.storyboardId)
  } else {
    // If storyboard is provided, ensure it's saved to backend for consistency
    await saveStoryboard(storyboard)
  }
  
  const segment = storyboard.segments[segmentId]

  if (!segment) {
    throw createError({
      statusCode: 404,
      message: 'Segment not found',
    })
  }

  try {
    // Get model from storyboard meta, default to google/veo-3.1-fast
    const model = storyboard.meta.model || 'google/veo-3.1-fast'
    
    // Determine which images to use (segment-specific or global fallback)
    const firstFrameImage = segment.firstFrameImage || storyboard.meta.firstFrameImage
    const lastFrameImage = segment.lastFrameImage
    const subjectReference = segment.subjectReference || storyboard.meta.subjectReference

    // Get the selected prompt (primary or alternative)
    let selectedPrompt = segment.visualPrompt
    if (segment.selectedPromptIndex !== undefined && segment.selectedPromptIndex > 0) {
      const altIndex = segment.selectedPromptIndex - 1
      if (segment.visualPromptAlternatives && segment.visualPromptAlternatives[altIndex]) {
        selectedPrompt = segment.visualPromptAlternatives[altIndex]
      }
    }

    // Sanitize prompt to avoid content moderation flags
    let sanitizedPrompt = sanitizeVideoPrompt(selectedPrompt)
    
    // Extract mood from storyboard meta
    const mood = storyboard.meta.mood || 'professional'
    const moodInstruction = mood ? ` ${mood.charAt(0).toUpperCase() + mood.slice(1)} tone and mood.` : ''
    
    // Extract dialogue from audioNotes and build speaking instructions (same logic as generate-assets)
    let dialogueInstructions = ''
    let dialogueTextForPrompt = ''
    if (segment.audioNotes) {
      // Check if audioNotes contains dialogue format: "Dialogue: [Character description] says: '[text]'"
      const dialogueMatch = segment.audioNotes.match(/Dialogue:\s*(.+?)\s+says(?:[^:]+)?:\s*['"](.+?)['"]/i)
      if (dialogueMatch) {
        let characterDescription = dialogueMatch[1].trim()
        let dialogueText = dialogueMatch[2].trim()
        
        // Extract tone description from between "says" and ":" if present
        let toneFromSays = ''
        const saysMatch = segment.audioNotes.match(/says\s+([^:]+):/i)
        if (saysMatch) {
          const saysText = saysMatch[1].trim()
          if (/\b(with|in|tone|voice|emotion|manner|way)\b/i.test(saysText)) {
            toneFromSays = saysText
            console.log(`[Retry Segment ${segmentId}] Extracted tone from "says" clause: "${toneFromSays}"`)
          }
        }
        
        // Validate CTA segment word count (must be 5 words or less)
        if (segment.type === 'cta') {
          const wordCount = dialogueText.split(/\s+/).filter(word => word.length > 0).length
          if (wordCount > 5) {
            console.warn(`[Retry Segment ${segmentId}] CTA dialogue has ${wordCount} words (exceeds 5-word limit): "${dialogueText}"`)
            const words = dialogueText.split(/\s+/).filter(word => word.length > 0)
            dialogueText = words.slice(0, 5).join(' ')
            console.log(`[Retry Segment ${segmentId}] Truncated CTA dialogue to 5 words: "${dialogueText}"`)
          }
        }
        
        // Extract tone/voice descriptions
        let toneDescription = ''
        if (toneFromSays) {
          toneDescription = toneFromSays
        } else {
          const toneMatch = characterDescription.match(/(?:,\s*)?(?:in\s+a\s+)?([^,]+(?:,\s*[^,]+)*\s+voice)/i)
          if (toneMatch) {
            toneDescription = toneMatch[1].trim()
          }
        }
        
        // Clean up character description
        let cleanCharacterDescription = characterDescription.replace(/\s+with\s+[^,]+(?:,\s*[^,]+)*\s+voice/gi, '')
        cleanCharacterDescription = cleanCharacterDescription.replace(/\s+in\s+a\s+[^,]+(?:,\s*[^,]+)*\s+voice/gi, '')
        cleanCharacterDescription = cleanCharacterDescription.replace(/\s+voice$/gi, '')
        cleanCharacterDescription = cleanCharacterDescription.trim()
        
        if (cleanCharacterDescription.length > 50) {
          const simpleMatch = cleanCharacterDescription.match(/(?:the\s+)?(?:same\s+)?(?:young\s+|elderly\s+|middle-aged\s+)?(man|woman|person|character)/i)
          if (simpleMatch) {
            const baseChar = simpleMatch[1].toLowerCase()
            cleanCharacterDescription = cleanCharacterDescription.includes('same') ? `the same ${baseChar}` : `the ${baseChar}`
          }
        }
        
        characterDescription = cleanCharacterDescription
        
        const segmentDuration = segment.endTime - segment.startTime
        const dialogueEndTime = Math.max(0, segmentDuration - 2)
        const estimatedWords = dialogueText.split(/\s+/).length
        const estimatedDuration = Math.min(dialogueEndTime, Math.max(2, estimatedWords / 2.5))
        const dialogueStartTime = 0
        const dialogueEndTimeFormatted = dialogueStartTime + estimatedDuration
        
        // Format timecodes as [00:00-00:04] for Veo 3.1
        const formatTimecode = (seconds: number): string => {
          const mins = Math.floor(seconds / 60)
          const secs = Math.floor(seconds % 60)
          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        
        const startTimecode = formatTimecode(dialogueStartTime)
        const endTimecode = formatTimecode(dialogueEndTimeFormatted)
        
        // Build explicit speaking instructions with timecodes
        const toneInstruction = toneDescription ? ` CRITICAL: TONE MATCHING - The character must speak with the tone/emotion: "${toneDescription}". Match the intended delivery style (e.g., "soft, concerned voice" means speak softly with concern, "confident, clear voice" means speak with confidence). Preserve the emotional delivery style specified.` : ''
        
        dialogueInstructions = ` CRITICAL LANGUAGE REQUIREMENT: The dialogue "${dialogueText}" must be spoken in English ONLY. NO other languages allowed. CRITICAL ON-CAMERA SPOKEN DIALOGUE REQUIREMENT - NOT VOICEOVER, NOT THOUGHTS: [${startTimecode}-${endTimecode}] The ${characterDescription} SPEAKS ALOUD directly on-camera: "${dialogueText}". 

CRITICAL: EXACT DIALOGUE MATCHING - The character must speak the EXACT words: "${dialogueText}". Do not paraphrase, do not change words, do not add words, do not remove words. Speak each word clearly and precisely. The character must say exactly: "${dialogueText}" - no substitutions, no variations, no gibberish, no made-up words.${toneInstruction}

ABSOLUTELY NO VOICEOVER OR INTERNAL THOUGHTS:
- This is SPOKEN DIALOGUE, not internal thoughts, not voiceover, not narration
- The character's voice must come from their MOUTH, not from off-screen or as thoughts
- The dialogue "${dialogueText}" must be SPOKEN ALOUD by the character on-camera
- Do NOT generate this as internal monologue, thoughts, or voiceover narration
- The character must be HEARD speaking these words with their voice coming from their mouth

MANDATORY VISUAL REQUIREMENTS:
- The character's MOUTH MUST MOVE clearly and naturally as they SPEAK each word ALOUD
- The character's LIPS MUST SYNC with the spoken words "${dialogueText}"
- The character MUST be shown SPEAKING on-camera, not just reacting, thinking, or expressing
- Use CLOSE-UP or MEDIUM SHOT to clearly show the character's face and mouth movements
- The character's FACE must be clearly visible with mouth movements matching the dialogue
- Show the character actively SPEAKING with visible speaking gestures, mouth movements, and facial expressions
- The character must be looking at the camera or at other visible characters while SPEAKING
- Do NOT show the character silent or with closed mouth during this dialogue timecode
- The character's voice must be AUDIBLE and come from their MOUTH, not as thoughts or narration

The character's mouth movements must match the words being SPOKEN ALOUD: "${dialogueText}". This is SPOKEN DIALOGUE, not thoughts or voiceover.`
        
        // Add the actual dialogue text in Veo format
        const toneSuffix = toneDescription ? `, ${toneDescription}` : ''
        dialogueTextForPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} says: "${dialogueText}"${toneSuffix}`
        
        // Enhance visual prompt to explicitly include dialogue text and state character is SPEAKING
        if (!sanitizedPrompt.includes(`"${dialogueText}"`) && !sanitizedPrompt.includes(`'${dialogueText}'`)) {
          const toneContext = toneDescription ? ` with ${toneDescription}` : ''
          const dialogueInVisualPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} speaks directly on-camera in English only, saying the EXACT words "${dialogueText}"${toneContext} with clear mouth movements. The character's lips move in sync with each word: "${dialogueText}". The character must speak these exact words precisely - no substitutions, no variations.`
          
          sanitizedPrompt = `${sanitizedPrompt}${dialogueInVisualPrompt}`
          
          console.log(`[Retry Segment ${segmentId}] Added dialogue to visual prompt: "${dialogueText}"${toneDescription ? ` with tone: ${toneDescription}` : ''}`)
        }
        
        console.log(`[Retry Segment ${segmentId}] Extracted dialogue: "${dialogueText}" from character: ${characterDescription}`)
        console.log(`[Retry Segment ${segmentId}] Dialogue timing: ${startTimecode} to ${endTimecode} (${estimatedDuration.toFixed(1)}s)`)
      } else {
        console.log(`[Retry Segment ${segmentId}] No dialogue found in audioNotes: ${segment.audioNotes?.substring(0, 100)}`)
      }
    }
    
    // Build segment-specific instructions based on segment type (same logic as generate-assets)
    let segmentSpecificInstructions = ''
    let holdFinalFrameInstruction = ''
    let cameraPerspectiveInstruction = ''
    
    if (segment.type === 'cta') {
      // CTA is the end of the video, not a transition - need visual progression
      cameraPerspectiveInstruction = 'Allow camera movement and angle changes to show progression, ending with a distinct final composition. The video should progress naturally with clear visual changes from start to finish.'
      segmentSpecificInstructions = `CTA VISUAL PROGRESSION REQUIREMENT: This CTA segment is the FINAL segment of the video (not a transition to another segment). It must show clear visual progression from start to finish. The final moment must be visually DISTINCT from the starting moment. Use one or more of these techniques: 1) Change camera angle (switch from medium to close-up, or front to side/three-quarter angle), 2) Add text overlay or logo lockup in the final moment, 3) Change character pose or expression to show transformation, 4) Adjust composition to create a hero shot. The video should progress naturally from the starting frame to a visually distinct final frame. Do NOT hold the final frame static - this is the end of the video, not a transition, so show clear visual progression throughout the segment ending with a distinct hero shot. The final moment should be visually distinct from the starting moment - use different camera angle, composition, or add text/logo overlay. This is the end of the video, not a transition, so show clear visual progression.`
      console.log(`[Retry Segment ${segmentId}] CTA segment: Applying visual progression instructions (no hold final frame)`)
    } else {
      // Hook and body segments need smooth transitions - hold final frame for next segment
      cameraPerspectiveInstruction = 'Maintain the same camera perspective and same setting throughout.'
      holdFinalFrameInstruction = 'The video should naturally ease into and hold the final frame steady for approximately 0.5 seconds. No transitions, cuts, or effects at the end. The final moment should be stable for smooth continuation into the next scene.'
      console.log(`[Retry Segment ${segmentId}] ${segment.type} segment: Applying transition instructions (hold final frame for smooth transition)`)
    }
    
    // Build comprehensive video prompt (same structure as generate-assets)
    const videoPrompt = `${sanitizedPrompt}${moodInstruction}${dialogueTextForPrompt}${dialogueInstructions} CRITICAL CONTINUOUS SHOT REQUIREMENT: This must be a SINGLE CONTINUOUS SHOT in ONE LOCATION. NO scene changes, NO location changes, NO background changes, NO room changes. The entire segment must take place in the exact same location with the same background, same environment, same surroundings from start to finish. ${cameraPerspectiveInstruction} The video should feel like ONE unbroken moment in ONE place - do NOT change locations, rooms, backgrounds, or environments during this segment. ONE continuous shot, ONE location, ONE background. ${holdFinalFrameInstruction}${segmentSpecificInstructions} AUDIO: 🚨 CRITICAL LANGUAGE REQUIREMENT - ENGLISH ONLY: All spoken dialogue in this video MUST be in English ONLY. ABSOLUTELY NO exceptions. NO foreign languages, NO non-English speech, NO other languages whatsoever. If any character speaks, they must speak ONLY in English. This is a MANDATORY requirement - any non-English speech will result in video rejection. CRITICAL AUDIO REQUIREMENTS - SPOKEN DIALOGUE ONLY: Characters must SPEAK their dialogue ALOUD on-camera - this is SPOKEN DIALOGUE, not voiceover, not thoughts, not narration. Dialogue must come from the character's MOUTH as they speak on-camera. CRITICAL: EXACT DIALOGUE MATCHING - Characters must speak the EXACT words specified in the dialogue text. Do not paraphrase, do not change words, do not add words, do not remove words. Speak each word clearly and precisely. No substitutions, no variations, no gibberish, no made-up words. ABSOLUTELY NO MUSIC: Do NOT generate any background music, soundtrack, instrumental music, background score, or any musical audio whatsoever. Sound effects (SFX) and SPOKEN DIALOGUE are allowed, but NO music of any kind. ONLY on-camera characters visible in the scene may speak - their dialogue must be SPOKEN ALOUD, not heard as thoughts or voiceover. ABSOLUTELY NO narration, NO voiceover, NO off-screen announcer, NO background voices. ABSOLUTELY NO internal thoughts, NO internal monologue, NO thought bubbles, NO voiceover narration. If no character is speaking in a scene, there should be NO speech at all - complete silence. Only characters shown on-camera SPEAKING DIRECTLY to the camera or to other visible characters may have dialogue, and they must SPEAK ONLY in English. All dialogue must be SPOKEN ALOUD by the character on-camera - do NOT generate dialogue as thoughts, voiceover, or narration. If dialogue is present, it must end at least 2 seconds before the scene ends to ensure smooth transitions. CLOTHING & JEWELRY: Characters should already be wearing their clothes and jewelry from the start of the scene. Do NOT show characters putting on or taking off items. Items should be worn consistently throughout the scene. No wardrobe changes during the scene. TYPOGRAPHY & TEXT: If displaying any text, brand names, or product names: Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. Spell exactly as mentioned in prompt with perfect accuracy. Professional kerning, leading, and letter spacing. Sharp, crisp edges - no blurry or distorted text. Minimize decorative or script fonts unless specifically luxury brand requirement. Text should be perfectly readable at any resolution with cinema-quality typography. FACE QUALITY: Limit scene to 3-4 people maximum. Use close-ups and medium shots to ensure sharp faces, clear facial features, detailed faces, professional portrait quality. Avoid large groups, crowds, or more than 4 people.`
    
    const videoParams: any = {
      model,
      prompt: videoPrompt,
      duration: segment.endTime - segment.startTime,
      aspect_ratio: storyboard.meta.aspectRatio,
    }

    // Add image inputs if provided - upload to Replicate and get public URLs
    // Use model-specific parameter names (matching generate-assets.post.ts)
    if (model === 'google/veo-3.1') {
      // Always use firstFrameImage
      if (firstFrameImage) {
        videoParams.image = await prepareImageInput(firstFrameImage)
        console.log(`[Retry Segment ${segmentId}] Using first frame image: ${firstFrameImage}`)
      }
      
      // Only use last_frame for non-CTA segments (needed for transitions)
      if (lastFrameImage && segment.type !== 'cta') {
        videoParams.last_frame = await prepareImageInput(lastFrameImage)
        console.log(`[Retry Segment ${segmentId}] Using last frame image: ${lastFrameImage}`)
      } else if (segment.type === 'cta') {
        // For CTA, don't anchor to last frame - allow visual progression
        // CTA is the end of the video, not a transition, so no need for dual anchoring
        console.log(`[Retry Segment ${segmentId}] CTA segment: Using only first frame anchor (no last_frame) to allow visual progression`)
      }
      
      if (subjectReference) {
        videoParams.subject_reference = await prepareImageInput(subjectReference)
      }
      
      // Build default negative prompt with language exclusions
      const defaultNegativePrompt = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy, scene changes, location changes, background changes, different rooms, different locations, multiple settings, changing environments, narration, voiceover, off-screen voices, foreign languages, non-English speech, non-English dialogue, foreign dialogue, foreign speech, background narration, announcer, other languages, background music, soundtrack, instrumental music, background score, music, musical score, musical audio'
      
      // Priority: segment.negativePrompt > storyboard.meta.negativePrompt > default
      if ((segment as any).negativePrompt) {
        videoParams.negative_prompt = `${(segment as any).negativePrompt}, ${defaultNegativePrompt}`
        console.log(`[Retry Segment ${segmentId}] Using segment-specific negative prompt`)
      } else if (storyboard.meta.negativePrompt) {
        videoParams.negative_prompt = `${storyboard.meta.negativePrompt}, ${defaultNegativePrompt}`
      } else {
        videoParams.negative_prompt = defaultNegativePrompt
      }
      
      // Priority: segment.resolution > storyboard.meta.resolution
      if ((segment as any).resolution) {
        videoParams.resolution = (segment as any).resolution
        console.log(`[Retry Segment ${segmentId}] Using segment-specific resolution: ${(segment as any).resolution}`)
      } else if (storyboard.meta.resolution) {
        videoParams.resolution = storyboard.meta.resolution
      }
      
      // Enable Veo native audio generation for dialogue-only audio (same as generate-assets)
      videoParams.generate_audio = true
      console.log(`[Retry Segment ${segmentId}] Audio generation enabled (Veo will generate dialogue-only audio)`)
      
      // Priority: segment.seed > storyboard.meta.seed
      if ((segment as any).seed !== undefined && (segment as any).seed !== null) {
        videoParams.seed = (segment as any).seed
        console.log(`[Retry Segment ${segmentId}] Using segment-specific seed: ${(segment as any).seed}`)
      } else if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
        videoParams.seed = storyboard.meta.seed
      }
    } else if (model === 'google/veo-3-fast') {
      // Veo 3 Fast only supports: prompt, aspect_ratio, duration, image, negative_prompt, resolution, generate_audio, seed
      // Note: Does NOT support last_frame or reference_images
      if (firstFrameImage) {
        videoParams.image = await prepareImageInput(firstFrameImage)
        console.log(`[Retry Segment ${segmentId}] Using first frame image: ${firstFrameImage}`)
      }
    } else if (model === 'google/veo-3.1-fast') {
      // Veo 3.1 Fast supports: prompt, aspect_ratio, duration, image, last_frame, negative_prompt, resolution, generate_audio, seed
      // Note: Does NOT support reference_images (subject_reference)
      if (firstFrameImage) {
        videoParams.image = await prepareImageInput(firstFrameImage)
        console.log(`[Retry Segment ${segmentId}] Using first frame image: ${firstFrameImage}`)
      }
      
      if (lastFrameImage) {
        videoParams.last_frame = await prepareImageInput(lastFrameImage)
        console.log(`[Retry Segment ${segmentId}] Using last frame image: ${lastFrameImage}`)
      }
      
      // Build default negative prompt with language exclusions
      const defaultNegativePrompt = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy, scene changes, location changes, background changes, different rooms, different locations, multiple settings, changing environments, narration, voiceover, off-screen voices, foreign languages, non-English speech, non-English dialogue, foreign dialogue, foreign speech, background narration, announcer, other languages, background music, soundtrack, instrumental music, background score, music, musical score, musical audio'
      
      // Priority: segment.negativePrompt > storyboard.meta.negativePrompt > default
      if ((segment as any).negativePrompt) {
        videoParams.negative_prompt = `${(segment as any).negativePrompt}, ${defaultNegativePrompt}`
        console.log(`[Retry Segment ${segmentId}] Using segment-specific negative prompt`)
      } else if (storyboard.meta.negativePrompt) {
        videoParams.negative_prompt = `${storyboard.meta.negativePrompt}, ${defaultNegativePrompt}`
      } else {
        videoParams.negative_prompt = defaultNegativePrompt
      }
      
      // Priority: segment.resolution > storyboard.meta.resolution
      if ((segment as any).resolution) {
        videoParams.resolution = (segment as any).resolution
        console.log(`[Retry Segment ${segmentId}] Using segment-specific resolution: ${(segment as any).resolution}`)
      } else if (storyboard.meta.resolution) {
        videoParams.resolution = storyboard.meta.resolution
      }
      
      // Enable Veo native audio generation for dialogue-only audio (same as generate-assets)
      videoParams.generate_audio = true
      console.log(`[Retry Segment ${segmentId}] Audio generation enabled (Veo will generate dialogue-only audio)`)
      
      // Priority: segment.seed > storyboard.meta.seed
      if ((segment as any).seed !== undefined && (segment as any).seed !== null) {
        videoParams.seed = (segment as any).seed
        console.log(`[Retry Segment ${segmentId}] Using segment-specific seed: ${(segment as any).seed}`)
      } else if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
        videoParams.seed = storyboard.meta.seed
      }
    } else {
      // Fallback for other models - use first_frame_image and subject_reference
      if (firstFrameImage) {
        videoParams.first_frame_image = await prepareImageInput(firstFrameImage)
      }
      if (subjectReference) {
        videoParams.subject_reference = await prepareImageInput(subjectReference)
      }
    }

    console.log(`[Retry Segment ${segmentId}] Calling Replicate MCP generate_video with params:`, JSON.stringify(videoParams, null, 2))
    const videoResult = await callReplicateMCP('generate_video', videoParams)
    console.log(`[Retry Segment ${segmentId}] Replicate MCP generate_video response:`, JSON.stringify(videoResult, null, 2))

    // Check if the response contains an error
    if (videoResult && typeof videoResult === 'object' && 'error' in videoResult) {
      console.error(`[Retry Segment ${segmentId}] Replicate MCP returned error:`, videoResult.error)
      throw new Error(`Video generation error: ${videoResult.error}`)
    }

    await trackCost('video-generation', 0.15, {
      segmentId,
      retry: true,
    })

    // Poll for completion
    let predictionStatus = videoResult
    console.log(`[Retry Segment ${segmentId}] Initial prediction status:`, JSON.stringify(predictionStatus, null, 2))
    console.log(`[Retry Segment ${segmentId}] Response type:`, typeof predictionStatus)
    console.log(`[Retry Segment ${segmentId}] Is array:`, Array.isArray(predictionStatus))
    console.log(`[Retry Segment ${segmentId}] Response keys:`, predictionStatus ? Object.keys(predictionStatus) : 'null/undefined')
    
    // Get the prediction ID from the initial response - try multiple possible fields
    // Handle different response structures that might come from different models
    let predictionId: string | undefined
    
    if (predictionStatus) {
      // Try direct properties first
      predictionId = predictionStatus.predictionId || 
                    predictionStatus.id || 
                    (predictionStatus as any)?.prediction_id
      
      // Try nested structures
      if (!predictionId && (predictionStatus as any).prediction) {
        predictionId = (predictionStatus as any).prediction.id || 
                      (predictionStatus as any).prediction.predictionId ||
                      (predictionStatus as any).prediction.prediction_id
      }
      
      // Try if response is wrapped in a data property
      if (!predictionId && (predictionStatus as any).data) {
        const data = (predictionStatus as any).data
        predictionId = data.predictionId || data.id || data.prediction_id
      }
      
      // Try if response is an array (some models might return arrays)
      if (!predictionId && Array.isArray(predictionStatus) && predictionStatus.length > 0) {
        const firstItem = predictionStatus[0]
        predictionId = firstItem.predictionId || firstItem.id || firstItem.prediction_id
      }
    }
                        
    console.log(`[Retry Segment ${segmentId}] Extracted prediction ID:`, predictionId)
    
    if (!predictionId) {
      const errorDetails = {
        segmentId,
        response: videoResult,
        responseKeys: videoResult ? Object.keys(videoResult) : [],
        responseType: typeof videoResult,
        isArray: Array.isArray(videoResult),
        stringified: JSON.stringify(videoResult, null, 2),
        model: videoParams.model,
      }
      console.error(`[Retry Segment ${segmentId}] Invalid video result - missing prediction ID:`, JSON.stringify(errorDetails, null, 2))
      throw new Error(`Invalid response from video generation: missing prediction ID. Model: ${videoParams.model}. Please check the response structure for this model. Response: ${JSON.stringify(errorDetails)}`)
    }
    
    console.log('[Retry Segment] Starting prediction with ID:', predictionId)
    
    while (predictionStatus.status === 'starting' || predictionStatus.status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 2000))
      predictionStatus = await callReplicateMCP('check_prediction_status', {
        predictionId: predictionId,
      })
    }

    if (predictionStatus.status !== 'succeeded') {
      throw new Error(`Video generation failed: ${predictionStatus.error || 'Unknown error'}`)
    }

    const videoResultFinal = await callReplicateMCP('get_prediction_result', {
      predictionId: predictionId,
    })

    const videoUrl = videoResultFinal?.videoUrl
    if (!videoUrl) {
      console.error('[Retry Segment] No videoUrl in result:', JSON.stringify(videoResultFinal, null, 2))
      throw new Error(`Video generation completed but no video URL was returned. Result: ${JSON.stringify(videoResultFinal)}`)
    }

    // Retry voice if needed
    let voiceUrl: string | undefined
    if (segment.audioNotes) {
      try {
        const voiceResult = await callOpenAIMCP('text_to_speech', {
          text: segment.audioNotes,
          voice: 'alloy',
          model: 'tts-1',
        })

        if (!voiceResult?.audioBase64) {
          console.error('[Retry Segment] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
          console.error('[Retry Segment] Voice result keys:', voiceResult ? Object.keys(voiceResult) : 'null')
          // Don't fail the entire segment if voice synthesis fails - just log and continue
          console.warn(`[Retry Segment ${segmentId}] Voice synthesis failed, continuing without audio`)
        } else {
          const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
          const audioPath = await saveAsset(audioBuffer, 'mp3')
          voiceUrl = audioPath

          await trackCost('voice-synthesis', 0.05, {
            segmentId,
            retry: true,
          })
        }
      } catch (voiceError: any) {
        // Don't fail the entire segment if voice synthesis fails - just log and continue
        console.error(`[Retry Segment ${segmentId}] Voice synthesis error:`, voiceError.message)
        console.warn(`[Retry Segment ${segmentId}] Continuing without audio due to voice synthesis failure`)
      }
    }

    // Store metadata including prediction ID and video URL for frontend access
    const metadata = {
      predictionId,
      videoUrl,
      replicateVideoUrl: videoUrl, // Direct Replicate URL
      voiceUrl,
      segmentIndex: segmentId,
      segmentType: segment.type,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.endTime - segment.startTime,
      timestamp: Date.now(),
      retry: true,
    }

    console.log(`[Retry Segment ${segmentId}] Asset metadata:`, JSON.stringify(metadata, null, 2))

    // Update job asset
    if (job.assets) {
      job.assets[segmentId] = {
        segmentId,
        videoUrl,
        voiceUrl,
        status: 'completed',
        metadata, // Include metadata for frontend access
      }
      job.status = job.assets.every(a => a.status === 'completed') ? 'completed' : 'processing'
      await saveJob(job)
    }

    return {
      success: true,
      asset: job.assets?.[segmentId],
    }
  } catch (error: any) {
    if (job.assets) {
      job.assets[segmentId] = {
        ...job.assets[segmentId],
        status: 'failed',
        error: error.message,
      }
      await saveJob(job)
    }

    throw createError({
      statusCode: 500,
      message: `Failed to retry segment: ${error.message}`,
    })
  }
})

