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

// Helper function to enhance visual prompts for Kling with more specific details
function enhanceKlingPrompt(basePrompt: string, segmentDescription?: string, segmentIndex?: number, totalSegments?: number): string {
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
  
  // Product consistency and text preservation enhancements
  const productKeywords = ['can', 'product', 'bottle', 'package', 'label', 'brand', 'drink', 'energy drink']
  const hasProduct = productKeywords.some(keyword => 
    enhanced.toLowerCase().includes(keyword) || 
    (segmentDescription && segmentDescription.toLowerCase().includes(keyword))
  )
  
  if (hasProduct) {
    // Add negative guidance to prevent text degradation
    const negativeGuidance = 'avoid text degradation, blurred text, unreadable labels, distorted product design, text fading, label blur'
    if (!enhanced.toLowerCase().includes('avoid text degradation') && !enhanced.toLowerCase().includes('blurred text')) {
      enhanced += `. ${negativeGuidance}`
    }
    
    // Add positive instructions for product consistency
    const productConsistency = 'maintain clear readable text on product label throughout, keep product design consistent with reference image, preserve brand name and flavor details visibility, ensure product appearance remains stable'
    if (!enhanced.toLowerCase().includes('maintain clear readable text') && !enhanced.toLowerCase().includes('product design consistent')) {
      enhanced += `. CRITICAL: ${productConsistency}`
    }
  }
  
  // Add story continuity instructions for subsequent segments
  if (segmentIndex !== undefined && segmentIndex > 0 && totalSegments && totalSegments > 1) {
    if (!enhanced.toLowerCase().includes('continue') && !enhanced.toLowerCase().includes('transition')) {
      enhanced += ', seamlessly continuing the story from the previous scene, maintaining narrative flow'
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
    const mode = storyboard.meta.mode || 'demo'
    const segmentsToProcess = mode === 'demo' 
      ? storyboard.segments.slice(0, 1)
      : storyboard.segments

    // Generate assets sequentially (for frame continuity)
    const assets: Asset[] = []
    let previousVideoUrl: string | null = null
    let previousFrameImage: string | null = null
    
    console.log(`[Generate Assets] Starting sequential generation of ${segmentsToProcess.length} segments`)
    console.log(`[Generate Assets] Mode: ${mode}`)
    console.log(`[Generate Assets] Total segments in storyboard: ${storyboard.segments.length}`)
    if (mode === 'demo' && storyboard.segments.length > 1) {
      console.warn(`[Generate Assets] WARNING: Demo mode - only processing first segment. ${storyboard.segments.length - 1} segment(s) will be skipped.`)
    }
    
    for (const [idx, segment] of segmentsToProcess.entries()) {
      console.log(`\n[Generate Assets] ===== Starting Segment ${idx + 1}/${segmentsToProcess.length} =====`)
      console.log(`[Segment ${idx}] Type: ${segment.type}, Duration: ${segment.endTime - segment.startTime}s`)
      console.log(`[Segment ${idx}] Previous frame image: ${previousFrameImage || 'none (first segment or no continuity)'}`)
      
      // Debug: Log all image-related fields on the segment
      console.log(`[Segment ${idx}] Segment image fields:`, {
        hasImage: !!(segment as any).image,
        image: (segment as any).image,
        hasLastFrame: !!(segment as any).lastFrame,
        lastFrame: (segment as any).lastFrame,
        hasReferenceImages: !!(segment as any).referenceImages && Array.isArray((segment as any).referenceImages),
        referenceImagesCount: (segment as any).referenceImages ? ((segment as any).referenceImages.length || 0) : 0,
        referenceImages: (segment as any).referenceImages,
        hasFirstFrameImage: !!segment.firstFrameImage,
        firstFrameImage: segment.firstFrameImage,
        hasSubjectReference: !!segment.subjectReference,
        subjectReference: segment.subjectReference,
      })
      
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
          videoPrompt = enhanceKlingPrompt(selectedPrompt, segment.description, idx, segmentsToProcess.length)
        }
        
        const videoParams: any = {
          model,
          prompt: videoPrompt,
          duration: segment.endTime - segment.startTime,
          aspect_ratio: storyboard.meta.aspectRatio,
        }

        // Add image inputs if provided - upload to Replicate and get public URLs
        if (model === 'google/veo-3.1') {
          // Priority: segment.image > previousFrameImage > storyboard.meta.image
          if ((segment as any).image) {
            videoParams.image = await prepareImageInput((segment as any).image)
            console.log(`[Segment ${idx}] Using segment-specific input image: ${(segment as any).image}`)
          } else if (previousFrameImage) {
            videoParams.image = await prepareImageInput(previousFrameImage)
            console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
          } else if (storyboard.meta.image) {
            videoParams.image = await prepareImageInput(storyboard.meta.image)
            console.log(`[Segment ${idx}] Using storyboard meta image: ${storyboard.meta.image}`)
          }
          
          // Priority: segment.referenceImages > storyboard.meta.referenceImages
          // Note: If reference images are provided, last_frame is ignored per Veo documentation
          if ((segment as any).referenceImages && Array.isArray((segment as any).referenceImages) && (segment as any).referenceImages.length > 0) {
            videoParams.reference_images = await Promise.all(
              (segment as any).referenceImages.map((img: string) => prepareImageInput(img))
            )
            console.log(`[Segment ${idx}] Using segment-specific reference images: ${(segment as any).referenceImages.length} images`)
            console.log(`[Segment ${idx}] Reference images provided - last_frame will be ignored per Veo documentation`)
          } else if (storyboard.meta.referenceImages && storyboard.meta.referenceImages.length > 0) {
            videoParams.reference_images = await Promise.all(
              storyboard.meta.referenceImages.map((img: string) => prepareImageInput(img))
            )
            console.log(`[Segment ${idx}] Using storyboard meta reference images: ${storyboard.meta.referenceImages.length} images`)
            console.log(`[Segment ${idx}] Reference images provided - last_frame will be ignored per Veo documentation`)
          } else {
            // Only set last_frame if reference images are NOT provided
            // Priority: segment.lastFrame > storyboard.meta.lastFrame
            if ((segment as any).lastFrame) {
              videoParams.last_frame = await prepareImageInput((segment as any).lastFrame)
              console.log(`[Segment ${idx}] Using segment-specific last frame: ${(segment as any).lastFrame}`)
            } else if (storyboard.meta.lastFrame) {
              videoParams.last_frame = await prepareImageInput(storyboard.meta.lastFrame)
              console.log(`[Segment ${idx}] Using storyboard meta last frame: ${storyboard.meta.lastFrame}`)
            }
          }
          
          // Priority: segment.negativePrompt > storyboard.meta.negativePrompt
          if ((segment as any).negativePrompt) {
            videoParams.negative_prompt = (segment as any).negativePrompt
            console.log(`[Segment ${idx}] Using segment-specific negative prompt`)
          } else if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = storyboard.meta.negativePrompt
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
          // Priority: segment.image > previousFrameImage > firstFrameImage/subjectReference > storyboard.meta.image
          if ((segment as any).image) {
            videoParams.image = await prepareImageInput((segment as any).image)
            console.log(`[Segment ${idx}] Using segment-specific input image: ${(segment as any).image}`)
          } else if (previousFrameImage) {
            videoParams.image = await prepareImageInput(previousFrameImage)
            console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
          } else {
            // Use segment-specific firstFrameImage or subjectReference, or fall back to global image
            const imageToUse = firstFrameImage || subjectReference || storyboard.meta.image
            if (imageToUse) {
              videoParams.image = await prepareImageInput(imageToUse)
            }
          }
          
          // Priority: segment.negativePrompt > storyboard.meta.negativePrompt
          if ((segment as any).negativePrompt) {
            videoParams.negative_prompt = (segment as any).negativePrompt
            console.log(`[Segment ${idx}] Using segment-specific negative prompt`)
          } else if (storyboard.meta.negativePrompt) {
            videoParams.negative_prompt = storyboard.meta.negativePrompt
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
        } else if (model === 'kwaivgi/kling-v2.5-turbo-pro') {
          // Additional negative guidance for Kling (already included in enhanceKlingPrompt, but add general ones)
          const generalNegativeGuidance = 'avoid detached body parts, unrealistic actions, abstract visuals, distorted anatomy, floating objects'
          if (!videoPrompt.toLowerCase().includes('avoid detached') && !videoPrompt.toLowerCase().includes('unrealistic actions')) {
            videoParams.prompt = `${videoPrompt}. ${generalNegativeGuidance}`
          } else {
            videoParams.prompt = videoPrompt
          }
          
          // Product reference image strategy:
          // - For first segment: Use initial product reference (firstFrameImage, subjectReference, or storyboard.meta.image)
          // - For subsequent segments: Use BOTH previous frame AND original product reference if available
          const originalProductReference = firstFrameImage || subjectReference || storyboard.meta.image
          
          if (idx === 0) {
            // First segment: Use original product reference
            if (originalProductReference) {
              console.log(`[Segment ${idx}] Preparing original product reference: ${originalProductReference}`)
              videoParams.image_legacy = await prepareImageInput(originalProductReference)
              console.log(`[Segment ${idx}] Using original product reference image: ${originalProductReference}`)
            }
          } else {
            // Subsequent segments: Prioritize previous frame for continuity, but note original reference in prompt
            if (previousFrameImage) {
              console.log(`[Segment ${idx}] Preparing previous frame for continuity: ${previousFrameImage}`)
              console.log(`[Segment ${idx}] previousFrameImage type: ${typeof previousFrameImage}, length: ${previousFrameImage?.length}`)
              videoParams.image_legacy = await prepareImageInput(previousFrameImage)
              console.log(`[Segment ${idx}] Using previous frame for continuity: ${previousFrameImage}`)
              
              // Add instruction to maintain product appearance from original reference
              if (originalProductReference && !videoParams.prompt.toLowerCase().includes('reference image')) {
                videoParams.prompt = `${videoParams.prompt}. Maintain product appearance matching the original reference image`
                console.log(`[Segment ${idx}] Added instruction to maintain product appearance from original reference`)
              }
            } else if (originalProductReference) {
              videoParams.image_legacy = await prepareImageInput(originalProductReference)
              console.log(`[Segment ${idx}] Using original product reference image (no previous frame): ${originalProductReference}`)
            }
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
      
      console.log(`[Segment ${idx}] Asset generation completed. Status: ${asset.status}`)
      if (asset.status === 'completed') {
        console.log(`[Segment ${idx}] Video URL: ${asset.videoUrl || 'none'}`)
      } else if (asset.status === 'failed') {
        console.log(`[Segment ${idx}] Error: ${asset.error || 'unknown'}`)
      }
      
      // Update job with current progress
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
      
      // If segment succeeded and it's not the last segment, extract frames for next segment
      if (asset.status === 'completed' && asset.videoUrl && idx < segmentsToProcess.length - 1) {
        console.log(`[Segment ${idx}] Segment completed successfully. Starting frame extraction for next segment...`)
        console.log(`[Segment ${idx}] Video URL: ${asset.videoUrl}`)
        console.log(`[Segment ${idx}] Remaining segments: ${segmentsToProcess.length - idx - 1}`)
        
        try {
          const segmentDuration = segment.endTime - segment.startTime
          console.log(`[Segment ${idx}] Segment duration: ${segmentDuration}s`)
          
          // Download video to local temp file
          console.log(`[Segment ${idx}] Downloading video from: ${asset.videoUrl}`)
          const localVideoPath = await downloadFile(asset.videoUrl)
          console.log(`[Segment ${idx}] Video downloaded to: ${localVideoPath}`)
          const tempPaths = [localVideoPath]
          
          try {
            // Extract the last frame from the end of the video
            console.log(`[Segment ${idx}] Extracting last frame from video...`)
            const framePaths = await extractFramesFromVideo(localVideoPath, segmentDuration)
            console.log(`[Segment ${idx}] Successfully extracted last frame:`, framePaths[0])
            tempPaths.push(...framePaths)
            
            if (framePaths.length === 0) {
              throw new Error('No frame was extracted from video')
            }
            
            // Upload the last frame to Replicate to get public URL
            console.log(`[Segment ${idx}] Uploading last frame to Replicate...`)
            console.log(`[Segment ${idx}] Frame path to upload: ${framePaths[0]}`)
            console.log(`[Segment ${idx}] Frame path type: ${typeof framePaths[0]}, length: ${framePaths[0]?.length}`)
            
            // Validate frame path before uploading
            if (!framePaths[0] || typeof framePaths[0] !== 'string') {
              throw new Error(`Invalid frame path: ${typeof framePaths[0]}`)
            }
            
            const lastFrameUrl = await uploadFileToReplicate(framePaths[0])
            console.log(`[Segment ${idx}] Last frame uploaded to: ${lastFrameUrl}`)
            
            // Always use the last frame for the next segment
            // Validate the URL before storing
            if (!lastFrameUrl || typeof lastFrameUrl !== 'string') {
              throw new Error(`Invalid frame URL returned: ${typeof lastFrameUrl}`)
            }
            previousFrameImage = lastFrameUrl
            console.log(`[Segment ${idx}] ✓ Using last frame for next segment continuity`)
            console.log(`[Segment ${idx}] Last frame URL: ${lastFrameUrl}`)
            console.log(`[Segment ${idx}] previousFrameImage set to: ${previousFrameImage}`)
          } catch (innerError: any) {
            console.error(`[Segment ${idx}] Error during frame extraction/analysis:`, innerError.message)
            console.error(`[Segment ${idx}] Error stack:`, innerError.stack)
            throw innerError // Re-throw to be caught by outer catch
          } finally {
            // Clean up temp files (video and frames)
            console.log(`[Segment ${idx}] Cleaning up ${tempPaths.length} temp files...`)
            await cleanupTempFiles(tempPaths).catch((cleanupError) => {
              console.warn(`[Segment ${idx}] Error during cleanup:`, cleanupError.message)
            })
            console.log(`[Segment ${idx}] Cleanup completed`)
          }
        } catch (frameError: any) {
          // Don't fail the entire job if frame extraction fails - just log and continue
          console.error(`[Segment ${idx}] ✗ Last frame extraction failed:`, frameError.message)
          console.error(`[Segment ${idx}] Frame error stack:`, frameError.stack)
          console.warn(`[Segment ${idx}] Continuing to next segment without frame continuity`)
          previousFrameImage = null
        }
        
        console.log(`[Segment ${idx}] Last frame extraction completed. Previous frame image: ${previousFrameImage || 'none'}`)
      } else {
        if (asset.status !== 'completed') {
          console.log(`[Segment ${idx}] Segment did not complete successfully (status: ${asset.status}), skipping frame extraction`)
        } else if (!asset.videoUrl) {
          console.log(`[Segment ${idx}] Segment completed but no video URL, skipping frame extraction`)
        } else if (idx >= segmentsToProcess.length - 1) {
          console.log(`[Segment ${idx}] This is the last segment, no frame extraction needed`)
        }
      }
      
      // Log that we're continuing to next segment
      if (idx < segmentsToProcess.length - 1) {
        console.log(`[Segment ${idx}] Moving to next segment (${idx + 1}/${segmentsToProcess.length})...`)
      } else {
        console.log(`[Segment ${idx}] This was the last segment. Generation complete.`)
      }
      
      console.log(`[Segment ${idx}] ===== Completed Segment ${idx + 1}/${segmentsToProcess.length} =====\n`)
    }
    
    console.log(`[Generate Assets] All segments processed. Total assets: ${assets.length}`)
    console.log(`[Generate Assets] Completed: ${assets.filter(a => a.status === 'completed').length}, Failed: ${assets.filter(a => a.status === 'failed').length}`)

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

