import { generateAssetsSchema } from '../utils/validation'
import { callReplicateMCP, callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { downloadFile, saveAsset, readFile, cleanupTempFiles, saveVideo } from '../utils/storage'
import { uploadFileToReplicate } from '../utils/replicate-upload'
import { extractFramesFromVideo } from '../utils/ffmpeg'
import { sanitizeVideoPrompt } from '../utils/prompt-sanitizer'
import { checkFrameForChildren } from '../utils/frame-content-checker'
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


// Helper function to extract VO script from audioNotes
// Filters out descriptive notes and music cues, returning only the actual script text
function extractVOScript(audioNotes: string): string | null {
  if (!audioNotes || !audioNotes.trim()) {
    return null
  }
  
  // Remove leading/trailing whitespace
  const trimmed = audioNotes.trim()
  const lowerTrimmed = trimmed.toLowerCase()
  
  // Pattern 1: "Music: [description]. Voiceover: [script]" - extract voiceover part
  const musicAndVoiceoverMatch = trimmed.match(/music:\s*[^.]*\.\s*voiceover:\s*(.+)/i)
  if (musicAndVoiceoverMatch) {
    const voText = musicAndVoiceoverMatch[1].trim()
    // Remove trailing period if it's at the end
    return voText.replace(/\.$/, '').trim()
  }
  
  // Pattern 2: "Voiceover: [text]" or "VO: [text]" (standalone or with music prefix)
  const voiceoverMatch = trimmed.match(/(?:voiceover|vo):\s*(.+?)(?:\.\s*$|$)/i)
  if (voiceoverMatch) {
    let voText = voiceoverMatch[1].trim()
    // If there's a "Music:" prefix before this, we already handled it above
    // Otherwise, check if this is descriptive text
    const isDescriptive = voText.toLowerCase().match(/^(a |an |the )?(narrator|voiceover|voice|speaker|announcer)/i) ||
                         voText.toLowerCase().match(/(describes|explains|discusses|talks about|says|tells)/i)
    
    if (!isDescriptive && voText.length > 5) {
      return voText
    }
  }
  
  // Pattern 3: Text in quotes after "Voiceover:" or "VO:"
  const quotedMatch = trimmed.match(/(?:voiceover|vo):\s*['"](.+?)['"]/i)
  if (quotedMatch) {
    return quotedMatch[1].trim()
  }
  
  // Pattern 4: Text in quotes (standalone) - only if no music/sound keywords
  const standaloneQuoted = trimmed.match(/['"](.+?)['"]/)
  if (standaloneQuoted && !lowerTrimmed.includes('music') && !lowerTrimmed.includes('sound')) {
    const quotedText = standaloneQuoted[1].trim()
    // Check if it's descriptive
    const isDescriptive = quotedText.toLowerCase().match(/^(a |an |the )?(narrator|voiceover|voice|speaker)/i)
    if (!isDescriptive && quotedText.length > 5) {
      return quotedText
    }
  }
  
  // Pattern 5: If it contains "Music:" or "Sound:", extract only the voiceover part
  if (lowerTrimmed.includes('voiceover') || lowerTrimmed.includes('vo:')) {
    // Split by common separators and find voiceover section
    const parts = trimmed.split(/[.;]/)
    for (const part of parts) {
      const partLower = part.toLowerCase()
      if (partLower.includes('voiceover') || partLower.includes('vo:')) {
        let voText = part.replace(/^(?:voiceover|vo):\s*/i, '').trim()
        // Check if it's descriptive
        const isDescriptive = voText.toLowerCase().match(/^(a |an |the )?(narrator|voiceover|voice|speaker|announcer)/i) ||
                             voText.toLowerCase().match(/(describes|explains|discusses|talks about|says|tells)/i)
        
        if (!isDescriptive && voText && !voText.toLowerCase().startsWith('music') && !voText.toLowerCase().startsWith('sound') && voText.length > 5) {
          return voText
        }
      }
    }
  }
  
  // Pattern 6: Check for descriptive indicators and reject if found
  const descriptiveIndicators = [
    'a narrator', 'an announcer', 'the voiceover', 'the voice', 'the speaker',
    'describes', 'explains', 'discusses', 'talks about', 'says that', 'tells',
    'music begins', 'music plays', 'music reaches', 'music fades',
    'sound of', 'ambient music', 'instrumental music'
  ]
  
  const isDescriptiveNote = descriptiveIndicators.some(indicator => lowerTrimmed.includes(indicator))
  
  if (!isDescriptiveNote && trimmed.length > 10) {
    // Additional check: if it starts with common descriptive phrases, reject it
    const startsWithDescriptive = /^(a |an |the )?(narrator|voiceover|voice|speaker|announcer|professional)/i.test(trimmed)
    if (!startsWithDescriptive) {
      // Likely actual script text, return as-is
      return trimmed
    }
  }
  
  // No valid VO script found
  return null
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

        // Get model from storyboard meta, default to google/veo-3.1
        const model = storyboard.meta.model || 'google/veo-3.1'

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
        const sanitizedPrompt = sanitizeVideoPrompt(selectedPrompt)
        
        // Extract mood from storyboard meta
        const mood = storyboard.meta.mood || 'professional'
        const moodInstruction = mood ? ` ${mood.charAt(0).toUpperCase() + mood.slice(1)} tone and mood.` : ''
        
        // Add hold-final-frame instruction, face quality, and people count limits
        const videoPrompt = `${sanitizedPrompt}${moodInstruction} The video should naturally ease into and hold the final frame steady for approximately 0.5 seconds. No transitions, cuts, or effects at the end. The final moment should be stable for smooth continuation into the next scene. CRITICAL: Any product name, brand name, or text displayed in the video must be spelled correctly and match exactly as mentioned in the prompt. Ensure all text, labels, and product names are accurate and legible. FACE QUALITY: Limit scene to 3-4 people maximum. Use close-ups and medium shots to ensure sharp faces, clear facial features, detailed faces, professional portrait quality. Avoid large groups, crowds, or more than 4 people.`
        
        const videoParams: any = {
          model,
          prompt: videoPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        if (model === 'google/veo-3.1') {
          // Always use firstFrameImage and lastFrameImage from frames
          if (firstFrameImage) {
            videoParams.image = await prepareImageInput(firstFrameImage)
            console.log(`[Segment ${idx}] Using first frame image: ${firstFrameImage}`)
          }
          
          if (lastFrameImage) {
            videoParams.last_frame = await prepareImageInput(lastFrameImage)
            console.log(`[Segment ${idx}] Using last frame image: ${lastFrameImage}`)
          }
          
          // Build negative prompt - add children-related terms if detected in frames, and default face quality terms
          const defaultFaceQualityNegative = 'blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy'
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
          
          // Priority: segment.generateAudio > storyboard.meta.generateAudio
          if ((segment as any).generateAudio !== undefined) {
            videoParams.generate_audio = (segment as any).generateAudio
            console.log(`[Segment ${idx}] Using segment-specific generateAudio: ${(segment as any).generateAudio}`)
          } else if (storyboard.meta.generateAudio !== undefined) {
            videoParams.generate_audio = storyboard.meta.generateAudio
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
          
          // Priority: segment.generateAudio > storyboard.meta.generateAudio
          if ((segment as any).generateAudio !== undefined) {
            videoParams.generate_audio = (segment as any).generateAudio
            console.log(`[Segment ${idx}] Using segment-specific generateAudio: ${(segment as any).generateAudio}`)
          } else if (storyboard.meta.generateAudio !== undefined) {
            videoParams.generate_audio = storyboard.meta.generateAudio
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
          const modifiedPrompt = `${sanitizedVideoPrompt}, professional product showcase, safe for all audiences, appropriate content. CRITICAL: Any product name, brand name, or text displayed in the video must be spelled correctly and match exactly as mentioned in the prompt. Ensure all text, labels, and product names are accurate and legible.`
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

        // Voice synthesis will be done in parallel after all videos complete
        // Store audioNotes for later processing

        // Store metadata including prediction ID and video URL for frontend access
        const metadata = {
          predictionId,
          videoUrl: finalVideoUrl, // S3 URL or Replicate URL (fallback)
          replicateVideoUrl: videoUrl, // Original Replicate URL
          s3VideoUrl: finalVideoUrl !== videoUrl ? finalVideoUrl : undefined, // S3 URL if uploaded
          voiceUrl: undefined, // Will be set after parallel voice synthesis completes
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
          videoUrl: finalVideoUrl, // Use S3 URL or Replicate fallback
          voiceUrl: undefined, // Will be set after parallel voice synthesis
          status: 'completed',
          metadata: {
            ...metadata,
            audioNotes: segment.audioNotes, // Store for voice synthesis
          }, // Include metadata for frontend access
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

    // Generate all voiceovers in parallel after videos complete
    console.log(`[Generate Assets] Starting parallel voice synthesis for completed segments...`)
    const voicePromises = assets
      .filter(asset => asset.status === 'completed' && asset.metadata?.audioNotes)
      .map(async (asset) => {
        const idx = asset.segmentId
        const audioNotes = asset.metadata?.audioNotes as string | undefined
        
        if (!audioNotes) {
          return { idx, voiceUrl: undefined }
        }
        
        try {
          // Extract actual VO script from audioNotes, filtering out descriptive notes
          const voScript = extractVOScript(audioNotes)
          
          if (!voScript) {
            console.log(`[Segment ${idx}] No valid VO script found in audioNotes: "${audioNotes}"`)
            return { idx, voiceUrl: undefined }
          }
          
          console.log(`[Segment ${idx}] Extracted VO script: "${voScript}" (from: "${audioNotes}")`)
          
          const voiceResult = await callOpenAIMCP('text_to_speech', {
            text: voScript,
            voice: 'alloy',
            model: 'tts-1',
          })

          // Save audio file
          if (!voiceResult?.audioBase64) {
            console.error(`[Segment ${idx}] No audioBase64 in voice result`)
            console.warn(`[Segment ${idx}] Voice synthesis failed, continuing without audio`)
            return { idx, voiceUrl: undefined }
          }
          
          const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
          const audioPath = await saveAsset(audioBuffer, 'mp3')
          
          await trackCost('voice-synthesis', 0.05, {
            segmentId: idx,
            textLength: voScript.length,
          })
          
          console.log(`[Segment ${idx}] Voice synthesis completed: ${audioPath}`)
          return { idx, voiceUrl: audioPath }
        } catch (voiceError: any) {
          console.error(`[Segment ${idx}] Voice synthesis error:`, voiceError.message)
          console.warn(`[Segment ${idx}] Continuing without audio due to voice synthesis failure`)
          return { idx, voiceUrl: undefined }
        }
      })
    
    const voiceResults = await Promise.allSettled(voicePromises)
    
    // Update assets with voice URLs
    for (const result of voiceResults) {
      if (result.status === 'fulfilled') {
        const { idx, voiceUrl } = result.value
        const asset = assets.find(a => a.segmentId === idx)
        if (asset && voiceUrl) {
          asset.voiceUrl = voiceUrl
          if (asset.metadata) {
            asset.metadata.voiceUrl = voiceUrl
          }
          console.log(`[Segment ${idx}] Voice URL updated: ${voiceUrl}`)
        }
      }
    }
    
    console.log(`[Generate Assets] Parallel voice synthesis completed`)

    // Update job
    job.assets = assets
    job.status = assets.every(a => a.status === 'completed') ? 'completed' : 'failed'
    job.endTime = Date.now()
    await saveJob(job)

    return { jobId, assets }
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

