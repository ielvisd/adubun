import { z } from 'zod'
import sharp from 'sharp'
import { callReplicateMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { saveAsset, deleteFile } from '../utils/storage'
import { uploadFileToS3 } from '../utils/s3-upload'
import { createCharacterConsistencyInstruction, formatCharactersForPrompt } from '../utils/character-extractor'
import type { Storyboard, Segment, Character } from '~/types/generation'

const generateSingleFrameSchema = z.object({
  storyboard: z.object({
    id: z.string(),
    segments: z.array(z.object({
      type: z.enum(['hook', 'body', 'cta']),
      description: z.string(),
      visualPrompt: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      firstFrameImage: z.string().optional(),
      lastFrameImage: z.string().optional(),
    })),
    characters: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string(),
      gender: z.enum(['male', 'female', 'non-binary', 'unspecified']),
      age: z.string().optional(),
      physicalFeatures: z.string().optional(),
      clothing: z.string().optional(),
      role: z.string(),
    })).optional(),
    meta: z.object({
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      mode: z.enum(['demo', 'production']).optional(),
      mood: z.string().optional(),
    }),
  }),
  productImages: z.array(z.string()).optional(),
  story: z.object({
    description: z.string(),
    hook: z.string(),
    bodyOne: z.string(),
    bodyTwo: z.string(),
    callToAction: z.string(),
  }),
  segmentIndex: z.number(),
  frameType: z.enum(['first', 'last']),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  resolution: z.enum(['720p', '1080p']),
})

const getDimensions = (aspectRatio: string, resolution: string) => {
  const is720p = resolution === '720p'
  switch (aspectRatio) {
    case '9:16':
      return { width: is720p ? 720 : 1080, height: is720p ? 1280 : 1920 }
    case '16:9':
      return { width: is720p ? 1280 : 1920, height: is720p ? 720 : 1080 }
    case '1:1':
      return { width: is720p ? 720 : 1080, height: is720p ? 720 : 1080 }
    default:
      return { width: is720p ? 720 : 1080, height: is720p ? 1280 : 1920 }
  }
}

const enforceImageResolution = async (imageUrl: string, targetWidth: number, targetHeight: number): Promise<string> => {
  try {
    console.log(`[Generate Single Frame] Enforcing resolution: ${targetWidth}x${targetHeight} for ${imageUrl}`)
    
    // Download image
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    
    // Resize using sharp
    const resizedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'center',
      })
      .toBuffer()
    
    // Save resized image
    const extension = imageUrl.split('.').pop()?.toLowerCase() || 'jpg'
    const resizedPath = await saveAsset(resizedBuffer, extension)
    
    // Upload to S3 if configured
    let finalUrl = resizedPath
    try {
      const s3Url = await uploadFileToS3(resizedPath, 'assets')
      if (s3Url) {
        finalUrl = s3Url
        // Clean up local file
        await deleteFile(resizedPath)
      }
    } catch (s3Error) {
      console.warn('[Generate Single Frame] S3 upload failed, using local path:', s3Error)
    }
    
    console.log(`[Generate Single Frame] Resolution enforced: ${finalUrl}`)
    return finalUrl
  } catch (error: any) {
    console.error(`[Generate Single Frame] Error enforcing resolution:`, error)
    return imageUrl
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { storyboard, productImages = [], story, segmentIndex, frameType, aspectRatio, resolution } = generateSingleFrameSchema.parse(body)
    
    const segment = storyboard.segments[segmentIndex]
    if (!segment) {
      throw createError({
        statusCode: 400,
        message: `Segment at index ${segmentIndex} not found`,
      })
    }
    
    const dimensions = getDimensions(aspectRatio, resolution)
    const characters = storyboard.characters || []
    const mood = storyboard.meta.mood || 'professional'
    
    // Prepare product images (reference images)
    const referenceImages: string[] = []
    if (productImages && productImages.length > 0) {
      for (const productImage of productImages) {
        if (productImage && typeof productImage === 'string') {
          referenceImages.push(productImage)
        }
      }
    }
    
    // Build prompts based on frame type and segment
    let nanoPrompt = ''
    let previousFrameImage: string | undefined = undefined
    let includePreviousFrameInInput = true
    
    if (frameType === 'first') {
      // First frame: uses segment description + story
      const characterInstruction = createCharacterConsistencyInstruction(characters, mood)
      nanoPrompt = `${characterInstruction}${segment.description}. ${story.description}. ${segment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
      
      // For first frame, no previous frame
      includePreviousFrameInInput = false
    } else {
      // Last frame: uses current segment + next segment description
      const characterInstruction = createCharacterConsistencyInstruction(characters, mood)
      
      if (segment.type === 'hook') {
        // Hook last → uses hook + body1
        const body1Segment = storyboard.segments.find(s => s.type === 'body')
        if (body1Segment) {
          nanoPrompt = `${characterInstruction}${segment.description}. ${body1Segment.description}. ${story.description}. ${segment.visualPrompt}, transitioning to ${body1Segment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
        } else {
          nanoPrompt = `${characterInstruction}${segment.description}. ${story.description}. ${segment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
        }
        // Use hook first frame as previous
        previousFrameImage = segment.firstFrameImage
      } else if (segment.type === 'body') {
        // Body last → uses body + next body or CTA
        const nextSegment = storyboard.segments[segmentIndex + 1]
        if (nextSegment) {
          nanoPrompt = `${characterInstruction}${segment.description}. ${nextSegment.description}. ${story.description}. ${segment.visualPrompt}, transitioning to ${nextSegment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
        } else {
          nanoPrompt = `${characterInstruction}${segment.description}. ${story.description}. ${segment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
        }
        // Use body first frame as previous (which should be hook last)
        previousFrameImage = segment.firstFrameImage
      } else if (segment.type === 'cta') {
        // CTA last → uses CTA only
        const characterInstruction = createCharacterConsistencyInstruction(characters, mood)
        nanoPrompt = `${characterInstruction}${segment.description}. ${story.description}. ${segment.visualPrompt}, ${aspectRatio} aspect ratio, professional product photography, sharp faces, clear facial features, detailed faces, professional portrait quality`
        // Use CTA first frame as previous (which should be body2 last)
        previousFrameImage = segment.firstFrameImage
      }
    }
    
    // Build image input array
    const imageInputs: string[] = []
    if (referenceImages.length > 0) {
      imageInputs.push(...referenceImages)
    }
    if (previousFrameImage && includePreviousFrameInInput) {
      imageInputs.push(previousFrameImage)
    }
    
    console.log(`[Generate Single Frame] Generating ${frameType} frame for segment ${segmentIndex}`)
    console.log(`[Generate Single Frame] Prompt: ${nanoPrompt}`)
    console.log(`[Generate Single Frame] Image inputs: ${imageInputs.length}`)
    
    // Step 1: Generate with Nano-banana
    const nanoResult = await callReplicateMCP('generate_image', {
      model: 'google/nano-banana',
      prompt: nanoPrompt,
      image_input: imageInputs.length > 0 ? imageInputs : undefined,
      aspect_ratio: aspectRatio,
      output_format: 'jpg',
    })
    
    const nanoPredictionId = nanoResult.predictionId || nanoResult.id
    if (!nanoPredictionId) {
      throw createError({
        statusCode: 500,
        message: 'Failed to get prediction ID from Nano-banana',
      })
    }
    
    // Poll for Nano-banana result
    let nanoStatus = 'starting'
    let nanoAttempts = 0
    while (nanoStatus !== 'succeeded' && nanoStatus !== 'failed' && nanoAttempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: nanoPredictionId })
      nanoStatus = statusResult.status || 'starting'
      nanoAttempts++
      
      if (nanoStatus === 'succeeded') {
        const nanoResultData = await callReplicateMCP('get_prediction_result', { predictionId: nanoPredictionId })
        const nanoImageUrl = nanoResultData.videoUrl || nanoResultData.output || nanoResultData.url
        
        if (!nanoImageUrl) {
          throw createError({
            statusCode: 500,
            message: 'Nano-banana did not return an image URL',
          })
        }
        
        console.log(`[Generate Single Frame] Nano-banana succeeded: ${nanoImageUrl}`)
        
        // Step 2: Enhance with Seedream-4
        const referenceMatchInstruction = referenceImages.length > 0 
          ? 'CRITICAL INSTRUCTIONS - READ CAREFULLY: Your ONLY job is to enhance lighting, color saturation, and image quality. DO NOT ALTER THE PRODUCT IN ANY WAY. The product must remain PIXEL-PERFECT identical to the reference images - same size, same shape, same colors, same design, same position. DO NOT change product dimensions, proportions, or placement, even slightly. DO NOT add new products. DO NOT modify existing products. Products that appear small in the frame must stay small - do not make them larger or more prominent. Preserve all text, labels, logos, and typography EXACTLY - no distortions, no alterations, no modifications. Keep all text perfectly readable and unchanged. CRITICAL: Keep human faces, facial features, body anatomy, body positions, hand positions, and poses EXACTLY as they appear in the input image - do not alter, modify, or change them in any way. Your enhancement should be LIMITED TO: improved lighting, better color saturation, enhanced clarity. Nothing else should change. The reference images show the EXACT product appearance - copy it with absolute precision. '
          : ''
        
        // Seedream should ONLY enhance colors, lighting, and quality - NOT reinterpret the scene
        // Keep the prompt minimal to prevent scene reinterpretation
        const seedreamPrompt = `${referenceMatchInstruction}Enhance image quality: improve lighting, color saturation, and clarity. Preserve everything else EXACTLY as shown in the input image - same composition, same poses, same actions, same people, same products, same scene. Do not change what people are doing, do not change camera angles, do not change the scene content. Only enhance visual quality: better colors, better lighting, sharper details. Professional product photography quality.`
        
        try {
          console.log(`[Generate Single Frame] Starting Seedream-4 enhancement...`)
          
          const seedreamResult = await callReplicateMCP('generate_image', {
            model: 'bytedance/seedream-4',
            prompt: seedreamPrompt,
            image_input: [nanoImageUrl],
            size: 'custom',
            width: dimensions.width,
            height: dimensions.height,
            aspect_ratio: aspectRatio,
            enhance_prompt: true,
          })
          
          const seedreamPredictionId = seedreamResult.predictionId || seedreamResult.id
          if (!seedreamPredictionId) {
            throw new Error('Seedream-4 did not return a prediction ID')
          }
          
          // Poll for Seedream-4 result
          let seedreamStatus = 'starting'
          let seedreamAttempts = 0
          const maxAttempts = 90
          
          while (seedreamStatus !== 'succeeded' && seedreamStatus !== 'failed' && seedreamAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusResult = await callReplicateMCP('check_prediction_status', { predictionId: seedreamPredictionId })
            seedreamStatus = statusResult.status || 'starting'
            seedreamAttempts++
            
            if (seedreamStatus === 'succeeded') {
              const seedreamResultData = await callReplicateMCP('get_prediction_result', { predictionId: seedreamPredictionId })
              const seedreamImageUrl = seedreamResultData.videoUrl || seedreamResultData.output || seedreamResultData.url
              
              if (seedreamImageUrl) {
                // Enforce resolution
                const finalImageUrl = await enforceImageResolution(seedreamImageUrl, dimensions.width, dimensions.height)
                
                await trackCost('generate-single-frame', 0.05, {
                  segmentIndex,
                  frameType,
                  aspectRatio,
                  resolution,
                })
                
                return {
                  frames: [{
                    segmentIndex,
                    frameType,
                    imageUrl: finalImageUrl,
                  }],
                }
              }
            }
          }
          
          // If Seedream-4 failed, fall back to Nano-banana
          console.warn(`[Generate Single Frame] Seedream-4 failed or timed out, using Nano-banana result`)
          const finalImageUrl = await enforceImageResolution(nanoImageUrl, dimensions.width, dimensions.height)
          
          await trackCost('generate-single-frame', 0.02, {
            segmentIndex,
            frameType,
            aspectRatio,
            resolution,
          })
          
          return {
            frames: [{
              segmentIndex,
              frameType,
              imageUrl: finalImageUrl,
            }],
          }
        } catch (seedreamError: any) {
          console.error(`[Generate Single Frame] Seedream-4 error:`, seedreamError)
          // Fall back to Nano-banana
          const finalImageUrl = await enforceImageResolution(nanoImageUrl, dimensions.width, dimensions.height)
          
          await trackCost('generate-single-frame', 0.02, {
            segmentIndex,
            frameType,
            aspectRatio,
            resolution,
          })
          
          return {
            frames: [{
              segmentIndex,
              frameType,
              imageUrl: finalImageUrl,
            }],
          }
        }
      }
    }
    
    throw createError({
      statusCode: 500,
      message: 'Nano-banana generation failed or timed out',
    })
  } catch (error: any) {
    console.error('[Generate Single Frame] Error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate single frame',
    })
  }
})

