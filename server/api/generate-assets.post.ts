import { generateAssetsSchema } from '../utils/validation'
import { callReplicateMCP, callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { downloadFile, saveAsset, readFile, cleanupTempFiles, saveVideo } from '../utils/storage'
import { uploadFileToReplicate } from '../utils/replicate-upload'
import { extractFramesFromVideo } from '../utils/ffmpeg'
import { sanitizeVideoPrompt } from '../utils/prompt-sanitizer'
import { checkFrameForChildren } from '../utils/frame-content-checker'
import { detectSceneConflict } from '../utils/scene-conflict-checker'
import { nanoid } from 'nanoid'
import type { GenerationJob, Asset } from '../../app/types/generation'
import { promises as fs } from 'fs'
import path from 'path'

// Helper function to prepare image input for Replicate
// Uploads local files to Replicate and returns public URLs
async function prepareImageInput(filePath: string | undefined | null): Promise<string | undefined> {
  if (!filePath) {
    return undefined
  }

  // Validate file path - check for binary data corruption
  if (typeof filePath !== 'string') {
    console.error('[Prepare Image Input] ERROR: File path is not a string:', typeof filePath, filePath)
    throw new Error(`Invalid file path: path is ${typeof filePath}`)
  }

  // Check for binary data corruption (null bytes, non-printable characters at start)
  const hasNullBytes = filePath.includes('\x00')
  const startsWithNonPrintable = filePath.length > 0 && filePath.charCodeAt(0) < 32 && filePath.charCodeAt(0) !== 9 && filePath.charCodeAt(0) !== 10 && filePath.charCodeAt(0) !== 13
  const containsJpegMarkers = filePath.includes('JFIF') || filePath.includes('Exif') || filePath.includes('JPEG')
  
  // If it looks like binary data, it's corrupted
  if (hasNullBytes || (startsWithNonPrintable && !filePath.startsWith('/') && !filePath.startsWith('http')) || containsJpegMarkers) {
    console.error('[Prepare Image Input] ERROR: File path appears to be corrupted binary data:', filePath.substring(0, 200))
    console.error('[Prepare Image Input] Path length:', filePath.length)
    console.error('[Prepare Image Input] First 50 chars:', Array.from(filePath.substring(0, 50)).map(c => c.charCodeAt(0)).join(','))
    throw new Error(`Invalid file path: path appears to contain binary data instead of a valid file path`)
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


const JOBS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'jobs.json')

export async function saveJob(job: GenerationJob) {
  let jobs: GenerationJob[] = []
  try {
    const content = await fs.readFile(JOBS_FILE, 'utf-8')
    jobs = JSON.parse(content)
  } catch {
    // File doesn't exist, start fresh
  }

  const index = jobs.findIndex(j => j.id === job.id)
  if (index >= 0) {
    jobs[index] = job
  } else {
    jobs.push(job)
  }

  await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true })
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2))
}

export async function getJob(jobId: string): Promise<GenerationJob | null> {
  try {
    const content = await fs.readFile(JOBS_FILE, 'utf-8')
    const jobs: GenerationJob[] = JSON.parse(content)
    return jobs.find(j => j.id === jobId) || null
  } catch {
    return null
  }
}

// Helper function to generate background music
// Analyzes both story content and storyboard content to infer mood/style
async function generateBackgroundMusic(
  storyboard: any,
  totalDuration: number
): Promise<string | null> {
  try {
    console.log('[Music Generation] Starting background music generation')
    
    // Extract story content
    const storyContent = storyboard.promptJourney?.storyGeneration?.output
    const storyText = storyContent
      ? `${storyContent.hook} ${storyContent.bodyOne} ${storyContent.bodyTwo} ${storyContent.callToAction} ${storyContent.description || ''}`
      : ''
    
    // Extract storyboard content
    const storyboardText = storyboard.segments
      .map((seg: any) => `${seg.description} ${seg.visualPrompt || ''}`)
      .join(' ')
    
    // Combine both sources for mood analysis
    const combinedContent = `${storyText} ${storyboardText}`.trim()
    
    if (!combinedContent) {
      console.warn('[Music Generation] No content available for mood analysis')
      return null
    }
    
    // Use OpenAI to analyze mood and generate music prompt
    const moodAnalysisPrompt = `Analyze the following video ad content and determine the appropriate background music style, mood, and genre.

Story Content: ${storyText.substring(0, 500)}
Storyboard Content: ${storyboardText.substring(0, 500)}

Based on the content, provide a concise music prompt (2-3 sentences) that describes:
- The mood/emotion (e.g., energetic, calm, dramatic, playful, professional)
- The music style/genre (e.g., upbeat electronic, calm piano, corporate professional, acoustic folk, dramatic orchestral, ambient soundscape)
- The tempo and energy level

Return ONLY the music description prompt, nothing else.`

    const moodResult = await callOpenAIMCP('chat_completion', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert at analyzing video content and determining appropriate background music.' },
        { role: 'user', content: moodAnalysisPrompt },
      ],
      max_tokens: 150,
    })
    
    let musicPrompt = ''
    if (moodResult && typeof moodResult === 'object') {
      if (moodResult.content && typeof moodResult.content === 'string') {
        musicPrompt = moodResult.content.trim()
      } else if (moodResult.choices && moodResult.choices[0]?.message?.content) {
        musicPrompt = moodResult.choices[0].message.content.trim()
      } else if (typeof moodResult === 'string') {
        musicPrompt = moodResult.trim()
      }
    }
    
    if (!musicPrompt) {
      // Fallback to generic prompt based on ad type or mood
      const adType = storyboard.meta.adType || 'general'
      const mood = storyboard.meta.mood || 'professional'
      musicPrompt = `Background music for ${adType} ad with ${mood} mood, professional quality, suitable for video advertisement`
    }
    
    console.log('[Music Generation] Music prompt:', musicPrompt)
    
    // Generate music via Replicate
    const musicResult = await callReplicateMCP('generate_music', {
      prompt: musicPrompt,
      duration: totalDuration,
      model: 'google/lyria-2',
    })
    
    if (!musicResult?.predictionId) {
      throw new Error('Failed to create music generation prediction')
    }
    
    // Poll for completion
    let predictionStatus = musicResult
    while (predictionStatus.status === 'starting' || predictionStatus.status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 2000))
      predictionStatus = await callReplicateMCP('check_prediction_status', {
        predictionId: musicResult.predictionId,
      })
    }
    
    if (predictionStatus.status !== 'succeeded') {
      throw new Error(`Music generation failed: ${predictionStatus.error || 'Unknown error'}`)
    }
    
    // Get result URL
    const musicUrlResult = await callReplicateMCP('get_prediction_result', {
      predictionId: musicResult.predictionId,
    })
    
    // Replicate may return audio as videoUrl or audioUrl - check both
    const musicUrl = musicUrlResult?.videoUrl || musicUrlResult?.audioUrl || musicUrlResult?.url
    
    if (!musicUrl) {
      throw new Error('Music generation succeeded but no URL returned')
    }
    
    // Download and save music file
    const musicBuffer = Buffer.from(await (await fetch(musicUrl)).arrayBuffer())
    const musicPath = await saveAsset(musicBuffer, 'mp3')
    
    await trackCost('music-generation', 0.20, {
      duration: totalDuration,
      model: 'google/lyria-2',
    })
    
    console.log('[Music Generation] Background music generated:', musicPath)
    return musicPath
  } catch (error: any) {
    console.error('[Music Generation] Error:', error.message)
    console.warn('[Music Generation] Continuing without background music')
    return null
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { storyboard, frames } = generateAssetsSchema.parse(body)
  const jobId = nanoid()

  // Create job
  const job: GenerationJob = {
    id: jobId,
    status: 'processing',
    startTime: Date.now(),
    storyboardId: storyboard.id,
    assets: [],
  }
  await saveJob(job)

  try {
    // Process all 4 segments (Hook, Body1, Body2, CTA)
    // No demo mode - always generate all 4 scene videos
    // Check for demo mode - only process first segment (hook) in demo mode
    const isDemoMode = storyboard.meta.mode === 'demo'
    const segmentsToProcess = isDemoMode 
      ? storyboard.segments.slice(0, 1) // Demo mode: only first segment
      : storyboard.segments.slice(0, 4) // Production mode: all 4 segments
    
    if (isDemoMode) {
      console.log('[Generate Assets] Demo mode: Only generating video for first scene (hook)')
    }

    // Map frames to segments for easy lookup
    const frameMap = new Map<string, { first?: string; last?: string }>()
    if (frames && Array.isArray(frames)) {
      for (const frame of frames) {
        const key = `${frame.segmentIndex}-${frame.frameType}`
        if (!frameMap.has(String(frame.segmentIndex))) {
          frameMap.set(String(frame.segmentIndex), {})
        }
        const segmentFrames = frameMap.get(String(frame.segmentIndex))!
        if (frame.frameType === 'first') {
          segmentFrames.first = frame.imageUrl
        } else if (frame.frameType === 'last') {
          segmentFrames.last = frame.imageUrl
        }
      }
    }

    // Generate assets in parallel for all segments
    const assets: Asset[] = []
    
    console.log(`[Generate Assets] Starting parallel generation of ${segmentsToProcess.length} segments`)
    console.log(`[Generate Assets] Total segments in storyboard: ${storyboard.segments.length}`)
    console.log(`[Generate Assets] Frames provided: ${frames?.length || 0}`)
    
    // Extract segment processing into a function for parallel execution
    const generateSegmentAsset = async (idx: number, segment: any): Promise<Asset> => {
      console.log(`\n[Generate Assets] ===== Starting Segment ${idx + 1}/${segmentsToProcess.length} =====`)
      console.log(`[Segment ${idx}] Type: ${segment.type}, Duration: ${segment.endTime - segment.startTime}s`)
      
      // Log frame images being used
      console.log(`[Segment ${idx}] Frame images:`, {
        hasFirstFrameImage: !!segment.firstFrameImage,
        firstFrameImage: segment.firstFrameImage,
        hasLastFrameImage: !!segment.lastFrameImage,
        lastFrameImage: segment.lastFrameImage,
      })
      
      try {
        // Determine which images to use - only use frame images from generate-frames API or segment
        const segmentFrames = frameMap.get(String(idx))
        const firstFrameImage = segmentFrames?.first || segment.firstFrameImage
        const lastFrameImage = segmentFrames?.last || segment.lastFrameImage

        // Check frame images for children before video generation
        const frameImagesToCheck: string[] = []
        if (firstFrameImage) frameImagesToCheck.push(firstFrameImage)
        if (lastFrameImage) frameImagesToCheck.push(lastFrameImage)
        
        let childrenDetected = false
        if (frameImagesToCheck.length > 0) {
          console.log(`[Segment ${idx}] Checking ${frameImagesToCheck.length} frame image(s) for children in parallel...`)
          const childrenCheckResults = await Promise.all(
            frameImagesToCheck.map(imageUrl => checkFrameForChildren(imageUrl))
          )
          childrenDetected = childrenCheckResults.some(containsChildren => containsChildren)
          if (childrenDetected) {
            frameImagesToCheck.forEach((imageUrl, i) => {
              if (childrenCheckResults[i]) {
                console.warn(`[Segment ${idx}] Children detected in frame image: ${imageUrl}`)
              }
            })
          }
        }

        // Optional safety check: Detect scene conflicts for body segments (log warning only, don't block)
        if (segment.type === 'body' && firstFrameImage) {
          try {
            // Get hook first frame for conflict detection
            const hookSegment = storyboard.segments.find(s => s.type === 'hook')
            const hookFirstFrame = hookSegment?.firstFrameImage
            const hookLastFrame = hookSegment?.lastFrameImage
            
            if (hookFirstFrame || hookLastFrame) {
              const hookFrames = [hookFirstFrame, hookLastFrame].filter(Boolean) as string[]
              if (hookFrames.length > 0 && story) {
                const conflictCheck = await detectSceneConflict(hookFrames, segment, story)
                if (conflictCheck.hasConflict) {
                  const actionTypeInfo = conflictCheck.actionType ? ` (action type: ${conflictCheck.actionType})` : ''
                  console.warn(`[Segment ${idx}] ⚠️ SCENE CONFLICT DETECTED (safety check): ${conflictCheck.item} is already present in hook scene${actionTypeInfo}`)
                  console.warn(`[Segment ${idx}] This is a warning only - video generation will proceed. Consider regenerating the storyboard.`)
                } else if (conflictCheck.actionType === 'interacting') {
                  console.log(`[Segment ${idx}] ✓ No conflict: Action type is "interacting" - item interaction is expected`)
                }
              }
            }
          } catch (conflictError: any) {
            // Don't fail video generation if conflict check fails
            console.warn(`[Segment ${idx}] Conflict check failed (non-blocking):`, conflictError.message)
          }
        }

        // Get model from storyboard meta, default to google/veo-3.1-fast
        const model = storyboard.meta.model || 'google/veo-3.1-fast'

        // Video Generation (Replicate MCP) - use model from storyboard
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
        
        // Extract dialogue from audioNotes and build speaking instructions
        let dialogueInstructions = ''
        let dialogueTextForPrompt = ''
        if (segment.audioNotes) {
          // Check if audioNotes contains dialogue format: "Dialogue: [Character description] says: '[text]'"
          // Handle formats like:
          // - "Dialogue: The man says: 'text'"
          // - "Dialogue: The man with a thoughtful voice says: 'text'"
          // - "Dialogue: The same man says: 'text'"
          const dialogueMatch = segment.audioNotes.match(/Dialogue:\s*(.+?)\s+says:\s*['"](.+?)['"]/i)
          if (dialogueMatch) {
            let characterDescription = dialogueMatch[1].trim()
            let dialogueText = dialogueMatch[2].trim()
            
            // Validate CTA segment word count (must be 5 words or less)
            if (segment.type === 'cta') {
              const wordCount = dialogueText.split(/\s+/).filter(word => word.length > 0).length
              if (wordCount > 5) {
                console.warn(`[Segment ${idx}] CTA dialogue has ${wordCount} words (exceeds 5-word limit): "${dialogueText}"`)
                // Truncate to first 5 words
                const words = dialogueText.split(/\s+/).filter(word => word.length > 0)
                dialogueText = words.slice(0, 5).join(' ')
                console.log(`[Segment ${idx}] Truncated CTA dialogue to 5 words: "${dialogueText}"`)
              } else {
                console.log(`[Segment ${idx}] CTA dialogue word count validated: ${wordCount} words - "${dialogueText}"`)
              }
            }
            
            // Extract tone/voice descriptions before cleaning (e.g., "soft, concerned voice", "confident, clear voice")
            let toneDescription = ''
            const toneMatch = characterDescription.match(/(?:,\s*)?(?:in\s+a\s+)?([^,]+(?:,\s*[^,]+)*\s+voice)/i)
            if (toneMatch) {
              toneDescription = toneMatch[1].trim()
            }
            
            // Clean up character description - keep character identifier but preserve tone separately
            // Keep the character identifier (e.g., "The man", "The same man", "The young woman")
            let cleanCharacterDescription = characterDescription.replace(/\s+with\s+[^,]+(?:,\s*[^,]+)*\s+voice/gi, '')
            cleanCharacterDescription = cleanCharacterDescription.replace(/\s+in\s+a\s+[^,]+(?:,\s*[^,]+)*\s+voice/gi, '')
            cleanCharacterDescription = cleanCharacterDescription.replace(/\s+voice$/gi, '')
            cleanCharacterDescription = cleanCharacterDescription.trim()
            
            // If character description is too long, simplify it but keep tone info
            if (cleanCharacterDescription.length > 50) {
              // Extract just the main character identifier
              const simpleMatch = cleanCharacterDescription.match(/(?:the\s+)?(?:same\s+)?(?:young\s+|elderly\s+|middle-aged\s+)?(man|woman|person|character)/i)
              if (simpleMatch) {
                const baseChar = simpleMatch[1].toLowerCase()
                cleanCharacterDescription = cleanCharacterDescription.includes('same') ? `the same ${baseChar}` : `the ${baseChar}`
              }
            }
            
            // Use clean character description for visual prompts, but preserve tone for dialogue instructions
            characterDescription = cleanCharacterDescription
            
            const segmentDuration = segment.endTime - segment.startTime
            // Dialogue should end 2 seconds before segment ends
            const dialogueEndTime = Math.max(0, segmentDuration - 2)
            // Estimate dialogue duration (roughly 2-3 words per second for natural speech)
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
            
            // Add the actual dialogue text in Veo format so it generates the spoken audio
            // Include tone description if available
            const toneSuffix = toneDescription ? `, ${toneDescription}` : ''
            dialogueTextForPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} says: "${dialogueText}"${toneSuffix}`
            
            // Enhance visual prompt to explicitly include dialogue text and state character is SPEAKING
            if (!sanitizedPrompt.includes(`"${dialogueText}"`) && !sanitizedPrompt.includes(`'${dialogueText}'`)) {
              // Add explicit dialogue to visual prompt at the appropriate timecode with exact matching emphasis
              const toneContext = toneDescription ? ` with ${toneDescription}` : ''
              const dialogueInVisualPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} speaks directly on-camera in English only, saying the EXACT words "${dialogueText}"${toneContext} with clear mouth movements. The character's lips move in sync with each word: "${dialogueText}". The character must speak these exact words precisely - no substitutions, no variations.`
              
              // Insert dialogue description into the visual prompt (before other instructions)
              // We'll prepend it to sanitizedPrompt so it appears early in the prompt
              sanitizedPrompt = `${sanitizedPrompt}${dialogueInVisualPrompt}`
              
              console.log(`[Segment ${idx}] Added dialogue to visual prompt: "${dialogueText}"${toneDescription ? ` with tone: ${toneDescription}` : ''}`)
            }
            
            console.log(`[Segment ${idx}] Extracted dialogue: "${dialogueText}" from character: ${characterDescription}`)
            console.log(`[Segment ${idx}] Dialogue timing: ${startTimecode} to ${endTimecode} (${estimatedDuration.toFixed(1)}s)`)
          } else {
            console.log(`[Segment ${idx}] No dialogue found in audioNotes: ${segment.audioNotes?.substring(0, 100)}`)
          }
        }
        
        // Build segment-specific instructions based on segment type
        // CTA segments need visual progression (end of video), hook/body need smooth transitions
        let segmentSpecificInstructions = ''
        let holdFinalFrameInstruction = ''
        let cameraPerspectiveInstruction = ''
        
        if (segment.type === 'cta') {
          // CTA is the end of the video, not a transition - need visual progression
          cameraPerspectiveInstruction = 'Allow camera movement and angle changes to show progression, ending with a distinct final composition. The video should progress naturally with clear visual changes from start to finish.'
          segmentSpecificInstructions = `CTA VISUAL PROGRESSION REQUIREMENT: This CTA segment is the FINAL segment of the video (not a transition to another segment). It must show clear visual progression from start to finish. The final moment must be visually DISTINCT from the starting moment. Use one or more of these techniques: 1) Change camera angle (switch from medium to close-up, or front to side/three-quarter angle), 2) Add text overlay or logo lockup in the final moment, 3) Change character pose or expression to show transformation, 4) Adjust composition to create a hero shot. The video should progress naturally from the starting frame to a visually distinct final frame. Do NOT hold the final frame static - this is the end of the video, not a transition, so show clear visual progression throughout the segment ending with a distinct hero shot. The final moment should be visually distinct from the starting moment - use different camera angle, composition, or add text/logo overlay. This is the end of the video, not a transition, so show clear visual progression.`
          console.log(`[Segment ${idx}] CTA segment: Applying visual progression instructions (no hold final frame)`)
        } else {
          // Hook and body segments need smooth transitions - hold final frame for next segment
          cameraPerspectiveInstruction = 'Maintain the same camera perspective and same setting throughout.'
          holdFinalFrameInstruction = 'The video should naturally ease into and hold the final frame steady for approximately 0.5 seconds. No transitions, cuts, or effects at the end. The final moment should be stable for smooth continuation into the next scene.'
          console.log(`[Segment ${idx}] ${segment.type} segment: Applying transition instructions (hold final frame for smooth transition)`)
        }
        
        // Add hold-final-frame instruction (conditional), face quality, people count limits, dialogue-only audio instructions, and clothing/jewelry stability
        // Insert dialogue text and instructions BEFORE other instructions so they take priority
        const videoPrompt = `${sanitizedPrompt}${moodInstruction}${dialogueTextForPrompt}${dialogueInstructions} CRITICAL CONTINUOUS SHOT REQUIREMENT: This must be a SINGLE CONTINUOUS SHOT in ONE LOCATION. NO scene changes, NO location changes, NO background changes, NO room changes. The entire segment must take place in the exact same location with the same background, same environment, same surroundings from start to finish. ${cameraPerspectiveInstruction} The video should feel like ONE unbroken moment in ONE place - do NOT change locations, rooms, backgrounds, or environments during this segment. ONE continuous shot, ONE location, ONE background. ${holdFinalFrameInstruction}${segmentSpecificInstructions} AUDIO: 🚨 CRITICAL LANGUAGE REQUIREMENT - ENGLISH ONLY: All spoken dialogue in this video MUST be in English ONLY. ABSOLUTELY NO exceptions. NO foreign languages, NO non-English speech, NO other languages whatsoever. If any character speaks, they must speak ONLY in English. This is a MANDATORY requirement - any non-English speech will result in video rejection. CRITICAL AUDIO REQUIREMENTS - SPOKEN DIALOGUE ONLY: Characters must SPEAK their dialogue ALOUD on-camera - this is SPOKEN DIALOGUE, not voiceover, not thoughts, not narration. Dialogue must come from the character's MOUTH as they speak on-camera. CRITICAL: EXACT DIALOGUE MATCHING - Characters must speak the EXACT words specified in the dialogue text. Do not paraphrase, do not change words, do not add words, do not remove words. Speak each word clearly and precisely. No substitutions, no variations, no gibberish, no made-up words. ABSOLUTELY NO MUSIC: Do NOT generate any background music, soundtrack, instrumental music, background score, or any musical audio whatsoever. Sound effects (SFX) and SPOKEN DIALOGUE are allowed, but NO music of any kind. ONLY on-camera characters visible in the scene may speak - their dialogue must be SPOKEN ALOUD, not heard as thoughts or voiceover. ABSOLUTELY NO narration, NO voiceover, NO off-screen announcer, NO background voices. ABSOLUTELY NO internal thoughts, NO internal monologue, NO thought bubbles, NO voiceover narration. If no character is speaking in a scene, there should be NO speech at all - complete silence. Only characters shown on-camera SPEAKING DIRECTLY to the camera or to other visible characters may have dialogue, and they must SPEAK ONLY in English. All dialogue must be SPOKEN ALOUD by the character on-camera - do NOT generate dialogue as thoughts, voiceover, or narration. If dialogue is present, it must end at least 2 seconds before the scene ends to ensure smooth transitions. CLOTHING & JEWELRY: Characters should already be wearing their clothes and jewelry from the start of the scene. Do NOT show characters putting on or taking off items. Items should be worn consistently throughout the scene. No wardrobe changes during the scene. TYPOGRAPHY & TEXT: If displaying any text, brand names, or product names: Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. Spell exactly as mentioned in prompt with perfect accuracy. Professional kerning, leading, and letter spacing. Sharp, crisp edges - no blurry or distorted text. Minimize decorative or script fonts unless specifically luxury brand requirement. Text should be perfectly readable at any resolution with cinema-quality typography. FACE QUALITY: Limit scene to 3-4 people maximum. Use close-ups and medium shots to ensure sharp faces, clear facial features, detailed faces, professional portrait quality. Avoid large groups, crowds, or more than 4 people.`
        
        const videoParams: any = {
          model,
          prompt: videoPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        if (model === 'google/veo-3.1') {
          // Always use firstFrameImage
          if (firstFrameImage) {
            videoParams.image = await prepareImageInput(firstFrameImage)
            console.log(`[Segment ${idx}] Using first frame image: ${firstFrameImage}`)
          }
          
          // Only use last_frame for non-CTA segments (needed for transitions)
          if (lastFrameImage && segment.type !== 'cta') {
            videoParams.last_frame = await prepareImageInput(lastFrameImage)
            console.log(`[Segment ${idx}] Using last frame image: ${lastFrameImage}`)
          } else if (segment.type === 'cta') {
            // For CTA, don't anchor to last frame - allow visual progression
            // CTA is the end of the video, not a transition, so no need for dual anchoring
            console.log(`[Segment ${idx}] CTA segment: Using only first frame anchor (no last_frame) to allow visual progression`)
          }
          
          // Add subject reference (person reference) if available
          const subjectReference = (segment as any).subjectReference || storyboard.meta.subjectReference
          if (subjectReference) {
            videoParams.subject_reference = await prepareImageInput(subjectReference)
            console.log(`[Segment ${idx}] Using subject reference (person): ${subjectReference}`)
          }
          
          // Build negative prompt - add children-related terms if detected in frames, scene change terms, language/narration terms, music terms, and default face quality terms
          const defaultFaceQualityNegative = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy, scene changes, location changes, background changes, different rooms, different locations, multiple settings, changing environments, narration, voiceover, off-screen voices, foreign languages, non-English speech, non-English dialogue, foreign dialogue, foreign speech, background narration, announcer, other languages, background music, soundtrack, instrumental music, background score, music, musical score, musical audio'
          let negativePrompt = defaultFaceQualityNegative
          
          if (childrenDetected) {
            negativePrompt = `${defaultFaceQualityNegative}, no children, no kids, no minors, no toddlers, only adults`
            console.log(`[Segment ${idx}] Adding children-related negative prompt due to frame content detection`)
          }
          
          // Priority: segment.negativePrompt > storyboard.meta.negativePrompt > auto-generated
          if ((segment as any).negativePrompt) {
            videoParams.negative_prompt = childrenDetected 
              ? `${(segment as any).negativePrompt}, ${negativePrompt}`
              : `${(segment as any).negativePrompt}, ${defaultFaceQualityNegative}`
            console.log(`[Segment ${idx}] Using segment-specific negative prompt`)
          } else if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = childrenDetected
              ? `${storyboard.meta.negativePrompt}, ${negativePrompt}`
              : `${storyboard.meta.negativePrompt}, ${defaultFaceQualityNegative}`
          } else {
            videoParams.negative_prompt = negativePrompt
          }
          
          // Priority: segment.resolution > storyboard.meta.resolution
          if ((segment as any).resolution) {
            videoParams.resolution = (segment as any).resolution
            console.log(`[Segment ${idx}] Using segment-specific resolution: ${(segment as any).resolution}`)
          } else if (storyboard.meta.resolution) {
            videoParams.resolution = storyboard.meta.resolution
          }
          
          // Enable Veo native audio generation for dialogue-only audio
          videoParams.generate_audio = true
          console.log(`[Segment ${idx}] Audio generation enabled (Veo will generate dialogue-only audio)`)
          
          // Priority: segment.seed > storyboard.meta.seed
          if ((segment as any).seed !== undefined && (segment as any).seed !== null) {
            videoParams.seed = (segment as any).seed
            console.log(`[Segment ${idx}] Using segment-specific seed: ${(segment as any).seed}`)
          } else if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
            videoParams.seed = storyboard.meta.seed
          }
        } else if (model === 'google/veo-3-fast') {
          // Veo 3 Fast only supports: prompt, aspect_ratio, duration, image, negative_prompt, resolution, generate_audio, seed
          // Note: Does NOT support last_frame or reference_images
          // Always use firstFrameImage from frames
          if (firstFrameImage) {
            videoParams.image = await prepareImageInput(firstFrameImage)
            console.log(`[Segment ${idx}] Using first frame image: ${firstFrameImage}`)
          }
        } else if (model === 'google/veo-3.1-fast') {
          // Veo 3.1 Fast supports: prompt, aspect_ratio, duration, image, last_frame, negative_prompt, resolution, generate_audio, seed
          // Note: Does NOT support reference_images (subject_reference)
          // Always use firstFrameImage
          if (firstFrameImage) {
            videoParams.image = await prepareImageInput(firstFrameImage)
            console.log(`[Segment ${idx}] Using first frame image: ${firstFrameImage}`)
          }
          
          // Only use last_frame for non-CTA segments (needed for transitions)
          if (lastFrameImage && segment.type !== 'cta') {
            videoParams.last_frame = await prepareImageInput(lastFrameImage)
            console.log(`[Segment ${idx}] Using last frame image: ${lastFrameImage}`)
          } else if (segment.type === 'cta') {
            // For CTA, don't anchor to last frame - allow visual progression
            // CTA is the end of the video, not a transition, so no need for dual anchoring
            console.log(`[Segment ${idx}] CTA segment: Using only first frame anchor (no last_frame) to allow visual progression`)
          }
          
          // Build negative prompt with default face quality terms
          const defaultFaceQualityNegative = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy'
          
          // Priority: segment.negativePrompt > storyboard.meta.negativePrompt > auto-generated
          if ((segment as any).negativePrompt) {
            videoParams.negative_prompt = `${(segment as any).negativePrompt}, ${defaultFaceQualityNegative}`
            console.log(`[Segment ${idx}] Using segment-specific negative prompt`)
          } else if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = `${storyboard.meta.negativePrompt}, ${defaultFaceQualityNegative}`
          } else {
            videoParams.negative_prompt = defaultFaceQualityNegative
          }
          
          // Priority: segment.resolution > storyboard.meta.resolution
          if ((segment as any).resolution) {
            videoParams.resolution = (segment as any).resolution
            console.log(`[Segment ${idx}] Using segment-specific resolution: ${(segment as any).resolution}`)
          } else if (storyboard.meta.resolution) {
            videoParams.resolution = storyboard.meta.resolution
          }
          
          // Enable Veo native audio generation for dialogue-only audio
          videoParams.generate_audio = true
          console.log(`[Segment ${idx}] Audio generation enabled (Veo will generate dialogue-only audio)`)
          
          // Priority: segment.seed > storyboard.meta.seed
          if ((segment as any).seed !== undefined && (segment as any).seed !== null) {
            videoParams.seed = (segment as any).seed
            console.log(`[Segment ${idx}] Using segment-specific seed: ${(segment as any).seed}`)
          } else if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
            videoParams.seed = storyboard.meta.seed
          }
        }

        console.log(`[Segment ${idx}] Calling Replicate MCP generate_video with params:`, JSON.stringify(videoParams, null, 2))
        const videoResult = await callReplicateMCP('generate_video', videoParams)
        console.log(`[Segment ${idx}] Replicate MCP generate_video response:`, JSON.stringify(videoResult, null, 2))

        // Check if the response contains an error
        if (videoResult && typeof videoResult === 'object' && 'error' in videoResult) {
          console.error(`[Segment ${idx}] Replicate MCP returned error:`, videoResult.error)
          return {
            segmentId: idx,
            status: 'failed',
            error: `Video generation error: ${videoResult.error}`,
            metadata: { response: videoResult },
          } as Asset
        }

        // Track cost
        await trackCost('video-generation', 0.15, {
          segmentId: idx,
          duration: segment.endTime - segment.startTime,
        })

        // Poll for completion
        let predictionStatus = videoResult
        console.log(`[Segment ${idx}] Initial prediction status:`, JSON.stringify(predictionStatus, null, 2))
        console.log(`[Segment ${idx}] Response type:`, typeof predictionStatus)
        console.log(`[Segment ${idx}] Is array:`, Array.isArray(predictionStatus))
        console.log(`[Segment ${idx}] Response keys:`, predictionStatus ? Object.keys(predictionStatus) : 'null/undefined')
        
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
                            
        console.log(`[Segment ${idx}] Extracted prediction ID:`, predictionId)
        
        if (!predictionId) {
          const errorDetails = {
            segmentId: idx,
            response: videoResult,
            responseKeys: videoResult ? Object.keys(videoResult) : [],
            responseType: typeof videoResult,
            isArray: Array.isArray(videoResult),
            stringified: JSON.stringify(videoResult, null, 2),
            model: videoParams.model,
          }
          console.error(`[Segment ${idx}] Invalid video result - missing prediction ID:`, JSON.stringify(errorDetails, null, 2))
          
          // Store error details in asset for frontend access
          return {
            segmentId: idx,
            status: 'failed',
            error: `Invalid response from video generation: missing prediction ID. Model: ${videoParams.model}. Please check the response structure for this model.`,
            metadata: errorDetails,
          } as Asset
        }
        
        console.log('[Generate Assets] Starting prediction with ID:', predictionId)
        
        let retryAttempted = false
        let currentVideoParams = videoParams
        let currentPredictionId = predictionId
        let currentPredictionStatus = predictionStatus
        
        while (currentPredictionStatus.status === 'starting' || currentPredictionStatus.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 2000))
          currentPredictionStatus = await callReplicateMCP('check_prediction_status', {
            predictionId: currentPredictionId,
          })
        }

        // Check for E005 error (sensitive content flagging)
        const isE005Error = currentPredictionStatus.status !== 'succeeded' && 
                           (currentPredictionStatus.error?.includes('E005') || 
                            currentPredictionStatus.error?.toLowerCase().includes('sensitive') ||
                            currentPredictionStatus.error?.toLowerCase().includes('flagged'))
        
        if (isE005Error && !retryAttempted) {
          console.warn(`[Segment ${idx}] E005 error detected: ${currentPredictionStatus.error}`)
          console.log(`[Segment ${idx}] Retrying with modified prompt to add professional context`)
          
          // Sanitize the videoPrompt again before retry (in case it wasn't sanitized initially)
          const sanitizedVideoPrompt = sanitizeVideoPrompt(videoPrompt)
          
          // Modify prompt to add professional product showcase context and product name accuracy
          const modifiedPrompt = `${sanitizedVideoPrompt}, professional product showcase, safe for all audiences, appropriate content. TYPOGRAPHY & TEXT: If displaying any text, brand names, or product names: Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. Spell exactly as mentioned in prompt with perfect accuracy. Professional kerning, leading, and letter spacing. Sharp, crisp edges - no blurry or distorted text. Text should be perfectly readable at any resolution with cinema-quality typography.`
          currentVideoParams = {
            ...videoParams,
            prompt: modifiedPrompt,
          }
          
          // Retry video generation
          retryAttempted = true
          console.log(`[Segment ${idx}] Retrying with modified prompt:`, modifiedPrompt)
          
          const retryVideoResult = await callReplicateMCP('generate_video', currentVideoParams)
          
          // Check if retry response contains an error
          if (retryVideoResult && typeof retryVideoResult === 'object' && 'error' in retryVideoResult) {
            console.error(`[Segment ${idx}] Retry failed with error:`, retryVideoResult.error)
            throw new Error(`Video generation error (retry): ${retryVideoResult.error}`)
          }
          
          // Get new prediction ID
          currentPredictionId = retryVideoResult.predictionId || retryVideoResult.id || (retryVideoResult as any)?.prediction_id
          if (!currentPredictionId) {
            throw new Error(`Retry failed: missing prediction ID in response`)
          }
          
          console.log(`[Segment ${idx}] Retry prediction ID:`, currentPredictionId)
          
          // Track retry cost
          await trackCost('video-generation', 0.15, {
            segmentId: idx,
            duration: segment.endTime - segment.startTime,
            retry: true,
          })
          
          // Poll for retry completion
          currentPredictionStatus = retryVideoResult
          while (currentPredictionStatus.status === 'starting' || currentPredictionStatus.status === 'processing') {
            await new Promise(resolve => setTimeout(resolve, 2000))
            currentPredictionStatus = await callReplicateMCP('check_prediction_status', {
              predictionId: currentPredictionId,
            })
          }
        }
        
        if (currentPredictionStatus.status !== 'succeeded') {
          const errorMsg = currentPredictionStatus.error || 'Unknown error'
          throw new Error(`Video generation failed${retryAttempted ? ' (after retry)' : ''}: ${errorMsg}`)
        }
        
        // Update predictionId and predictionStatus for rest of the code
        predictionId = currentPredictionId
        predictionStatus = currentPredictionStatus

        const videoResultFinal = await callReplicateMCP('get_prediction_result', {
          predictionId: predictionId,
        })
        
        // Track retry in metadata if retry was attempted
        if (retryAttempted) {
          console.log(`[Segment ${idx}] Video generation succeeded after retry`)
        }

        const videoUrl = videoResultFinal?.videoUrl
        if (!videoUrl) {
          const errorDetails = {
            segmentId: idx,
            predictionId,
            finalResult: videoResultFinal,
            finalResultKeys: Object.keys(videoResultFinal || {}),
          }
          console.error(`[Segment ${idx}] No videoUrl in result:`, JSON.stringify(errorDetails, null, 2))
          
          // Store error details in asset for frontend access
          return {
            segmentId: idx,
            status: 'failed',
            error: `Video generation completed but no video URL was returned`,
            metadata: {
              predictionId,
              predictionStatus,
              finalResult: videoResultFinal,
            },
          } as Asset
        }

        console.log(`[Segment ${idx}] Video URL obtained from Replicate:`, videoUrl)
        console.log(`[Segment ${idx}] Downloading and uploading to S3...`)
        
        // Download video from Replicate and upload to S3
        let finalVideoUrl = videoUrl // Default to Replicate URL
        try {
          const videoResponse = await fetch(videoUrl)
          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.statusText}`)
          }
          
          const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())
          console.log(`[Segment ${idx}] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB from Replicate`)
          
          // Upload to S3 in ai_videos folder
          finalVideoUrl = await saveVideo(videoBuffer, `segment-${idx}-${nanoid()}.mp4`, 'ai_videos')
          console.log(`[Segment ${idx}] Video uploaded to S3 (ai_videos/):`, finalVideoUrl)
        } catch (s3Error: any) {
          console.error(`[Segment ${idx}] Failed to upload video to S3:`, s3Error.message)
          console.warn(`[Segment ${idx}] Falling back to Replicate URL`)
          // Keep Replicate URL as fallback
        }

        console.log(`[Segment ${idx}] Final video URL:`, finalVideoUrl)
        console.log(`[Segment ${idx}] Prediction ID:`, predictionId)

        // Audio is embedded in Veo-generated video - no separate audio generation needed

        // Store metadata including prediction ID and video URL for frontend access
        const metadata = {
          predictionId,
          videoUrl: finalVideoUrl, // S3 URL or Replicate URL (fallback)
          replicateVideoUrl: videoUrl, // Original Replicate URL
          s3VideoUrl: finalVideoUrl !== videoUrl ? finalVideoUrl : undefined, // S3 URL if uploaded
          segmentIndex: idx,
          segmentType: segment.type,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.endTime - segment.startTime,
          timestamp: Date.now(),
          retryAttempted, // Track if retry was used
        }

        console.log(`[Segment ${idx}] Asset metadata:`, JSON.stringify(metadata, null, 2))

        return {
          segmentId: idx,
          videoUrl: finalVideoUrl, // Use S3 URL or Replicate fallback (contains embedded audio)
          status: 'completed',
          metadata, // Include metadata for frontend access
        } as Asset
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred'
        console.error(`[Segment ${idx}] Asset generation failed:`, errorMessage)
        console.error(`[Segment ${idx}] Error details:`, error)
        if (error.stack) {
          console.error(`[Segment ${idx}] Stack trace:`, error.stack)
        }
        return {
          segmentId: idx,
          status: 'failed',
          error: errorMessage,
        } as Asset
      }
    }
    
    // Generate all segments in parallel
    const segmentPromises = segmentsToProcess.map((segment, idx) => 
      generateSegmentAsset(idx, segment)
    )
    
    console.log(`[Generate Assets] Executing ${segmentPromises.length} segment generations in parallel...`)
    const segmentResults = await Promise.allSettled(segmentPromises)
    
    // Process results and update job status incrementally
    for (const [idx, result] of segmentResults.entries()) {
      if (result.status === 'fulfilled') {
        const asset = result.value
        assets.push(asset)
        
        console.log(`[Segment ${idx}] Asset generation completed. Status: ${asset.status}`)
        if (asset.status === 'completed') {
          console.log(`[Segment ${idx}] Video URL: ${asset.videoUrl || 'none'}`)
        } else if (asset.status === 'failed') {
          console.log(`[Segment ${idx}] Error: ${asset.error || 'unknown'}`)
        }
        
        // Update job with current progress as each segment completes
        job.assets = assets
        const allCompleted = assets.every(a => a.status === 'completed')
        const someFailed = assets.some(a => a.status === 'failed')
        job.status = allCompleted 
          ? 'completed' 
          : someFailed 
            ? 'failed' 
            : 'processing'
        
        console.log(`[Segment ${idx}] Job status updated: ${job.status} (completed: ${assets.filter(a => a.status === 'completed').length}/${assets.length})`)
        await saveJob(job)
      } else {
        console.error(`[Segment ${idx}] Segment generation failed:`, result.reason)
        assets.push({
          segmentId: idx,
          status: 'failed',
          error: result.reason?.message || 'Unknown error',
        } as Asset)
        
        // Update job status
        job.assets = assets
        job.status = 'failed'
        await saveJob(job)
      }
    }
    
    console.log(`[Generate Assets] All segments processed. Total assets: ${assets.length}`)
    console.log(`[Generate Assets] Completed: ${assets.filter(a => a.status === 'completed').length}, Failed: ${assets.filter(a => a.status === 'failed').length}`)

    // Generate background music (single continuous track for entire video)
    const totalDuration = Math.max(...storyboard.segments.map((s: any) => s.endTime), 0)
    console.log(`[Generate Assets] Generating background music for ${totalDuration}s duration...`)
    const musicUrl = await generateBackgroundMusic(storyboard, totalDuration)
    if (musicUrl) {
      console.log(`[Generate Assets] Background music generated: ${musicUrl}`)
      // Store music URL in job metadata for later use in composition
      if (!job.assets) job.assets = []
      // We'll store this in a special way or pass it through to composition
    } else {
      console.warn(`[Generate Assets] Background music generation failed or skipped`)
    }
    
    // Store music URL in job for composition
    if (musicUrl) {
      job.musicUrl = musicUrl
      console.log(`[Generate Assets] Music URL stored in job: ${musicUrl}`)
    }
    
    // Audio is embedded in Veo-generated videos - no separate audio generation needed
    console.log(`[Generate Assets] Audio generation completed (embedded in video files)`)

    // Update job
    job.assets = assets
    job.status = assets.every(a => a.status === 'completed') ? 'completed' : 'failed'
    job.endTime = Date.now()
    await saveJob(job)

    return { jobId, assets, musicUrl }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error occurred'
    console.error('[Generation Job] Overall failure:', errorMessage)
    console.error('[Generation Job] Error details:', error)
    if (error.stack) {
      console.error('[Generation Job] Stack trace:', error.stack)
    }
    job.status = 'failed'
    job.error = errorMessage
    job.endTime = Date.now()
    await saveJob(job)
    throw createError({
      statusCode: 500,
      message: `Failed to generate assets: ${errorMessage}`,
    })
  }
})

