import Replicate from 'replicate'
import { isServerlessEnvironment } from './openai-direct'

/**
 * Direct Replicate API implementation for serverless environments (Vercel)
 * Bypasses MCP servers which require child processes and filesystem access
 */

let replicateClient: Replicate | null = null

function getReplicateClient(): Replicate {
  if (!replicateClient) {
    const apiKey = process.env.REPLICATE_API_KEY
    if (!apiKey) {
      throw new Error('REPLICATE_API_KEY environment variable is not set')
    }
    replicateClient = new Replicate({ auth: apiKey })
  }
  return replicateClient
}

/**
 * Generate an image using Replicate API directly
 * Direct implementation that matches MCP generate_image tool behavior
 */
export async function generateImageDirect(
  model: string = 'bytedance/seedream-4',
  prompt: string,
  imageInput?: string[],
  size: string = '2K',
  aspectRatio: string = 'match_input_image',
  width: number = 2048,
  height: number = 2048,
  sequentialImageGeneration: string = 'disabled',
  maxImages: number = 1,
  enhancePrompt: boolean = true,
  outputFormat: string = 'jpg'
): Promise<{
  predictionId: string
  id: string
  status: string
  createdAt: string
}> {
  const replicate = getReplicateClient()

  if (!prompt) {
    throw new Error('Prompt is required for image generation')
  }

  const modelId = model || 'bytedance/seedream-4'
  const input: any = {
    prompt,
  }

  // Handle image inputs - Replicate accepts URLs, so S3 URLs work fine
  // In serverless, we only support URLs (no file paths)
  if (imageInput && imageInput.length > 0) {
    if (imageInput.length > 10) {
      throw new Error('Maximum 10 input images allowed')
    }
    
    // Validate all inputs are URLs (serverless requirement)
    const invalidInputs = imageInput.filter(img => !img.startsWith('http://') && !img.startsWith('https://'))
    if (invalidInputs.length > 0) {
      throw new Error(`Invalid image inputs: Only HTTP/HTTPS URLs are supported in serverless environments. Found ${invalidInputs.length} non-URL inputs.`)
    }
    
    input.image_input = imageInput
  }

  // Model-specific parameters
  if (modelId === 'bytedance/seedream-4') {
    input.size = size
    input.aspect_ratio = aspectRatio
    input.sequential_image_generation = sequentialImageGeneration
    input.enhance_prompt = enhancePrompt

    // Handle custom size
    if (size === 'custom') {
      input.width = width
      input.height = height
    }

    // Handle sequential image generation
    if (sequentialImageGeneration === 'auto') {
      input.max_images = maxImages
    }
  } else if (modelId === 'google/nano-banana' || modelId === 'google/nano-banana-pro') {
    input.aspect_ratio = aspectRatio
    input.output_format = outputFormat
  }

  console.log(`[Replicate Direct] Creating image prediction with model: ${modelId}`)
  console.log('[Replicate Direct] Input params:', JSON.stringify(input, null, 2))

  try {
    const prediction = await replicate.predictions.create({
      model: modelId,
      input,
    })

    console.log('[Replicate Direct] Image prediction created:', JSON.stringify({
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
    }, null, 2))

    return {
      predictionId: prediction.id,
      id: prediction.id, // Also include as 'id' for compatibility
      status: prediction.status,
      createdAt: prediction.created_at || new Date().toISOString(),
    }
  } catch (error: any) {
    // Handle 404 errors for missing models
    if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
      console.error(`[Replicate Direct] Model not found: ${modelId}`)
      throw new Error(`Model "${modelId}" is not available on Replicate. This model may have been removed or is not accessible.`)
    }
    // Handle authentication errors
    if (error.status === 401 || error.message?.includes('401') || error.message?.includes('unauthorized')) {
      throw new Error('Replicate API key is invalid. Please check your REPLICATE_API_KEY environment variable.')
    }
    // Re-throw other errors
    throw error
  }
}

/**
 * Check prediction status using Replicate API directly
 */
export async function checkPredictionStatusDirect(predictionId: string): Promise<{
  id: string
  status: string
  output: any
  error: any
  createdAt: string
  completedAt: string | null
}> {
  const replicate = getReplicateClient()

  try {
    const prediction = await replicate.predictions.get(predictionId)

    return {
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
      createdAt: prediction.created_at || new Date().toISOString(),
      completedAt: prediction.completed_at || null,
    }
  } catch (error: any) {
    console.error('[Replicate Direct] checkPredictionStatus error:', error)
    if (error.status === 404) {
      throw new Error(`Prediction not found: ${predictionId}`)
    }
    if (error.status === 401) {
      throw new Error('Replicate API key is invalid. Please check your REPLICATE_API_KEY environment variable.')
    }
    throw new Error(`Failed to check prediction status: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Get prediction result using Replicate API directly
 */
export async function getPredictionResultDirect(predictionId: string): Promise<{
  videoUrl: string
  audioUrl: string
  url: string
  predictionId: string
}> {
  const replicate = getReplicateClient()

  try {
    const prediction = await replicate.predictions.get(predictionId)

    if (prediction.status !== 'succeeded') {
      throw new Error(`Prediction not completed. Status: ${prediction.status}`)
    }

    // Handle different output formats (video, audio, or other media)
    let mediaUrl: string | null = null
    
    if (prediction.output) {
      if (Array.isArray(prediction.output)) {
        mediaUrl = prediction.output[0] || null
      } else if (typeof prediction.output === 'string') {
        mediaUrl = prediction.output
      } else if (typeof prediction.output === 'object' && prediction.output !== null) {
        // Try common property names for both video and audio
        mediaUrl = (prediction.output as any).url || 
                   (prediction.output as any).videoUrl || 
                   (prediction.output as any).video_url ||
                   (prediction.output as any).audioUrl ||
                   (prediction.output as any).audio_url ||
                   (prediction.output as any).output ||
                   null
      }
    }

    if (!mediaUrl) {
      console.error('[Replicate Direct] Prediction output structure:', JSON.stringify({
        output: prediction.output,
        outputType: typeof prediction.output,
        isArray: Array.isArray(prediction.output),
        predictionId: prediction.id,
        status: prediction.status,
      }, null, 2))
      throw new Error(`Prediction succeeded but output is missing or in unexpected format. Output: ${JSON.stringify(prediction.output)}`)
    }

    return {
      videoUrl: mediaUrl, // Keep for backward compatibility
      audioUrl: mediaUrl, // Also include as audioUrl
      url: mediaUrl, // Generic URL field
      predictionId: prediction.id,
    }
  } catch (error: any) {
    console.error('[Replicate Direct] getPredictionResult error:', error)
    if (error.status === 404) {
      throw new Error(`Prediction not found: ${predictionId}`)
    }
    if (error.status === 401) {
      throw new Error('Replicate API key is invalid. Please check your REPLICATE_API_KEY environment variable.')
    }
    throw new Error(`Failed to get prediction result: ${error.message || 'Unknown error'}`)
  }
}

