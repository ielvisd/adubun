import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { uploadFileToS3 } from '../utils/s3-upload'
import { saveAsset, deleteFile } from '../utils/storage'

const generateStoriesSchema = z.object({
  prompt: z.string().min(1),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).max(10).optional(),
  aspectRatio: z.enum(['16:9', '9:16']),
  mood: z.string().optional(),
  adType: z.string().optional(),
  model: z.string().optional(),
  generateVoiceover: z.boolean().optional(),
})

// Retry helper function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: any
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      // Check if error is retryable (timeout or network errors)
      const isTimeout = error.message?.includes('timed out') || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('Request timed out') ||
                       error.code === -32001
      
      const isNetworkError = error.code === 'EPIPE' || 
                            error.message?.includes('connection') ||
                            error.message?.includes('ECONNREFUSED') ||
                            error.message?.includes('MCP server connection')
      
      // Don't retry on non-retryable errors (unless it's the last attempt)
      if (!isTimeout && !isNetworkError && attempt < maxRetries - 1) {
        throw error // Don't retry non-retryable errors
      }
      
      // If this is the last attempt, throw the error
      if (attempt >= maxRetries - 1) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt)
      console.log(`[Generate Stories] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    let body: any = {}

    // Parse form data
    if (formData) {
      for (const item of formData) {
        if (item.name === 'prompt') {
          body.prompt = item.data.toString()
        } else if (item.name === 'aspectRatio') {
          body.aspectRatio = item.data.toString()
        } else if (item.name === 'mood') {
          body.mood = item.data.toString()
        } else if (item.name === 'adType') {
          body.adType = item.data.toString()
        } else if (item.name === 'model') {
          body.model = item.data.toString()
        } else if (item.name === 'generateVoiceover') {
          body.generateVoiceover = item.data.toString() === 'true'
        } else if (item.name === 'productImages' && item.filename && item.data) {
          if (!body.productImages) {
            body.productImages = []
          }
          // Save file temporarily and upload to S3
          const extension = item.filename.split('.').pop() || 'jpg'
          const tempPath = await saveAsset(Buffer.from(item.data), extension)
          const s3Url = await uploadFileToS3(tempPath)
          body.productImages.push(s3Url)
          // Clean up temp file
          await deleteFile(tempPath)
        }
      }
    } else {
      // Try reading as JSON body
      body = await readBody(event)
    }

    const { prompt, productImages = [], aspectRatio, mood, adType, model, generateVoiceover } = generateStoriesSchema.parse(body)

    // Convert product images to URLs (they should already be URLs if from formData, or File objects)
    const imageUrls: string[] = []
    for (const img of productImages) {
      if (typeof img === 'string') {
        imageUrls.push(img)
      } else if (img instanceof File) {
        // This shouldn't happen if we processed formData correctly, but handle it
        const buffer = Buffer.from(await img.arrayBuffer())
        const extension = img.name.split('.').pop() || 'jpg'
        const tempPath = await saveAsset(buffer, extension)
        const s3Url = await uploadFileToS3(tempPath)
        imageUrls.push(s3Url)
        await deleteFile(tempPath)
      }
    }

    // Track cost
    await trackCost('generate-stories', 0.003, { prompt, imageCount: imageUrls.length })

    // Calculate duration based on aspect ratio (PRD mentions ~16 seconds for typical ad)
    // For now, use 16 seconds as default
    const duration = 16

    // Generate 3 story options using OpenAI MCP with retry logic
    const storiesData = await retryWithBackoff(
      () => callOpenAIMCP('generate_ad_stories', {
        prompt,
        imageUrls,
        duration,
        clipCount: 4, // Hook, Body1, Body2, CTA
        clipDuration: 4, // ~4 seconds per scene for 16s total
        mood, // Pass mood to story generation
        adType, // Pass ad type to story generation
      }),
      3, // max 3 retries
      2000 // start with 2 second delay
    )

    // callOpenAIMCP already parses JSON, so storiesData should be an object
    // Handle both direct object and content array formats
    let data = storiesData
    if (storiesData.content && Array.isArray(storiesData.content) && storiesData.content[0]?.text) {
      data = JSON.parse(storiesData.content[0].text)
    } else if (typeof storiesData === 'string') {
      data = JSON.parse(storiesData)
    }

    // Validate and format stories
    const stories = Array.isArray(data.stories) ? data.stories : (Array.isArray(data) ? data : [])

    // Format stories with the correct structure
    // Always generate unique IDs to avoid conflicts when generating multiple stories
    const formattedStories = stories.map((story: any, index: number) => {
      return {
        id: `story-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: story.title || `Story ${index + 1}`,
        description: story.description || `${story.hook || ''} ${story.bodyOne || ''} ${story.bodyTwo || ''} ${story.callToAction || ''}`.trim(),
        emoji: story.emoji || '',
        hook: story.hook || story.hookText || '',
        bodyOne: story.bodyOne || story.body1 || story.body_one || '',
        bodyTwo: story.bodyTwo || story.body2 || story.body_two || '',
        callToAction: story.callToAction || story.cta || story.call_to_action || '',
      }
    })

    // Validate we have at least 1 story
    if (formattedStories.length < 1) {
      throw new Error(`Expected at least 1 story, but received ${formattedStories.length}`)
    }

    // Generate preview image for the story's hook
    console.log('[Generate Stories] Generating preview image...')
    console.log('[Generate Stories] Story hook:', formattedStories[0]?.hook)
    let previewUrl: string | null = null
    
    try {
      const story = formattedStories[0]
      const nanoPrompt = `${story.hook}, ${mood || 'professional'} style, professional product photography, cinematic lighting, high quality, detailed scene`
      console.log('[Generate Stories] Preview prompt:', nanoPrompt)

      const nanoResult = await callReplicateMCP('generate_image', {
        model: 'google/nano-banana',
        prompt: nanoPrompt,
        aspect_ratio: aspectRatio,
        output_format: 'jpg',
        seed: Math.floor(Math.random() * 1000000),
      })

      // Parse result
      let prediction
      if (nanoResult.content && Array.isArray(nanoResult.content) && nanoResult.content[0]?.text) {
        prediction = JSON.parse(nanoResult.content[0].text)
      } else if (typeof nanoResult === 'object' && nanoResult.id) {
        prediction = nanoResult
      } else {
        throw new Error('Unexpected response format from nano-banana')
      }

      console.log('[Generate Stories] Nano-banana prediction ID:', prediction.id)

      // Poll for result (simplified polling)
      let attempts = 0
      const maxAttempts = 30 // 30 seconds max

      while (attempts < maxAttempts && !previewUrl) {
        await new Promise(resolve => setTimeout(resolve, 1000))

        const statusResult = await callReplicateMCP('check_prediction_status', {
          predictionId: prediction.id,
        })

        let status
        if (statusResult.content && Array.isArray(statusResult.content) && statusResult.content[0]?.text) {
          status = JSON.parse(statusResult.content[0].text)
        } else {
          status = statusResult
        }

        console.log(`[Generate Stories] Preview status check ${attempts + 1}/${maxAttempts}:`, status.status)

        if (status.status === 'succeeded') {
          // Get the output directly from the status check
          previewUrl = Array.isArray(status.output) ? status.output[0] : status.output
          console.log(`[Generate Stories] Preview succeeded, URL:`, previewUrl)
          break
        } else if (status.status === 'failed') {
          console.error(`[Generate Stories] Preview failed:`, status.error)
          break
        }

        attempts++
      }

      if (!previewUrl) {
        console.error(`[Generate Stories] Preview timed out after ${maxAttempts} seconds`)
      } else {
        // Track cost
        await trackCost('generate-story-preview', 0.0025, { storyId: story.id })
        console.log('[Generate Stories] Preview image generated successfully:', previewUrl)
      }
    } catch (error: any) {
      console.error(`[Generate Stories] Error generating preview:`, error)
      console.error(`[Generate Stories] Error stack:`, error.stack)
      // Don't fail the entire request if preview fails
    }
    
    console.log('[Generate Stories] Preview URL result:', previewUrl || 'null - preview failed')

    // Add preview URL to story
    const storiesWithPreview = formattedStories.map((story: any, index: number) => ({
      ...story,
      previewImageUrl: index === 0 ? (previewUrl || undefined) : undefined,
    }))

    console.log('[Generate Stories] Story generation complete')
    console.log('[Generate Stories] First story has preview:', !!storiesWithPreview[0]?.previewImageUrl)
    if (storiesWithPreview[0]?.previewImageUrl) {
      console.log('[Generate Stories] Preview URL starts with:', storiesWithPreview[0].previewImageUrl.substring(0, 50))
    }

    return {
      stories: storiesWithPreview,
      promptData: {
        prompt,
        productImages: imageUrls,
        aspectRatio,
        mood,
        adType,
        model: model || 'google/veo-3-fast',
        generateVoiceover: generateVoiceover || false,
      },
    }
  } catch (error: any) {
    console.error('[Generate Stories] Error:', error)
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to generate stories'
    let statusCode = 500
    let isRetryable = false
    
    // Check for timeout errors
    if (error.message?.includes('timed out') || 
        error.message?.includes('timeout') || 
        error.message?.includes('Request timed out') ||
        error.code === -32001) {
      errorMessage = 'Story generation took too long. This can happen when the service is busy. Please try again in a moment.'
      statusCode = 504 // Gateway Timeout
      isRetryable = true
    } 
    // Check for connection errors
    else if (error.message?.includes('connection') || 
             error.code === 'EPIPE' ||
             error.message?.includes('MCP server connection')) {
      errorMessage = 'Connection error. Please check your internet connection and try again.'
      statusCode = 503 // Service Unavailable
      isRetryable = true
    } 
    // Check for other retryable errors
    else if (error.message?.includes('ECONNREFUSED') || 
             error.message?.includes('network')) {
      errorMessage = 'Network error. Please try again.'
      statusCode = 503
      isRetryable = true
    }
    // Use original error message if available
    else if (error.message) {
      errorMessage = error.message
      // Mark as retryable if it's a generic MCP error
      isRetryable = error.message.includes('MCP') || error.message.includes('OpenAI')
    }
    
    throw createError({
      statusCode,
      message: errorMessage,
      data: {
        originalError: error.message,
        retryable: isRetryable,
      },
    })
  }
})
