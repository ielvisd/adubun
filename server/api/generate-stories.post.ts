import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { uploadFileToS3 } from '../utils/s3-upload'
import { saveAsset, deleteFile } from '../utils/storage'

const generateStoriesSchema = z.object({
  prompt: z.string().min(1),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).max(10).optional(),
  personReference: z.string().optional(),
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

    const { prompt, productImages = [], personReference, aspectRatio, mood, adType, model, generateVoiceover } = generateStoriesSchema.parse(body)

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
        clipCount: 3, // Hook, Body, CTA
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
    // Support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
    const formattedStories = stories.map((story: any, index: number) => {
      // Handle body field - prefer new format, fall back to old format for backward compatibility
      const body = story.body || 
                   (story.bodyOne && story.bodyTwo ? `${story.bodyOne} ${story.bodyTwo}` : '') ||
                   story.bodyOne || story.body1 || story.body_one || 
                   story.bodyTwo || story.body2 || story.body_two || ''
      
      // Build description from available fields
      const description = story.description || 
                         `${story.hook || ''} ${body} ${story.callToAction || ''}`.trim()
      
      return {
        id: `story-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: story.title || `Story ${index + 1}`,
        description,
        emoji: story.emoji || '',
        hook: story.hook || story.hookText || '',
        body: body, // New format - single body field
        // Keep old format fields for backward compatibility
        bodyOne: story.bodyOne || story.body1 || story.body_one || '',
        bodyTwo: story.bodyTwo || story.body2 || story.body_two || '',
        callToAction: story.callToAction || story.cta || story.call_to_action || '',
      }
    })

    // Validate we have at least 1 story
    if (formattedStories.length < 1) {
      throw new Error(`Expected at least 1 story, but received ${formattedStories.length}`)
    }

    // No image generation - only emojis are used for visual representation
    console.log('[Generate Stories] Story generation complete (no preview images - emojis only)')

    return {
      stories: formattedStories,
      promptData: {
        prompt,
        productImages: imageUrls,
        subjectReference: personReference, // Map personReference to subjectReference for backend
        aspectRatio,
        mood,
        adType,
        model: model || 'google/veo-3.1-fast',
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
