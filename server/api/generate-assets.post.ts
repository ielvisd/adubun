import { generateAssetsSchema } from '../utils/validation'
import { callReplicateMCP, callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { downloadFile, saveAsset, readFile, cleanupTempFiles } from '../utils/storage'
import { uploadFileToReplicate } from '../utils/replicate-upload'
import { extractFramesFromVideo } from '../utils/ffmpeg'
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

// Helper function to enhance visual prompts for Kling with more specific details
function enhanceKlingPrompt(basePrompt: string, segmentDescription?: string): string {
  // Add specific details to make prompts more realistic and detailed
  let enhanced = basePrompt
  
  // Ensure the prompt emphasizes realistic, natural actions
  if (!enhanced.toLowerCase().includes('realistic') && !enhanced.toLowerCase().includes('natural')) {
    enhanced += ', realistic and natural movement'
  }
  
  // Add professional product showcase context to help avoid E005 errors
  // This emphasizes that the content is commercial/advertising and safe
  if (!enhanced.toLowerCase().includes('professional product showcase') && 
      !enhanced.toLowerCase().includes('safe for all audiences')) {
    enhanced += ', professional product showcase, safe for all audiences'
  }
  
  // Add professional product showcase context if segment description suggests it
  if (segmentDescription && (segmentDescription.toLowerCase().includes('product') || segmentDescription.toLowerCase().includes('showcase'))) {
    if (!enhanced.toLowerCase().includes('professional') && !enhanced.toLowerCase().includes('product showcase')) {
      enhanced += ', professional product showcase'
    }
  }
  
  // Ensure proper body part connections are implied
  if (enhanced.toLowerCase().includes('hand') || enhanced.toLowerCase().includes('arm')) {
    if (!enhanced.toLowerCase().includes('attached') && !enhanced.toLowerCase().includes('connected')) {
      enhanced += ', showing natural body connections'
    }
  }
  
  return enhanced
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
  const { storyboard } = generateAssetsSchema.parse(await readBody(event))
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
    // In demo mode, only process first segment
    const segmentsToProcess = storyboard.meta.mode === 'demo' 
      ? storyboard.segments.slice(0, 1)
      : storyboard.segments

    // Generate assets sequentially (for frame continuity)
    const assets: Asset[] = []
    let previousVideoUrl: string | null = null
    let previousFrameImage: string | null = null
    
    for (const [idx, segment] of segmentsToProcess.entries()) {
      const asset = await (async () => {
      try {
        // Determine which images to use (segment-specific or global fallback)
        const firstFrameImage = segment.firstFrameImage || storyboard.meta.firstFrameImage
        const subjectReference = segment.subjectReference || storyboard.meta.subjectReference

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
        
        // For Kling, enhance the prompt with more specific details
        let videoPrompt = selectedPrompt
        if (model === 'kwaivgi/kling-v2.5-turbo-pro') {
          videoPrompt = enhanceKlingPrompt(selectedPrompt, segment.description)
        }
        
        const videoParams: any = {
          model,
          prompt: videoPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        if (model === 'google/veo-3.1') {
          // Use previous frame from previous segment if available (for continuity)
          if (previousFrameImage) {
            videoParams.image = await prepareImageInput(previousFrameImage)
            console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
          } else if (storyboard.meta.image) {
            videoParams.image = await prepareImageInput(storyboard.meta.image)
          }
          if (storyboard.meta.lastFrame) {
            videoParams.last_frame = await prepareImageInput(storyboard.meta.lastFrame)
          }
          if (storyboard.meta.referenceImages && storyboard.meta.referenceImages.length > 0) {
            videoParams.reference_images = await Promise.all(
              storyboard.meta.referenceImages.map((img: string) => prepareImageInput(img))
            )
          }
          if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = storyboard.meta.negativePrompt
          }
          if (storyboard.meta.resolution) {
            videoParams.resolution = storyboard.meta.resolution
          }
          if (storyboard.meta.generateAudio !== undefined) {
            videoParams.generate_audio = storyboard.meta.generateAudio
          }
          if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
            videoParams.seed = storyboard.meta.seed
          }
        } else if (model === 'google/veo-3-fast') {
          // Veo 3 Fast only supports: prompt, aspect_ratio, duration, image, negative_prompt, resolution, generate_audio, seed
          // Note: Does NOT support last_frame or reference_images
          // Use previous frame from previous segment if available (for continuity)
          if (previousFrameImage) {
            videoParams.image = await prepareImageInput(previousFrameImage)
            console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
          } else {
            // Use segment-specific firstFrameImage or subjectReference, or fall back to global image
            const imageToUse = firstFrameImage || subjectReference || storyboard.meta.image
            if (imageToUse) {
              videoParams.image = await prepareImageInput(imageToUse)
            }
          }
          if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = storyboard.meta.negativePrompt
          }
          if (storyboard.meta.resolution) {
            videoParams.resolution = storyboard.meta.resolution
          }
          if (storyboard.meta.generateAudio !== undefined) {
            videoParams.generate_audio = storyboard.meta.generateAudio
          }
          if (storyboard.meta.seed !== undefined && storyboard.meta.seed !== null) {
            videoParams.seed = storyboard.meta.seed
          }
        } else if (model === 'kwaivgi/kling-v2.5-turbo-pro') {
          // Add negative prompt for Kling to prevent unrealistic results
          // Note: Kling may not support negative_prompt parameter, but we'll try to include it in the prompt
          // For now, we enhance the prompt itself with negative guidance
          const negativeGuidance = 'avoid detached body parts, unrealistic actions, abstract visuals, distorted anatomy, floating objects'
          if (!videoPrompt.toLowerCase().includes('avoid') && !videoPrompt.toLowerCase().includes('no')) {
            videoParams.prompt = `${videoPrompt}. ${negativeGuidance}`
          }
          
          // Use previous frame from previous segment if available (for continuity)
          if (previousFrameImage) {
            videoParams.image_legacy = await prepareImageInput(previousFrameImage)
            console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
          } else if (firstFrameImage) {
            videoParams.image_legacy = await prepareImageInput(firstFrameImage)
          } else if (subjectReference) {
            videoParams.image_legacy = await prepareImageInput(subjectReference)
          } else if (storyboard.meta.image) {
            videoParams.image_legacy = await prepareImageInput(storyboard.meta.image)
          }
        } else if (model === 'minimax/hailuo-ai-v2.3') {
          // Hailuo doesn't support image inputs
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
          
          // Modify prompt to add professional product showcase context
          const modifiedPrompt = `${videoPrompt}, professional product showcase, safe for all audiences, appropriate content`
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

        console.log(`[Segment ${idx}] Video URL obtained:`, videoUrl)
        console.log(`[Segment ${idx}] Prediction ID:`, predictionId)

        // Voice Over (OpenAI TTS)
        let voiceUrl: string | undefined
        if (segment.audioNotes) {
          try {
            // Extract actual VO script from audioNotes, filtering out descriptive notes
            const voScript = extractVOScript(segment.audioNotes)
            
            if (!voScript) {
              console.log(`[Segment ${idx}] No valid VO script found in audioNotes: "${segment.audioNotes}"`)
              // Skip TTS if no valid script found
            } else {
              console.log(`[Segment ${idx}] Extracted VO script: "${voScript}" (from: "${segment.audioNotes}")`)
              
              const voiceResult = await callOpenAIMCP('text_to_speech', {
                text: voScript,
                voice: 'alloy',
                model: 'tts-1',
              })

              // Save audio file
              if (!voiceResult?.audioBase64) {
                console.error('[Generate Assets] No audioBase64 in voice result:', JSON.stringify(voiceResult, null, 2))
                console.error('[Generate Assets] Voice result keys:', voiceResult ? Object.keys(voiceResult) : 'null')
                // Don't fail the entire segment if voice synthesis fails - just log and continue
                console.warn(`[Segment ${idx}] Voice synthesis failed, continuing without audio`)
              } else {
                const audioBuffer = Buffer.from(voiceResult.audioBase64, 'base64')
                const audioPath = await saveAsset(audioBuffer, 'mp3')
                voiceUrl = audioPath

                await trackCost('voice-synthesis', 0.05, {
                  segmentId: idx,
                  textLength: voScript.length,
                })
              }
            }
          } catch (voiceError: any) {
            // Don't fail the entire segment if voice synthesis fails - just log and continue
            console.error(`[Segment ${idx}] Voice synthesis error:`, voiceError.message)
            console.warn(`[Segment ${idx}] Continuing without audio due to voice synthesis failure`)
          }
        }

        // Store metadata including prediction ID and video URL for frontend access
        const metadata = {
          predictionId,
          videoUrl,
          replicateVideoUrl: videoUrl, // Direct Replicate URL
          voiceUrl,
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
          videoUrl,
          voiceUrl,
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
      })()
      
      assets.push(asset)
      
      // Update job with current progress
      job.assets = assets
      job.status = assets.every(a => a.status === 'completed') 
        ? 'completed' 
        : assets.some(a => a.status === 'failed') 
          ? 'failed' 
          : 'processing'
      await saveJob(job)
      
      // If segment succeeded and it's not the last segment, extract frames for next segment
      if (asset.status === 'completed' && asset.videoUrl && idx < segmentsToProcess.length - 1) {
        try {
          console.log(`[Segment ${idx}] Extracting frames from completed video for next segment`)
          const segmentDuration = segment.endTime - segment.startTime
          
          // Download video to local temp file
          const localVideoPath = await downloadFile(asset.videoUrl)
          const tempPaths = [localVideoPath]
          
          try {
            // Extract 3 frames from the end of the video
            const framePaths = await extractFramesFromVideo(localVideoPath, segmentDuration)
            tempPaths.push(...framePaths)
            
            console.log(`[Segment ${idx}] Extracted ${framePaths.length} frames:`, framePaths)
            
            // Upload frames to Replicate to get public URLs for OpenAI Vision
            const frameUrls = await Promise.all(
              framePaths.map(async (framePath) => {
                return await uploadFileToReplicate(framePath)
              })
            )
            
            console.log(`[Segment ${idx}] Frame URLs for analysis:`, frameUrls)
            
            // Use OpenAI Vision to select the best frame
            const frameAnalysis = await callOpenAIMCP('analyze_frames', {
              frameUrls,
            })
            
            console.log(`[Segment ${idx}] Frame analysis result:`, JSON.stringify(frameAnalysis, null, 2))
            
            // Get the selected frame index (0-based)
            const selectedFrameIndex = frameAnalysis.selectedFrameIndex ?? (frameAnalysis.selectedFrame - 1)
            const selectedFramePath = framePaths[selectedFrameIndex]
            
            if (!selectedFramePath) {
              console.warn(`[Segment ${idx}] Invalid frame index ${selectedFrameIndex}, using first frame`)
              previousFrameImage = framePaths[0]
            } else {
              previousFrameImage = selectedFramePath
              console.log(`[Segment ${idx}] Selected frame ${frameAnalysis.selectedFrame} (index ${selectedFrameIndex}) for next segment`)
              console.log(`[Segment ${idx}] Selected frame reasoning: ${frameAnalysis.reasoning}`)
            }
          } finally {
            // Clean up temp files (video and frames)
            await cleanupTempFiles(tempPaths)
            console.log(`[Segment ${idx}] Cleaned up ${tempPaths.length} temp files`)
          }
        } catch (frameError: any) {
          // Don't fail the entire job if frame extraction fails - just log and continue
          console.error(`[Segment ${idx}] Frame extraction failed:`, frameError.message)
          console.warn(`[Segment ${idx}] Continuing without frame continuity for next segment`)
          previousFrameImage = null
        }
      }
    }

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

