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
    let additionalMusicInstructions = ''
    const adType = storyboard.meta.adType?.toLowerCase() || ''
    
    if (adType.includes('skincare') || adType.includes('skin care') || adType.includes('beauty')) {
      additionalMusicInstructions = 'IMPORTANT: For Skincare ads, music MUST be "upbeat but soft". Not too loud. Spa-like, clean, minimal, refreshing, high-end background music. Avoid heavy bass or aggressive beats. Think "luxury spa" or "morning routine".'
    }

    const moodAnalysisPrompt = `Analyze the following video ad content and determine the appropriate background music style, mood, and genre.

Story Content: ${storyText.substring(0, 500)}
Storyboard Content: ${storyboardText.substring(0, 500)}
Ad Type: ${adType}

${additionalMusicInstructions}

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
    // Validate that all segments have dialogue (mandatory requirement)
    const allSegmentsHaveDialogue = storyboard.segments.every((segment: any) => {
      const audioNotes = segment.audioNotes || ''
      return audioNotes && (
        /Dialogue:\s*[^:]+?\s+says:\s*['"]/i.test(audioNotes) ||
        /Voiceover:/i.test(audioNotes)
      )
    })
    
    if (!allSegmentsHaveDialogue) {
      const missingSegments = storyboard.segments
        .map((seg: any, idx: number) => {
          const audioNotes = seg.audioNotes || ''
          const hasDialogue = audioNotes && (
            /Dialogue:\s*[^:]+?\s+says:\s*['"]/i.test(audioNotes) ||
            /Voiceover:/i.test(audioNotes)
          )
          return hasDialogue ? null : `${seg.type} (segment ${idx})`
        })
        .filter(Boolean)
      
      console.error(`[Generate Assets] ❌ Missing dialogue in segments: ${missingSegments.join(', ')} - this violates mandatory dialogue requirement`)
      throw new Error(`Cannot generate videos: Missing dialogue in segments: ${missingSegments.join(', ')}. All scenes must have dialogue before video generation can proceed.`)
    }
    
    console.log('[Generate Assets] ✓ All segments have dialogue (mandatory requirement satisfied)')
    
    // Process segments based on storyboard format
    // Check for demo mode - only process first segment (hook) in demo mode
    // Production mode: process all segments (3 for 16s format, 4 for 24s format)
    const isDemoMode = storyboard.meta.mode === 'demo'
    const segmentsToProcess = isDemoMode 
      ? storyboard.segments.slice(0, 1) // Demo mode: only first segment
      : storyboard.segments // Production mode: all segments (3 for 16s, 4 for 24s)
    
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
        // Pass segment type for context-aware sanitization (especially for CTA segments)
        let sanitizedPrompt = sanitizeVideoPrompt(selectedPrompt, undefined, segment.type as 'hook' | 'body' | 'cta')
        
        // Apply additional CTA-specific sanitization for beauty/skincare terms
        if (segment.type === 'cta') {
          console.log(`[Segment ${idx}] Applying CTA-specific prompt sanitization`)
          // Additional sanitization pass specifically for CTA segments
          // Replace any remaining beauty/skincare terms that might trigger filters
          sanitizedPrompt = sanitizeVideoPrompt(sanitizedPrompt, undefined, 'cta')
          
          // Add explicit professional product advertising context to CTA prompts
          // This helps content moderation understand this is legitimate product advertising
          sanitizedPrompt = `${sanitizedPrompt}, professional product advertisement, safe for all audiences, appropriate commercial content, legitimate product showcase`
          
          console.log(`[Segment ${idx}] CTA prompt after sanitization: ${sanitizedPrompt.substring(0, 200)}...`)
        }
        
        // Extract mood from storyboard meta
        const mood = storyboard.meta.mood || 'professional'
        const moodInstruction = mood ? ` ${mood.charAt(0).toUpperCase() + mood.slice(1)} tone and mood.` : ''
        
        // Add hand consistency instruction for video generation
        // Extract hand preference from first segment where product appears
        let handConsistencyInstruction = ''
        let firstProductHand: 'left' | 'right' | null = null
        for (const seg of storyboard.segments) {
          const visualPrompt = seg.visualPrompt || ''
          const hasProduct = /(?:product|bottle|container|item|package|tube|jar|pump|dropper|serum|cream|moisturizer|makeup|cosmetic|lipstick|foundation|holds?|holding|grasps?|grasping)/i.test(visualPrompt)
          if (hasProduct) {
            if (/\b(left\s+hand|left\s+arm|in\s+left|left\s+side|left\s+grip|left\s+grasp)\b/i.test(visualPrompt.toLowerCase())) {
              firstProductHand = 'left'
              break
            } else if (/\b(right\s+hand|right\s+arm|in\s+right|right\s+side|right\s+grip|right\s+grasp)\b/i.test(visualPrompt.toLowerCase())) {
              firstProductHand = 'right'
              break
            }
          }
        }
        
        if (firstProductHand) {
          handConsistencyInstruction = ` 🚨🚨🚨 CRITICAL PRODUCT HAND CONSISTENCY - MANDATORY: The character MUST hold the product in the ${firstProductHand} hand throughout this entire video segment. This maintains continuity from previous segments. Do NOT switch hands - the product must remain in the ${firstProductHand} hand. This is a MANDATORY requirement for visual consistency. `
        }
        
        // Extract dialogue from audioNotes and build speaking instructions
        let dialogueInstructions = ''
        let dialogueTextForPrompt = ''
        if (segment.audioNotes) {
          // Check if audioNotes contains dialogue format: "Dialogue: [Character description] says: '[text]'"
          // Handle formats like:
          // - "Dialogue: The man says: 'text'"
          // - "Dialogue: The man with a thoughtful voice says: 'text'"
          // - "Dialogue: The same man says: 'text'"
          // - "Dialogue: The man says with a deadpan tone: 'text'" (tone between says and colon)
          // - "Dialogue: The man says in a soft voice: 'text'" (tone between says and colon)
          // Use improved parsing that captures complete dialogue text (handles apostrophes and special characters)
          const { parseDialogue } = await import('../../app/utils/dialogue-parser')
          const parsedDialogue = parseDialogue(segment.audioNotes)
          let dialogueMatch: RegExpMatchArray | null = null
          if (parsedDialogue) {
            // Reconstruct match array format for compatibility
            dialogueMatch = [
              segment.audioNotes, // full match
              parsedDialogue.character, // character group
              parsedDialogue.dialogueText // dialogue text group
            ] as RegExpMatchArray
          }
          if (dialogueMatch) {
            let characterDescription = dialogueMatch[1].trim()
            let dialogueText = dialogueMatch[2].trim()
            
            // Extract tone description from between "says" and ":" if present
            // Example: "says with a deadpan tone:" or "says in a soft voice:"
            let toneFromSays = ''
            const saysMatch = segment.audioNotes.match(/says\s+([^:]+):/i)
            if (saysMatch) {
              const saysText = saysMatch[1].trim()
              // Check if it's a tone description (contains words like "with", "in", "tone", "voice")
              if (/\b(with|in|tone|voice|emotion|manner|way)\b/i.test(saysText)) {
                toneFromSays = saysText
                console.log(`[Segment ${idx}] Extracted tone from "says" clause: "${toneFromSays}"`)
              }
            }
            
            // Validate CTA segment word count (must be 5 words or less)
            if (segment.type === 'cta') {
              const wordCount = dialogueText.split(/\s+/).filter((word: string) => word.length > 0).length
              if (wordCount > 5) {
                console.error(`[Segment ${idx}] ❌ CTA dialogue has ${wordCount} words (exceeds 5-word limit): "${dialogueText}"`)
                console.error(`[Segment ${idx}] ❌ This should NOT happen - the AI model should never generate CTA dialogue exceeding 5 words.`)
                console.error(`[Segment ${idx}] ❌ The segment will be marked as failed. The storyboard should have been validated and retried during generation.`)
                // DO NOT truncate - reject the segment instead
                throw new Error(`CTA dialogue exceeds 5-word limit: "${dialogueText}" (${wordCount} words). The storyboard generation should have prevented this. Please regenerate the storyboard - the system will automatically retry with stronger instructions if CTA dialogue exceeds 5 words.`)
              } else {
                console.log(`[Segment ${idx}] ✓ CTA dialogue word count validated: ${wordCount} words - "${dialogueText}"`)
              }
              
              // Validate that dialogue text is complete (not corrupted or cut off)
              if (dialogueText.trim().length === 0) {
                console.warn(`[Segment ${idx}] CTA dialogue is empty after processing`)
              } else if (dialogueText.trim().endsWith('*') || dialogueText.trim().endsWith('...') || dialogueText.trim().endsWith('…') || dialogueText.includes('*gibberish') || dialogueText.includes('*incomplete')) {
                console.warn(`[Segment ${idx}] CTA dialogue appears incomplete or corrupted: "${dialogueText}"`)
                // Try to clean up - remove trailing incomplete markers and gibberish
                dialogueText = dialogueText.trim()
                  .replace(/[*…]+$/, '')
                  .replace(/\*gibberish.*$/i, '')
                  .replace(/\*incomplete.*$/i, '')
                  .trim()
                if (dialogueText.length === 0) {
                  console.error(`[Segment ${idx}] CTA dialogue became empty after cleanup - original was corrupted`)
                } else {
                  // Re-validate word count after cleanup
                  const cleanedWordCount = dialogueText.split(/\s+/).filter((word: string) => word.length > 0).length
                  if (cleanedWordCount > 5) {
                    console.error(`[Segment ${idx}] ❌ CTA dialogue still has ${cleanedWordCount} words after cleanup (exceeds 5-word limit): "${dialogueText}"`)
                    console.error(`[Segment ${idx}] ❌ This should NOT happen - the AI model should never generate CTA dialogue exceeding 5 words.`)
                    console.error(`[Segment ${idx}] ❌ The segment will be marked as failed. The storyboard should have been validated and retried during generation.`)
                    // DO NOT truncate - reject the segment instead
                    throw new Error(`CTA dialogue exceeds 5-word limit after cleanup: "${dialogueText}" (${cleanedWordCount} words). The storyboard generation should have prevented this. Please regenerate the storyboard - the system will automatically retry with stronger instructions if CTA dialogue exceeds 5 words.`)
                  }
                }
              }
            }
            
            // Extract tone/voice descriptions before cleaning (e.g., "soft, concerned voice", "confident, clear voice")
            // Priority: tone from "says" clause > tone from character description
            let toneDescription = ''
            if (toneFromSays) {
              // Use tone from "says" clause if found
              toneDescription = toneFromSays
            } else {
              // Fall back to extracting from character description
              const toneMatch = characterDescription.match(/(?:,\s*)?(?:in\s+a\s+)?([^,]+(?:,\s*[^,]+)*\s+voice)/i)
              if (toneMatch) {
                toneDescription = toneMatch[1].trim()
              }
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

CRITICAL: EXACT DIALOGUE MATCHING - The character must speak the EXACT words: "${dialogueText}". Do not paraphrase, do not change words, do not add words, do not remove words. Speak each word clearly and precisely. The character must say exactly: "${dialogueText}" - no substitutions, no variations, no gibberish, no made-up words. CRITICAL: Speak the COMPLETE dialogue text from start to finish. Do NOT cut off, truncate, or corrupt any words. Say the entire phrase clearly and completely: "${dialogueText}". Every single word must be spoken clearly and fully.${toneInstruction}

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

The character's mouth movements must match the words being SPOKEN ALOUD: "${dialogueText}". This is SPOKEN DIALOGUE, not thoughts or voiceover. CRITICAL: Speak the COMPLETE phrase "${dialogueText}" from beginning to end. Do NOT cut off mid-word, mid-phrase, or truncate the dialogue. Say every word completely and clearly.

${segment.type === 'cta' ? `🚨🚨🚨 CRITICAL: CTA DIALOGUE - STOP SPEAKING IMMEDIATELY AFTER DIALOGUE ENDS - ABSOLUTE MANDATORY REQUIREMENT (ZERO TOLERANCE) 🚨🚨🚨: This is a CTA (Call-to-Action) segment. After [${endTimecode}], the character MUST STOP speaking IMMEDIATELY and COMPLETELY. The character must be ABSOLUTELY SILENT for the remainder of the segment. Do NOT continue speaking, do NOT add extra words, do NOT generate gibberish, do NOT make sounds, do NOT speak beyond the dialogue timecode, do NOT add any additional speech, do NOT continue the dialogue, do NOT extend the dialogue, do NOT add filler words, do NOT add random sounds, do NOT add unintelligible speech. The character must remain COMPLETELY SILENT after saying "${dialogueText}". This is a HARD REQUIREMENT with ZERO TOLERANCE - any speech, sounds, gibberish, or additional words after [${endTimecode}] will result in video rejection. The CTA dialogue "${dialogueText}" must be the FINAL and ONLY words spoken in this segment.` : `🚨🚨🚨 CRITICAL: STOP SPEAKING AFTER DIALOGUE ENDS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: After [${endTimecode}], the character must STOP speaking completely. The character must be SILENT for the remainder of the segment. Do NOT continue speaking, do NOT add extra words, do NOT generate gibberish, do NOT make sounds, do NOT speak beyond the dialogue timecode. The character must remain completely silent after saying "${dialogueText}". This is a HARD REQUIREMENT - any speech, sounds, or gibberish after [${endTimecode}] will result in video rejection.`}`
            
            // Add the actual dialogue text in Veo format so it generates the spoken audio
            // Include tone description if available
            const toneSuffix = toneDescription ? `, ${toneDescription}` : ''
            dialogueTextForPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} says: "${dialogueText}"${toneSuffix}`
            
            // Enhance visual prompt to explicitly include dialogue text and state character is SPEAKING
            if (!sanitizedPrompt.includes(`"${dialogueText}"`) && !sanitizedPrompt.includes(`'${dialogueText}'`)) {
              // Add explicit dialogue to visual prompt at the appropriate timecode with exact matching emphasis
              const toneContext = toneDescription ? ` with ${toneDescription}` : ''
              const dialogueInVisualPrompt = ` [${startTimecode}-${endTimecode}] The ${characterDescription} speaks directly on-camera in English only, saying the EXACT COMPLETE words "${dialogueText}"${toneContext} with clear mouth movements. The character's lips move in sync with each word: "${dialogueText}". The character must speak these exact words precisely from start to finish - no substitutions, no variations, no truncation, no cut-off words. Speak the COMPLETE phrase: "${dialogueText}".`
              
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
        } else {
          // No audioNotes at all - explicitly prevent any audio generation
          console.log(`[Segment ${idx}] No audioNotes provided - preventing all audio generation`)
        }
        
        // Add explicit no-audio instruction if no dialogue was found
        let noAudioInstruction = ''
        if (!dialogueInstructions && !dialogueTextForPrompt) {
          noAudioInstruction = `🚨🚨🚨 CRITICAL NO-AUDIO REQUIREMENT - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: This segment has NO dialogue and NO audio should be generated. This is a HARD REQUIREMENT with ZERO TOLERANCE. DO NOT generate ANY of the following: spoken dialogue, voiceover, narration, background voices, character speech, human speech, any language (English or otherwise), music, soundtracks, background music, sound effects (SFX), ambient noise, or ANY audio whatsoever. The video must be COMPLETELY SILENT with ZERO audio output. This segment is intentionally silent - no characters speak, no narration occurs, no music plays, no sounds are generated. ABSOLUTELY NO audio should be present in this video segment. Any audio generated will result in video rejection. This is a MANDATORY requirement - the video must be completely silent. `
          console.log(`[Segment ${idx}] Added explicit no-audio instruction (no dialogue provided)`)
        }
        
        // Add silence-after-dialogue instruction if dialogue exists
        let silenceAfterDialogueInstruction = ''
        if (dialogueInstructions && dialogueTextForPrompt) {
          // Extract endTimecode from dialogueTextForPrompt or use segment end time
          const segmentDuration = segment.endTime - segment.startTime
          const formatTimecode = (seconds: number): string => {
            const mins = Math.floor(seconds / 60)
            const secs = Math.floor(seconds % 60)
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
          }
          const dialogueEndTimecode = formatTimecode(Math.min(segmentDuration - 2, segmentDuration * 0.7))
          silenceAfterDialogueInstruction = segment.type === 'cta' 
            ? ` 🚨🚨🚨 CRITICAL: CTA DIALOGUE - ABSOLUTE SILENCE AFTER DIALOGUE ENDS - MANDATORY REQUIREMENT (ZERO TOLERANCE) 🚨🚨🚨: This is a CTA (Call-to-Action) segment. After the dialogue ends (after [${dialogueEndTimecode}]), the character MUST STOP speaking IMMEDIATELY and remain ABSOLUTELY SILENT for the remainder of the segment. Do NOT continue speaking, do NOT add extra words, do NOT generate gibberish, do NOT make sounds, do NOT speak beyond the dialogue timecode, do NOT add any additional speech, do NOT continue the dialogue, do NOT extend the dialogue, do NOT add filler words, do NOT add random sounds, do NOT add unintelligible speech. The character must remain COMPLETELY SILENT after finishing the dialogue. This is a HARD REQUIREMENT with ZERO TOLERANCE - any speech, sounds, gibberish, or additional words after the dialogue ends will result in video rejection. The CTA dialogue must be the FINAL and ONLY words spoken in this segment. `
            : ` 🚨🚨🚨 CRITICAL: SILENCE AFTER DIALOGUE - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: After the dialogue ends (after [${dialogueEndTimecode}]), the character must STOP speaking completely and remain SILENT for the remainder of the segment. Do NOT continue speaking, do NOT add extra words, do NOT generate gibberish, do NOT make sounds, do NOT speak beyond the dialogue timecode. The character must remain completely silent after finishing the dialogue. This is a HARD REQUIREMENT - any speech, sounds, or gibberish after the dialogue ends will result in video rejection. `
          console.log(`[Segment ${idx}] Added silence-after-dialogue instruction`)
        }
        
        // Build segment-specific instructions based on segment type
        // CTA segments need visual progression (end of video), hook/body need smooth transitions
        let segmentSpecificInstructions = ''
        let holdFinalFrameInstruction = ''
        let cameraPerspectiveInstruction = ''
        let actionContinuityInstruction = ''
        let naturalProgressionInstruction = ''
        
        // Add natural progression requirement (different poses/actions)
        if (idx > 0) {
          // This is not the first segment, so it should show progression from previous
          naturalProgressionInstruction = ` 🚨🚨🚨 CRITICAL NATURAL PROGRESSION - MANDATORY: This segment MUST show a DIFFERENT pose and/or action from the previous segment while maintaining character and product consistency. The character MUST have a DIFFERENT pose (different standing/sitting position, different gesture, different facial expression, different body orientation) AND/OR a DIFFERENT action (different activity, different movement, different interaction with product). The story must progress with evolving poses and actions. Do NOT repeat the same pose or action from the previous segment. This is a MANDATORY requirement for natural story progression. `
        }
        
        if (segment.type === 'cta') {
          // CTA is the end of the video, not a transition - need visual progression
          cameraPerspectiveInstruction = 'Allow camera movement and angle changes to show progression, ending with a distinct final composition. The video should progress naturally with clear visual changes from start to finish.'
          segmentSpecificInstructions = `CTA VISUAL PROGRESSION REQUIREMENT: This CTA segment is the FINAL segment of the video (not a transition to another segment). It must show clear visual progression from start to finish. The final moment must be visually DISTINCT from the starting moment. Use one or more of these techniques: 1) Change camera angle (switch from medium to close-up, or front to side/three-quarter angle), 2) Add text overlay or logo lockup in the final moment, 3) Change character pose or expression to show transformation, 4) Adjust composition to create a hero shot. The video should progress naturally from the starting frame to a visually distinct final frame. Do NOT hold the final frame static - this is the end of the video, not a transition, so show clear visual progression throughout the segment ending with a distinct hero shot. The final moment should be visually distinct from the starting moment - use different camera angle, composition, or add text/logo overlay. This is the end of the video, not a transition, so show clear visual progression.`
          console.log(`[Segment ${idx}] CTA segment: Applying visual progression instructions (no hold final frame)`)
        } else if (segment.type === 'body') {
          // Body segments need smooth transitions AND continuous action/motion
          cameraPerspectiveInstruction = 'Maintain the same camera perspective and same setting throughout.'
          holdFinalFrameInstruction = 'The video should naturally ease into and hold the final frame steady for approximately 0.5 seconds. No transitions, cuts, or effects at the end. The final moment should be stable for smooth continuation into the next scene.'
          // CRITICAL: Body segments must show continuous motion/action throughout
          actionContinuityInstruction = `🚨 CRITICAL ACTION CONTINUITY REQUIREMENT - MANDATORY: The character must be actively moving and performing actions throughout the ENTIRE body segment. Do NOT show the character as still, motionless, or frozen. The character must demonstrate continuous motion: reaching for items, applying products, moving hands, changing facial expressions, evolving body language, and progressing through actions. For product application scenes specifically: Show the character actively applying the product with continuous hand movements throughout the segment - hands moving, product being applied, facial expressions changing from initial state to transformed state, body language evolving. The character should NOT be static or motionless at any point during this segment. Show dynamic, continuous action that progresses naturally from start to finish. This is a MANDATORY requirement - any body segment showing a motionless or still character will be rejected.`
          console.log(`[Segment ${idx}] Body segment: Applying transition instructions (hold final frame) + continuous action requirement`)
        } else {
          // Hook segments need smooth transitions - hold final frame for next segment
          cameraPerspectiveInstruction = 'Maintain the same camera perspective and same setting throughout.'
          holdFinalFrameInstruction = 'The video should naturally ease into and hold the final frame steady for approximately 0.5 seconds. No transitions, cuts, or effects at the end. The final moment should be stable for smooth continuation into the next scene.'
          console.log(`[Segment ${idx}] ${segment.type} segment: Applying transition instructions (hold final frame for smooth transition)`)
        }
        
        // Add hold-final-frame instruction (conditional), face quality, people count limits, dialogue-only audio instructions, and clothing/jewelry stability
        // Insert dialogue text and instructions BEFORE other instructions so they take priority
        // Insert action continuity instruction for body segments BEFORE other instructions
        // Insert no-audio instruction BEFORE other audio instructions if no dialogue exists
        // Insert hand consistency instruction for product holding
        // Insert natural progression instruction for evolving poses/actions
        const videoPrompt = `${sanitizedPrompt}${moodInstruction}${handConsistencyInstruction}${naturalProgressionInstruction}${actionContinuityInstruction}${noAudioInstruction}${dialogueTextForPrompt}${dialogueInstructions}${silenceAfterDialogueInstruction} 🚨🚨🚨 CRITICAL: FOREGROUND CONSISTENCY (MANDATORY): Maintain the EXACT same foreground elements (characters, products, objects) across ALL scenes/videos. The same character with identical appearance, clothing, and physical features must appear in the same position and state. The same product must appear with identical design, color, and placement. Only camera angles, poses, and compositions may change - foreground elements must remain pixel-perfect consistent. Characters must maintain the EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), and EXACT same product appearance (same design, same color, same size) across ALL segments. Do NOT change character clothing, physical features, or product appearance between segments. CRITICAL CONTINUOUS SHOT REQUIREMENT: This must be a SINGLE CONTINUOUS SHOT in ONE LOCATION. NO scene changes, NO location changes, NO background changes, NO room changes. The entire segment must take place in the exact same location with the same background, same environment, same surroundings from start to finish. ${cameraPerspectiveInstruction} The video should feel like ONE unbroken moment in ONE place - do NOT change locations, rooms, backgrounds, or environments during this segment. ONE continuous shot, ONE location, ONE background. ${holdFinalFrameInstruction}${segmentSpecificInstructions} 🚨 CRITICAL - NO MIRRORS OR REFLECTIONS: DO NOT include mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection in this video. This is a MANDATORY requirement - any video containing mirrors or reflections will be rejected. 🚨🚨🚨 CRITICAL BODY PROPORTIONS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨: ALL characters in this video MUST have CORRECT body proportions and standard human anatomy. Each character must have EXACTLY: two hands (one left, one right), two arms (one left, one right), two legs, and one head. All body parts must be properly proportioned, naturally sized, and correctly positioned. ABSOLUTELY DO NOT GENERATE: ❌ Multiple limbs (NO extra arms, NO extra legs, NO more than 2 arms, NO more than 2 legs, NO duplicate limbs), ❌ Disproportionate body parts (NO huge arms, NO oversized hands, NO abnormally large limbs, NO tiny arms, NO disproportionate body parts), ❌ Anatomical deformities (NO deformed anatomy, NO abnormal proportions, NO malformed limbs, NO incorrect body structure). MUST GENERATE: ✅ Exactly 2 arms (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 hands (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 legs - properly proportioned and naturally sized, ✅ All body parts in correct proportions relative to the character's body size, ✅ Natural, realistic human anatomy with standard body proportions. This is a MANDATORY requirement - any video showing multiple limbs, disproportionate body parts, or anatomical deformities will be REJECTED. ${noAudioInstruction ? '' : 'AUDIO: 🚨 CRITICAL LANGUAGE REQUIREMENT - ENGLISH ONLY: All spoken dialogue in this video MUST be in English ONLY. ABSOLUTELY NO exceptions. NO foreign languages, NO non-English speech, NO other languages whatsoever. If any character speaks, they must speak ONLY in English. This is a MANDATORY requirement - any non-English speech will result in video rejection. CRITICAL AUDIO REQUIREMENTS - SPOKEN DIALOGUE ONLY: Characters must SPEAK their dialogue ALOUD on-camera - this is SPOKEN DIALOGUE, not voiceover, not thoughts, not narration. Dialogue must come from the character\'s MOUTH as they speak on-camera. CRITICAL: EXACT DIALOGUE MATCHING - Characters must speak the EXACT words specified in the dialogue text. Do not paraphrase, do not change words, do not add words, do not remove words. Speak each word clearly and precisely. No substitutions, no variations, no gibberish, no made-up words. 🚨 ABSOLUTELY NO MUSIC - MANDATORY REQUIREMENT: Do NOT generate ANY background music, soundtrack, instrumental music, background score, musical audio, beats, rhythm, melody, songs, singing, or ANY musical elements whatsoever. Sound effects (SFX) and SPOKEN DIALOGUE are allowed, but ABSOLUTELY NO music of any kind. This is a HARD REQUIREMENT - any music in the generated video will result in rejection. ONLY on-camera characters visible in the scene may speak - their dialogue must be SPOKEN ALOUD, not heard as thoughts or voiceover. ABSOLUTELY NO narration, NO voiceover, NO off-screen announcer, NO background voices. ABSOLUTELY NO internal thoughts, NO internal monologue, NO thought bubbles, NO voiceover narration. If no character is speaking in a scene, there should be NO speech at all - complete silence. Only characters shown on-camera SPEAKING DIRECTLY to the camera or to other visible characters may have dialogue, and they must SPEAK ONLY in English. All dialogue must be SPOKEN ALOUD by the character on-camera - do NOT generate dialogue as thoughts, voiceover, or narration. If dialogue is present, it must end at least 2 seconds before the scene ends to ensure smooth transitions. '}CLOTHING & JEWELRY: Characters should already be wearing their clothes and jewelry from the start of the scene. Do NOT show characters putting on or taking off items. Items should be worn consistently throughout the scene. No wardrobe changes during the scene. TYPOGRAPHY & TEXT: If displaying any text, brand names, or product names: Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. Spell exactly as mentioned in prompt with perfect accuracy. Professional kerning, leading, and letter spacing. Sharp, crisp edges - no blurry or distorted text. Minimize decorative or script fonts unless specifically luxury brand requirement. Text should be perfectly readable at any resolution with cinema-quality typography. FACE QUALITY: Limit scene to 3-4 people maximum. Use close-ups and medium shots to ensure sharp faces, clear facial features, detailed faces, professional portrait quality. Avoid large groups, crowds, or more than 4 people.`
        
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
          
          // Build negative prompt - add children-related terms if detected in frames, scene change terms, language/narration terms, music terms, mirror terms, skin quality terms, body proportions terms, and default face quality terms
          const defaultFaceQualityNegative = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy, multiple limbs, extra arms, extra legs, more than 2 arms, more than 2 legs, huge arms, oversized hands, oversized limbs, disproportionate body, disproportionate limbs, abnormal proportions, deformed anatomy, malformed limbs, incorrect body structure, scene changes, location changes, background changes, different rooms, different locations, multiple settings, changing environments, narration, voiceover, off-screen voices, foreign languages, non-English speech, non-English dialogue, foreign dialogue, foreign speech, background narration, announcer, other languages, background music, soundtrack, instrumental music, background score, music, musical score, musical audio, musical, beats, rhythm, melody, song, songs, singing, vocals, mirrors, reflections, reflective surfaces, bathroom mirrors, people looking at reflection, looking at reflection, pimples, acne, blemishes, blackheads, whiteheads, spots, marks, scars, skin discoloration, redness, irritation, rashes, skin texture issues, visible pores, skin imperfections, cream residue on skin, oil on skin, wet skin, shiny product residue, product visible on skin surface, liquid on face, cream on face, serum on face, product on face, visible product on face, wet face, shiny face, glossy face, product residue on face, cream visible on face, liquid visible on face, serum visible on face, product application visible on face, matte finish required, dry skin appearance, gibberish, extra speech, continuing dialogue, speech after dialogue ends, additional words after dialogue, made-up words, nonsense speech, unintelligible speech, random speech, speech beyond dialogue timecode'
          let negativePrompt = defaultFaceQualityNegative
          
          // Add no-audio terms to negative prompt if no dialogue exists
          if (noAudioInstruction) {
            negativePrompt = `${defaultFaceQualityNegative}, spoken dialogue, voiceover, narration, speech, human speech, character speech, any language, English speech, foreign language speech, sound effects, SFX, ambient noise, background voices, off-screen voices, any audio, music, soundtrack, sound, audio output, speech audio, dialogue audio, voice audio, human voice, speaking, talking, verbal communication`
            console.log(`[Segment ${idx}] Adding no-audio terms to negative prompt (no dialogue provided)`)
          }
          
          if (childrenDetected) {
            negativePrompt = `${negativePrompt}, no children, no kids, no minors, no toddlers, only adults`
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
          
          // Enable Veo native audio generation only if dialogue exists
          // If no dialogue, disable audio generation to prevent unwanted audio
          if (noAudioInstruction) {
            videoParams.generate_audio = false
            console.log(`[Segment ${idx}] Audio generation DISABLED (no dialogue provided - segment must be silent)`)
          } else {
            videoParams.generate_audio = true
            console.log(`[Segment ${idx}] Audio generation enabled (Veo will generate dialogue-only audio)`)
          }
          
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
          
          // Build negative prompt with default face quality terms, body proportions terms, music terms, and mirror terms
          const defaultFaceQualityNegative = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy, multiple limbs, extra arms, extra legs, more than 2 arms, more than 2 legs, huge arms, oversized hands, oversized limbs, disproportionate body, disproportionate limbs, abnormal proportions, deformed anatomy, malformed limbs, incorrect body structure, scene changes, location changes, background changes, different rooms, different locations, multiple settings, changing environments, narration, voiceover, off-screen voices, foreign languages, non-English speech, non-English dialogue, foreign dialogue, foreign speech, background narration, announcer, other languages, background music, soundtrack, instrumental music, background score, music, musical score, musical audio, musical, beats, rhythm, melody, song, songs, singing, vocals, mirrors, reflections, reflective surfaces, bathroom mirrors, people looking at reflection, looking at reflection, pimples, acne, blemishes, blackheads, whiteheads, spots, marks, scars, skin discoloration, redness, irritation, rashes, skin texture issues, visible pores, skin imperfections, cream residue on skin, oil on skin, wet skin, shiny product residue, product visible on skin surface, liquid on face, cream on face, serum on face, product on face, visible product on face, wet face, shiny face, glossy face, product residue on face, cream visible on face, liquid visible on face, serum visible on face, product application visible on face, matte finish required, dry skin appearance, gibberish, extra speech, continuing dialogue, speech after dialogue ends, additional words after dialogue, made-up words, nonsense speech, unintelligible speech, random speech, speech beyond dialogue timecode'
          let negativePrompt = defaultFaceQualityNegative
          
          // Add no-audio terms to negative prompt if no dialogue exists
          if (noAudioInstruction) {
            negativePrompt = `${defaultFaceQualityNegative}, spoken dialogue, voiceover, narration, speech, human speech, character speech, any language, English speech, foreign language speech, sound effects, SFX, ambient noise, background voices, off-screen voices, any audio, music, soundtrack, sound, audio output, speech audio, dialogue audio, voice audio, human voice, speaking, talking, verbal communication`
            console.log(`[Segment ${idx}] Adding no-audio terms to negative prompt (no dialogue provided)`)
          }
          
          // Priority: segment.negativePrompt > storyboard.meta.negativePrompt > auto-generated
          if ((segment as any).negativePrompt) {
            videoParams.negative_prompt = `${(segment as any).negativePrompt}, ${negativePrompt}`
            console.log(`[Segment ${idx}] Using segment-specific negative prompt`)
          } else if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = `${storyboard.meta.negativePrompt}, ${negativePrompt}`
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
          
          // Enable Veo native audio generation only if dialogue exists
          // If no dialogue, disable audio generation to prevent unwanted audio
          if (noAudioInstruction) {
            videoParams.generate_audio = false
            console.log(`[Segment ${idx}] Audio generation DISABLED (no dialogue provided - segment must be silent)`)
          } else {
            videoParams.generate_audio = true
            console.log(`[Segment ${idx}] Audio generation enabled (Veo will generate dialogue-only audio)`)
          }
          
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
        
        // Store prediction ID in asset metadata immediately and update job status
        const initialAsset: Asset = {
          segmentId: idx,
          status: 'processing',
          metadata: {
            predictionId,
            segmentIndex: idx,
            segmentType: segment.type,
            startTime: segment.startTime,
            endTime: segment.endTime,
            duration: segment.endTime - segment.startTime,
            timestamp: Date.now(),
          },
        }
        
        // Update job with this asset in processing state so UI can see it
        if (!job.assets) job.assets = []
        job.assets[idx] = initialAsset
        await saveJob(job)
        console.log(`[Segment ${idx}] Job updated with prediction ID: ${predictionId}`)
        
        let retryAttempted = false
        let currentVideoParams = videoParams
        let currentPredictionId = predictionId
        let currentPredictionStatus = predictionStatus
        const predictionStartTime = Date.now()
        const PREDICTION_TIMEOUT = 10 * 60 * 1000 // 10 minutes in milliseconds
        
        // Non-blocking polling with incremental job updates
        while (currentPredictionStatus.status === 'starting' || currentPredictionStatus.status === 'processing') {
          // Check for timeout
          const elapsedTime = Date.now() - predictionStartTime
          if (elapsedTime > PREDICTION_TIMEOUT) {
            console.error(`[Segment ${idx}] Prediction timeout after ${elapsedTime}ms (${Math.round(elapsedTime / 1000)}s)`)
            const timeoutAsset: Asset = {
              segmentId: idx,
              status: 'failed',
              error: `Prediction timed out after ${Math.round(elapsedTime / 1000)} seconds. Prediction ID: ${currentPredictionId}`,
              metadata: {
                predictionId: currentPredictionId,
                segmentIndex: idx,
                segmentType: segment.type,
                timeout: true,
                elapsedTime,
                timestamp: Date.now(),
              },
            }
            if (!job.assets) job.assets = []
            job.assets[idx] = timeoutAsset
            await saveJob(job)
            return timeoutAsset
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000))
          currentPredictionStatus = await callReplicateMCP('check_prediction_status', {
            predictionId: currentPredictionId,
          })
          
          // Update job with current status so UI can see progress
          if (!job.assets) job.assets = []
          job.assets[idx] = {
            ...initialAsset,
            status: 'processing',
            metadata: {
              ...initialAsset.metadata,
              predictionStatus: currentPredictionStatus.status,
              elapsedTime: Date.now() - predictionStartTime,
            },
          }
          await saveJob(job)
          console.log(`[Segment ${idx}] Status check: ${currentPredictionStatus.status} (elapsed: ${Math.round((Date.now() - predictionStartTime) / 1000)}s)`)
        }

        // Check for E005 error (sensitive content flagging)
        const isE005Error = currentPredictionStatus.status !== 'succeeded' && 
                           (currentPredictionStatus.error?.includes('E005') || 
                            currentPredictionStatus.error?.toLowerCase().includes('sensitive') ||
                            currentPredictionStatus.error?.toLowerCase().includes('flagged'))
        
        if (isE005Error && !retryAttempted) {
          console.warn(`[Segment ${idx}] ===== E005 SENSITIVE CONTENT ERROR DETECTED =====`)
          console.warn(`[Segment ${idx}] Error message: ${currentPredictionStatus.error}`)
          console.warn(`[Segment ${idx}] Segment type: ${segment.type}`)
          console.warn(`[Segment ${idx}] Segment description: ${segment.description}`)
          console.warn(`[Segment ${idx}] Visual prompt: ${segment.visualPrompt}`)
          console.warn(`[Segment ${idx}] Audio notes: ${segment.audioNotes || '(empty)'}`)
          console.warn(`[Segment ${idx}] Full video prompt (before sanitization): ${videoPrompt.substring(0, 500)}...`)
          console.warn(`[Segment ${idx}] Video prompt length: ${videoPrompt.length} characters`)
          console.warn(`[Segment ${idx}] Model: ${model}`)
          console.warn(`[Segment ${idx}] Prediction ID: ${currentPredictionId}`)
          console.warn(`[Segment ${idx}] ================================================`)
          
          // Store error details for debugging (will be added to metadata if retry fails)
          const errorDetails = {
            errorType: 'E005_SENSITIVE_CONTENT',
            errorMessage: currentPredictionStatus.error,
            segmentType: segment.type,
            segmentDescription: segment.description,
            visualPrompt: segment.visualPrompt,
            audioNotes: segment.audioNotes || '',
            videoPromptPreview: videoPrompt.substring(0, 1000), // First 1000 chars
            videoPromptLength: videoPrompt.length,
            model,
            predictionId: currentPredictionId,
            timestamp: Date.now(),
          }
          
          console.log(`[Segment ${idx}] Retrying with modified prompt to add professional context`)
          
          // Sanitize the videoPrompt again before retry with aggressive CTA-specific sanitization
          // Apply multiple sanitization passes for CTA segments to be more aggressive
          let sanitizedVideoPrompt = sanitizeVideoPrompt(videoPrompt, undefined, segment.type as 'hook' | 'body' | 'cta')
          
          // For CTA segments, apply additional sanitization passes
          if (segment.type === 'cta') {
            console.log(`[Segment ${idx}] Applying aggressive CTA-specific sanitization on retry`)
            // Multiple passes for CTA to ensure all problematic terms are replaced
            sanitizedVideoPrompt = sanitizeVideoPrompt(sanitizedVideoPrompt, undefined, 'cta')
            sanitizedVideoPrompt = sanitizeVideoPrompt(sanitizedVideoPrompt, undefined, 'cta')
          }
          
          // Modify prompt to add professional product showcase context and product name accuracy
          // For CTA segments, add even more explicit professional advertising context
          const professionalContext = segment.type === 'cta' 
            ? 'professional product advertisement, legitimate commercial content, safe for all audiences, appropriate product showcase, professional advertising material'
            : 'professional product showcase, safe for all audiences, appropriate content'
          
          const modifiedPrompt = `${sanitizedVideoPrompt}, ${professionalContext}. TYPOGRAPHY & TEXT: If displaying any text, brand names, or product names: Use clean, elegant, modern typeface (sans-serif like Helvetica, Futura, Gotham for contemporary brands OR serif like Didot, Bodoni for luxury brands). High contrast for maximum legibility: crisp white text on dark background OR bold black text on light background. Large, bold, professional font size with generous spacing. Centered or elegantly positioned with balanced composition. Spell exactly as mentioned in prompt with perfect accuracy. Professional kerning, leading, and letter spacing. Sharp, crisp edges - no blurry or distorted text. Text should be perfectly readable at any resolution with cinema-quality typography.`
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
          
          // Poll for retry completion with incremental updates
          currentPredictionStatus = retryVideoResult
          const retryStartTime = Date.now()
          const RETRY_TIMEOUT = 10 * 60 * 1000 // 10 minutes
          
          while (currentPredictionStatus.status === 'starting' || currentPredictionStatus.status === 'processing') {
            // Check for timeout
            const elapsedTime = Date.now() - retryStartTime
            if (elapsedTime > RETRY_TIMEOUT) {
              console.error(`[Segment ${idx}] Retry prediction timeout after ${elapsedTime}ms`)
              const timeoutAsset: Asset = {
                segmentId: idx,
                status: 'failed',
                error: `Retry prediction timed out after ${Math.round(elapsedTime / 1000)} seconds. Prediction ID: ${currentPredictionId}`,
                metadata: {
                  predictionId: currentPredictionId,
                  segmentIndex: idx,
                  segmentType: segment.type,
                  timeout: true,
                  retryAttempted: true,
                  elapsedTime,
                  timestamp: Date.now(),
                },
              }
              if (!job.assets) job.assets = []
              job.assets[idx] = timeoutAsset
              await saveJob(job)
              return timeoutAsset
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000))
            currentPredictionStatus = await callReplicateMCP('check_prediction_status', {
              predictionId: currentPredictionId,
            })
            
            // Update job with current retry status
            if (!job.assets) job.assets = []
            job.assets[idx] = {
              segmentId: idx,
              status: 'processing',
              metadata: {
                predictionId: currentPredictionId,
                segmentIndex: idx,
                segmentType: segment.type,
                predictionStatus: currentPredictionStatus.status,
                retryAttempted: true,
                elapsedTime: Date.now() - retryStartTime,
                timestamp: Date.now(),
              },
            }
            await saveJob(job)
            console.log(`[Segment ${idx}] Retry status check: ${currentPredictionStatus.status} (elapsed: ${Math.round((Date.now() - retryStartTime) / 1000)}s)`)
          }
        }
        
        if (currentPredictionStatus.status !== 'succeeded') {
          const errorMsg = currentPredictionStatus.error || 'Unknown error'
          
          // Enhanced logging for final failure (including after retry)
          if (isE005Error || errorMsg.toLowerCase().includes('sensitive') || errorMsg.toLowerCase().includes('flagged')) {
            console.error(`[Segment ${idx}] ===== FINAL E005 ERROR (AFTER RETRY) =====`)
            console.error(`[Segment ${idx}] Error message: ${errorMsg}`)
            console.error(`[Segment ${idx}] Segment type: ${segment.type}`)
            console.error(`[Segment ${idx}] Visual prompt: ${segment.visualPrompt}`)
            console.error(`[Segment ${idx}] Audio notes: ${segment.audioNotes || '(empty)'}`)
            console.error(`[Segment ${idx}] Final video prompt: ${currentVideoParams.prompt?.substring(0, 500)}...`)
            console.error(`[Segment ${idx}] Retry attempted: ${retryAttempted}`)
            console.error(`[Segment ${idx}] ===========================================`)
            
            // Store error details in asset metadata for frontend access
            const failedAsset: Asset = {
              segmentId: idx,
              status: 'failed',
              error: `Video generation failed${retryAttempted ? ' (after retry)' : ''}: ${errorMsg}`,
              metadata: {
                errorType: 'E005_SENSITIVE_CONTENT',
                errorMessage: errorMsg,
                segmentType: segment.type,
                segmentDescription: segment.description,
                visualPrompt: segment.visualPrompt,
                audioNotes: segment.audioNotes || '',
                videoPromptPreview: currentVideoParams.prompt?.substring(0, 1000),
                videoPromptLength: currentVideoParams.prompt?.length || 0,
                model,
                predictionId: currentPredictionId,
                retryAttempted,
                timestamp: Date.now(),
              },
            } as Asset
            
            // Update job with failed asset
            if (!job.assets) job.assets = []
            job.assets[idx] = failedAsset
            await saveJob(job)
            console.log(`[Segment ${idx}] Job updated with failed status`)
            
            return failedAsset
          }
          
          // Non-E005 error - update job and throw
          const failedAsset: Asset = {
            segmentId: idx,
            status: 'failed',
            error: `Video generation failed${retryAttempted ? ' (after retry)' : ''}: ${errorMsg}`,
            metadata: {
              predictionId: currentPredictionId,
              segmentIndex: idx,
              segmentType: segment.type,
              errorMessage: errorMsg,
              retryAttempted,
              timestamp: Date.now(),
            },
          }
          
          // Update job with failed asset
          if (!job.assets) job.assets = []
          job.assets[idx] = failedAsset
          await saveJob(job)
          console.log(`[Segment ${idx}] Job updated with failed status`)
          
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
          const noUrlAsset: Asset = {
            segmentId: idx,
            status: 'failed',
            error: `Video generation completed but no video URL was returned`,
            metadata: {
              predictionId,
              predictionStatus,
              finalResult: videoResultFinal,
            },
          } as Asset
          
          // Update job with failed asset
          if (!job.assets) job.assets = []
          job.assets[idx] = noUrlAsset
          await saveJob(job)
          console.log(`[Segment ${idx}] Job updated with failed status (no video URL)`)
          
          return noUrlAsset
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
        const metadata: any = {
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

        const completedAsset: Asset = {
          segmentId: idx,
          videoUrl: finalVideoUrl, // Use S3 URL or Replicate fallback (contains embedded audio)
          status: 'completed',
          metadata, // Include metadata for frontend access
        } as Asset
        
        // Update job with completed asset
        if (!job.assets) job.assets = []
        job.assets[idx] = completedAsset
        await saveJob(job)
        console.log(`[Segment ${idx}] Job updated with completed status and video URL`)
        
        return completedAsset
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred'
        console.error(`[Segment ${idx}] Asset generation failed:`, errorMessage)
        console.error(`[Segment ${idx}] Error details:`, error)
        if (error.stack) {
          console.error(`[Segment ${idx}] Stack trace:`, error.stack)
        }
        
        const errorAsset: Asset = {
          segmentId: idx,
          status: 'failed',
          error: errorMessage,
          metadata: {
            segmentIndex: idx,
            segmentType: segment.type,
            errorDetails: error.stack,
            timestamp: Date.now(),
          },
        } as Asset
        
        // Update job with failed asset
        if (!job.assets) job.assets = []
        job.assets[idx] = errorAsset
        await saveJob(job)
        console.log(`[Segment ${idx}] Job updated with failed status (exception)`)
        
        return errorAsset
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

