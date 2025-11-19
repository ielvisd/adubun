import { z } from 'zod'
import Replicate from 'replicate'
import { trackCost } from '../utils/cost-tracker'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { uploadFileToS3 } from '../utils/s3-upload'
import sharp from 'sharp'

const editFrameImageSchema = z.object({
  imageUrl: z.string(),
  prompt: z.string().min(1, 'Prompt is required'),
  mask: z.string().nullable().optional(), // base64 PNG data URL, can be null or undefined
  aspectRatio: z.enum(['16:9', '9:16']),
  segmentIndex: z.number().optional(),
  frameType: z.enum(['firstFrameImage', 'lastFrameImage']).optional(),
})

export default defineEventHandler(async (event) => {
  let tempFilePath: string | null = null
  let maskTempPath: string | undefined = undefined
  
  try {
    const body = await readBody(event)
    const { imageUrl, prompt, mask, aspectRatio, segmentIndex, frameType } = editFrameImageSchema.parse(body)

    const config = useRuntimeConfig()
    const replicate = new Replicate({
      auth: config.replicateApiKey,
    })

    // Get original image dimensions to preserve exact resolution
    console.log('[Edit Frame Image] Fetching original image to get dimensions...')
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch original image: ${imageResponse.statusText}`)
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const imageMetadata = await sharp(imageBuffer).metadata()
    const originalWidth = imageMetadata.width || 1024
    const originalHeight = imageMetadata.height || 576
    
    console.log('[Edit Frame Image] Starting image editing...')
    console.log('[Edit Frame Image] Prompt:', prompt)
    console.log('[Edit Frame Image] Has mask:', !!mask)
    console.log('[Edit Frame Image] Aspect ratio:', aspectRatio)
    console.log('[Edit Frame Image] Original dimensions:', { width: originalWidth, height: originalHeight })

    // Handle mask if provided
    let maskUrl: string | undefined = undefined
    let hasMask = false
    
    if (mask && mask !== null && mask.trim() !== '') {
      try {
        // Convert base64 data URL to buffer
        const base64Data = mask.replace(/^data:image\/png;base64,/, '')
        const maskBuffer = Buffer.from(base64Data, 'base64')
        
        // Save mask to temp file
        maskTempPath = join(tmpdir(), `mask-${nanoid()}.png`)
        await fs.writeFile(maskTempPath, maskBuffer)
        
        // Upload mask to S3 so Replicate can access it
        maskUrl = await uploadFileToS3(maskTempPath, 'masks')
        hasMask = true
        console.log('[Edit Frame Image] User mask uploaded:', maskUrl)
      } catch (error) {
        console.error('[Edit Frame Image] Failed to process user mask:', error)
        throw new Error('Failed to process mask')
      }
    }

    // Choose model based on whether mask is present
    let model: string
    const input: any = {}
    
    if (hasMask && maskUrl) {
      // Use Stable Diffusion Inpainting for masked edits
      model = 'stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3'
      
      input.image = imageUrl
      input.mask = maskUrl
      input.prompt = prompt
      input.num_inference_steps = 30
      input.guidance_scale = 7.5
      
      console.log('[Edit Frame Image] Using SD Inpainting model (with user-drawn mask)')
    } else {
      // Use SDXL for full image edits (no mask)
      model = 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc'
      
      input.image = imageUrl
      input.prompt = prompt
      input.strength = 0.5 // How much to modify the image (0-1, lower = preserve more original)
      input.num_inference_steps = 30
      input.guidance_scale = 7.5
      
      console.log('[Edit Frame Image] Using SDXL model (no mask - full image edit)')
      console.log('[Edit Frame Image] Strength: 0.5 (moderate modification)')
    }

    console.log('[Edit Frame Image] Model:', model)
    console.log('[Edit Frame Image] Input parameters:', {
      hasImage: !!input.image,
      hasMask: !!input.mask,
      prompt: input.prompt,
      strength: input.strength,
      num_inference_steps: input.num_inference_steps,
      guidance_scale: input.guidance_scale,
    })
    
    console.log('[Edit Frame Image] Calling Replicate model...')
    const output = await replicate.run(model, { input }) as string | string[]

    // Handle different output formats
    const editedImageUrl = Array.isArray(output) ? output[0] : output
    
    if (!editedImageUrl) {
      throw new Error('Model did not return an image')
    }

    console.log('[Edit Frame Image] ✓ Model completed:', editedImageUrl)

    // Download the edited image
    console.log('[Edit Frame Image] Downloading edited image...')
    const response = await fetch(editedImageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download edited image: ${response.statusText}`)
    }

    const editedImageBuffer = Buffer.from(await response.arrayBuffer())
    
    // Resize back to exact original dimensions to preserve resolution
    console.log('[Edit Frame Image] Resizing to original dimensions:', { width: originalWidth, height: originalHeight })
    const resizedBuffer = await sharp(editedImageBuffer)
      .resize(originalWidth, originalHeight, {
        fit: 'fill', // Fill exact dimensions
        position: 'center',
      })
      .toBuffer()
    
    // Save to temp file
    tempFilePath = join(tmpdir(), `edited-frame-${nanoid()}.png`)
    await fs.writeFile(tempFilePath, resizedBuffer)
    console.log('[Edit Frame Image] Saved to temp file:', tempFilePath)
    
    // Upload to S3
    console.log('[Edit Frame Image] Uploading to S3...')
    const s3Url = await uploadFileToS3(tempFilePath, 'frames')
    console.log('[Edit Frame Image] ✓ Uploaded to S3:', s3Url)

    // Clean up temp files
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(console.error)
    }
    if (maskTempPath) {
      await fs.unlink(maskTempPath).catch(console.error)
    }

    // Track cost - different models have different costs
    // SD Inpainting: ~$0.005 per run, SDXL: ~$0.008 per run
    const cost = hasMask ? 0.01 : 0.01
    await trackCost('frame-image-edit', cost, {
      segmentIndex,
      frameType,
      hasMask: !!mask,
      aspectRatio,
    })

    return {
      success: true,
      imageUrl: s3Url,
      originalUrl: imageUrl,
    }
  } catch (error: any) {
    console.error('[Edit Frame Image] Error:', error)
    
    // Clean up temp files on error
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(console.error)
    }
    if (maskTempPath) {
      await fs.unlink(maskTempPath).catch(console.error)
    }
    
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to edit frame image',
    })
  }
})

