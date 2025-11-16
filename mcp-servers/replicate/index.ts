import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import Replicate from 'replicate'

// Load environment variables from .env file
const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
]

for (const envPath of envPaths) {
  const result = config({ path: envPath })
  if (result.parsed && process.env.REPLICATE_API_KEY) {
    console.error(`Loaded .env from: ${envPath}`)
    break
  }
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY || '',
})

class ReplicateMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-replicate',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  /**
   * Rounds duration to the nearest valid value for a specific model.
   * 
   * @param model - Model ID
   * @param duration - Original duration in seconds
   * @returns Rounded duration
   */
  private roundDurationToValidValue(model: string, duration: number): number {
    if (model === 'google/veo-3.1' || model === 'google/veo-3-fast') {
      if (duration < 4) {
        return 4
      }
      if (duration > 8) {
        return 8
      }
      if (duration <= 5) {
        return 4
      } else if (duration <= 7) {
        return 6
      } else {
        return 8
      }
    }
    
    if (model === 'minimax/hailuo-ai-v2.3') {
      if (duration < 3) {
        return 3
      }
      if (duration > 10) {
        return 10
      }
      if (duration <= 4) {
        return 3
      } else if (duration <= 7.5) {
        return 5
      } else {
        return 10
      }
    }
    
    if (model === 'kwaivgi/kling-v2.5-turbo-pro') {
      if (duration < 5) {
        return 5
      }
      if (duration > 10) {
        return 10
      }
      if (duration <= 7.5) {
        return 5
      } else {
        return 10
      }
    }
    
    return duration
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_video',
          description: 'Generate video using Replicate models (google/veo-3.1, minimax/hailuo-ai-v2.3, kwaivgi/kling-v2.5-turbo-pro)',
          inputSchema: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                description: 'Replicate model ID (e.g., google/veo-3.1). Defaults to google/veo-3.1',
                default: 'google/veo-3.1',
              },
              prompt: {
                type: 'string',
                description: 'Video generation prompt (required for text-to-video models)',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds (model-specific constraints apply)',
                default: 6,
              },
              aspect_ratio: {
                type: 'string',
                description: 'Aspect ratio (16:9, 9:16, 1:1)',
                default: '16:9',
              },
              image: {
                type: 'string',
                description: 'Input image to start generating from (for Veo 3.1). File path or URL.',
              },
              last_frame: {
                type: 'string',
                description: 'Ending image for interpolation (for Veo 3.1). File path or URL.',
              },
              reference_images: {
                type: 'array',
                items: { type: 'string' },
                description: '1 to 3 reference images for subject-consistent generation (for Veo 3.1). File paths or URLs.',
              },
              negative_prompt: {
                type: 'string',
                description: 'Description of what to exclude from the generated video (for Veo 3.1).',
              },
              resolution: {
                type: 'string',
                description: 'Resolution of the generated video (for Veo 3.1). Default: "1080p"',
              },
              generate_audio: {
                type: 'boolean',
                description: 'Generate audio with the video (for Veo 3.1). Default: true',
              },
              seed: {
                type: 'number',
                description: 'Random seed. Omit for random generations (for Veo 3.1).',
              },
              first_frame_image: {
                type: 'string',
                description: 'File path or URL to first frame image for video generation (for Kling and other models).',
              },
              subject_reference: {
                type: 'string',
                description: 'An optional character reference image to use as the subject in the generated video. File path or URL.',
              },
              image_legacy: {
                type: 'string',
                description: 'Input image for image-to-video generation (for Kling and other models). File path or URL.',
              },
            },
            required: [],
          },
        },
        {
          name: 'check_prediction_status',
          description: 'Check the status of a Replicate prediction',
          inputSchema: {
            type: 'object',
            properties: {
              predictionId: {
                type: 'string',
                description: 'Prediction ID from Replicate',
              },
            },
            required: ['predictionId'],
          },
        },
        {
          name: 'get_prediction_result',
          description: 'Get the result URL from a completed prediction',
          inputSchema: {
            type: 'object',
            properties: {
              predictionId: {
                type: 'string',
                description: 'Prediction ID from Replicate',
              },
            },
            required: ['predictionId'],
          },
        },
        {
          name: 'generate_keyframe',
          description: 'Generate a keyframe image for video generation using enhanced composition prompts (optimized for Seedream 4)',
          inputSchema: {
            type: 'object',
            properties: {
              enhancedPrompt: {
                type: 'string',
                description: 'Enhanced composition prompt from GPT-4o-mini (required)',
              },
              productImages: {
                type: 'array',
                items: { type: 'string' },
                description: 'Product reference images (1-10 images). File paths or URLs.',
              },
              aspectRatio: {
                type: 'string',
                enum: ['16:9', '9:16', '1:1'],
                description: 'Target aspect ratio for video generation',
                default: '16:9',
              },
              resolution: {
                type: 'string',
                enum: ['1K', '2K', '4K'],
                description: 'Output resolution: 1K (1024px), 2K (2048px), 4K (4096px)',
                default: '2K',
              },
            },
            required: ['enhancedPrompt'],
          },
        },
        {
          name: 'generate_image',
          description: 'Generate image(s) using Seedream 4.0 or Nano Banana model',
          inputSchema: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                enum: ['bytedance/seedream-4', 'google/nano-banana'],
                description: 'Model to use for image generation',
                default: 'bytedance/seedream-4',
              },
              prompt: {
                type: 'string',
                description: 'Text prompt for image generation (required)',
              },
              image_input: {
                type: 'array',
                items: { type: 'string' },
                description: 'Input image(s) for image-to-image generation. List of 1-10 images for single or multi-reference generation.',
              },
              // Seedream-specific parameters
              size: {
                type: 'string',
                enum: ['1K', '2K', '4K', 'custom'],
                description: 'Image resolution (Seedream only): 1K (1024px), 2K (2048px), 4K (4096px), or custom for specific dimensions.',
                default: '2K',
              },
              aspect_ratio: {
                type: 'string',
                description: 'Image aspect ratio. Use match_input_image to automatically match the input images aspect ratio.',
                default: 'match_input_image',
              },
              width: {
                type: 'number',
                description: 'Custom image width (Seedream only, when size=custom). Range: 1024-4096 pixels.',
                default: 2048,
              },
              height: {
                type: 'number',
                description: 'Custom image height (Seedream only, when size=custom). Range: 1024-4096 pixels.',
                default: 2048,
              },
              sequential_image_generation: {
                type: 'string',
                enum: ['disabled', 'auto'],
                description: 'Group image generation mode (Seedream only). disabled generates a single image. auto lets the model decide whether to generate multiple related images.',
                default: 'disabled',
              },
              max_images: {
                type: 'number',
                description: 'Maximum number of images to generate (Seedream only, when sequential_image_generation=auto). Range: 1-15.',
                default: 1,
              },
              enhance_prompt: {
                type: 'boolean',
                description: 'Enable prompt enhancement (Seedream only) for higher quality results, this will take longer to generate.',
                default: true,
              },
              // Nano Banana-specific parameters
              output_format: {
                type: 'string',
                enum: ['jpg', 'png'],
                description: 'Output format (Nano Banana only). Format of the output image.',
                default: 'jpg',
              },
            },
            required: ['prompt'],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'generate_video':
            return await this.generateVideo(
              args.model || 'google/veo-3.1',
              args.prompt,
              args.duration || 6,
              args.aspect_ratio || '16:9',
              args.image,
              args.last_frame,
              args.reference_images,
              args.negative_prompt,
              args.resolution,
              args.generate_audio,
              args.seed,
              args.first_frame_image,
              args.subject_reference,
              args.image_legacy
            )
          
          case 'check_prediction_status':
            return await this.checkPredictionStatus(args.predictionId)
          
          case 'get_prediction_result':
            return await this.getPredictionResult(args.predictionId)
          
          case 'generate_keyframe':
            return await this.generateKeyframe(
              args.enhancedPrompt,
              args.productImages || [],
              args.aspectRatio || '16:9',
              args.resolution || '2K'
            )
          
          case 'generate_image':
            return await this.generateImage(
              args.model || 'bytedance/seedream-4',
              args.prompt,
              args.image_input,
              args.size || '2K',
              args.aspect_ratio || 'match_input_image',
              args.width || 2048,
              args.height || 2048,
              args.sequential_image_generation || 'disabled',
              args.max_images || 1,
              args.enhance_prompt !== undefined ? args.enhance_prompt : true,
              args.output_format || 'jpg'
            )
          
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error.message || 'Unknown error',
              }),
            },
          ],
        }
      }
    })
  }

  private async generateVideo(
    model: string,
    prompt?: string,
    duration?: number,
    aspectRatio?: string,
    image?: string,
    lastFrame?: string,
    referenceImages?: string[],
    negativePrompt?: string,
    resolution?: string,
    generateAudio?: boolean,
    seed?: number,
    firstFrameImage?: string,
    subjectReference?: string,
    imageLegacy?: string
  ) {
    // Default model
    const modelId = model || 'google/veo-3.1'
    
    // Build input based on model requirements
    const input: any = {}
    
    // Handle duration - round if needed
    if (duration !== undefined) {
      const originalDuration = duration
      const roundedDuration = this.roundDurationToValidValue(modelId, duration)
      
      // Log duration adjustment if it changed
      if (roundedDuration !== originalDuration) {
        const difference = Math.abs(roundedDuration - originalDuration)
        if (difference > 2) {
          console.error(`[Replicate MCP] WARNING: Significant duration adjustment: ${originalDuration}s → ${roundedDuration}s (difference: ${difference}s)`)
        } else {
          console.error(`[Replicate MCP] Duration adjusted: ${originalDuration}s → ${roundedDuration}s`)
        }
      }
      
      // Only add duration if model supports it
      if (modelId === 'google/veo-3.1' || modelId === 'google/veo-3-fast' || modelId === 'minimax/hailuo-ai-v2.3' || modelId === 'kwaivgi/kling-v2.5-turbo-pro') {
        input.duration = roundedDuration
      }
    }
    
    // Handle aspect ratio
    if (aspectRatio) {
      input.aspect_ratio = aspectRatio
    }
    
    // Model-specific input handling
    if (modelId === 'google/veo-3.1') {
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
      if (lastFrame) {
        input.last_frame = lastFrame
      }
      if (referenceImages && referenceImages.length > 0) {
        input.reference_images = referenceImages
      }
      if (negativePrompt) {
        input.negative_prompt = negativePrompt
      }
      if (resolution) {
        input.resolution = resolution
      }
      if (generateAudio !== undefined) {
        input.generate_audio = generateAudio
      }
      if (seed !== undefined && seed !== null) {
        input.seed = seed
      }
    } else if (modelId === 'google/veo-3-fast') {
      // Veo 3 Fast only supports: prompt, aspect_ratio, duration, image, negative_prompt, resolution, generate_audio, seed
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
      // Note: Veo 3 Fast does NOT support last_frame or reference_images
      if (negativePrompt) {
        input.negative_prompt = negativePrompt
      }
      if (resolution) {
        input.resolution = resolution
      }
      if (generateAudio !== undefined) {
        input.generate_audio = generateAudio
      }
      if (seed !== undefined && seed !== null) {
        input.seed = seed
      }
    } else if (modelId === 'minimax/hailuo-ai-v2.3') {
      if (prompt) {
        input.prompt = prompt
      }
    } else if (modelId === 'kwaivgi/kling-v2.5-turbo-pro') {
      if (prompt) {
        input.prompt = prompt
      }
      if (image || imageLegacy || firstFrameImage) {
        input.image = image || imageLegacy || firstFrameImage
      }
    } else {
      // Default fallback for unknown models
      if (prompt) {
        input.prompt = prompt
      }
      if (image || imageLegacy || firstFrameImage) {
        input.image = image || imageLegacy || firstFrameImage
      }
    }
    
    console.error(`[Replicate MCP] Creating prediction with model: ${modelId}`)
    console.error('[Replicate MCP] Input params:', JSON.stringify(input, null, 2))
    
    let prediction
    try {
      prediction = await replicate.predictions.create({
        model: modelId,
        input,
      })
    } catch (error: any) {
      // Handle 404 errors for missing models
      if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
        console.error(`[Replicate MCP] Model not found: ${modelId}`)
        throw new Error(`Model "${modelId}" is not available on Replicate. This model may have been removed or is not accessible. Please try a different model.`)
      }
      // Re-throw other errors
      throw error
    }

    console.error('[Replicate MCP] Prediction created:', JSON.stringify({
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
      urls: prediction.urls,
      model: prediction.model,
      version: prediction.version,
    }, null, 2))

    const response = {
      predictionId: prediction.id,
      id: prediction.id, // Also include as 'id' for compatibility
      status: prediction.status,
      createdAt: prediction.created_at,
    }

    console.error('[Replicate MCP] Returning response:', JSON.stringify(response, null, 2))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    }
  }

  private async generateKeyframe(
    enhancedPrompt: string,
    productImages: string[] = [],
    aspectRatio: string = '16:9',
    resolution: string = '2K'
  ) {
    if (!enhancedPrompt) {
      throw new Error('Enhanced prompt is required for keyframe generation')
    }

    console.error('[Replicate MCP] Generating keyframe:', {
      promptLength: enhancedPrompt.length,
      productImageCount: productImages.length,
      aspectRatio,
      resolution,
    })

    // Seedream 4 configuration optimized for keyframes
    const input: any = {
      prompt: enhancedPrompt,
      size: resolution,
      aspect_ratio: aspectRatio,
      sequential_image_generation: 'disabled', // Single keyframe
      enhance_prompt: false, // Already enhanced by GPT-4o-mini
    }

    // Add product reference images if provided
    if (productImages && productImages.length > 0) {
      if (productImages.length > 10) {
        throw new Error('Maximum 10 product images allowed')
      }
      
      console.error('[Replicate MCP] Uploading product reference images:', productImages.length)
      const uploadedImages = await Promise.all(
        productImages.map(img => this.uploadFileIfNeeded(img))
      )
      input.image_input = uploadedImages
      
      // When using reference images, match their aspect ratio
      if (input.aspect_ratio !== 'custom') {
        input.aspect_ratio = 'match_input_image'
      }
    }

    console.error('[Replicate MCP] Seedream 4 input:', JSON.stringify(input, null, 2))

    let prediction: any
    try {
      prediction = await replicate.predictions.create({
        model: 'bytedance/seedream-4',
        input,
      })
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
        console.error('[Replicate MCP] Seedream 4 not found')
        throw new Error('Seedream 4 model is not available on Replicate. Please check model availability.')
      }
      throw error
    }

    console.error('[Replicate MCP] Keyframe prediction created:', {
      id: prediction.id,
      status: prediction.status,
      model: prediction.model,
    })

    const response = {
      predictionId: prediction.id,
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
      type: 'keyframe',
      aspectRatio,
      resolution,
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    }
  }

  private async generateImage(
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
  ) {
    if (!prompt) {
      throw new Error('Prompt is required for image generation')
    }

    const modelId = model || 'bytedance/seedream-4'
    const input: any = {
      prompt,
    }

    // Handle image inputs - upload files if needed (common for both models)
    if (imageInput && imageInput.length > 0) {
      if (imageInput.length > 10) {
        throw new Error('Maximum 10 input images allowed')
      }
      
      const uploadedImages = await Promise.all(
        imageInput.map(img => this.uploadFileIfNeeded(img))
      )
      input.image_input = uploadedImages
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
    } else if (modelId === 'google/nano-banana') {
      input.aspect_ratio = aspectRatio
      input.output_format = outputFormat
    }

    console.error(`[Replicate MCP] Creating image prediction with model: ${modelId}`)
    console.error('[Replicate MCP] Input params:', JSON.stringify(input, null, 2))

    let prediction
    try {
      prediction = await replicate.predictions.create({
        model: modelId,
        input,
      })
    } catch (error: any) {
      // Handle 404 errors for missing models
      if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
        console.error(`[Replicate MCP] Model not found: ${modelId}`)
        throw new Error(`Model "${modelId}" is not available on Replicate. This model may have been removed or is not accessible.`)
      }
      // Re-throw other errors
      throw error
    }

    console.error('[Replicate MCP] Image prediction created:', JSON.stringify({
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
      urls: prediction.urls,
      model: prediction.model,
      version: prediction.version,
    }, null, 2))

    const response = {
      predictionId: prediction.id,
      id: prediction.id, // Also include as 'id' for compatibility
      status: prediction.status,
      createdAt: prediction.created_at,
    }

    console.error('[Replicate MCP] Returning response:', JSON.stringify(response, null, 2))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    }
  }

  private async uploadFileIfNeeded(filePathOrUrl: string): Promise<string> {
    // If it's already a URL, return as-is
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      return filePathOrUrl
    }

    // It's a local file path - upload to Replicate using their JavaScript client
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      
      // Resolve relative paths to absolute (relative to project root)
      let absolutePath = filePathOrUrl
      if (!path.isAbsolute(filePathOrUrl)) {
        // process.cwd() should be the project root when MCP server is started
        absolutePath = path.resolve(process.cwd(), filePathOrUrl)
        console.error(`[Replicate MCP] Resolved relative path: ${filePathOrUrl} -> ${absolutePath}`)
      }
      
      // Read the file as a buffer
      const fileBuffer = await fs.readFile(absolutePath)
      const filename = path.basename(absolutePath)
      const mimeType = this.getMimeType(filename)
      
      console.error('[Replicate MCP] Uploading file:', { filename, mimeType, size: fileBuffer.length })
      
      // Create a File-like object from the buffer (Node.js 18+ has built-in File)
      const file = new File([fileBuffer], filename, { type: mimeType })
      
      // Use the Replicate JavaScript client's files.create() method
      const uploadedFile = await replicate.files.create(file)
      
      console.error('[Replicate MCP] File upload response:', JSON.stringify(uploadedFile, null, 2))
      
      // The client returns an object with urls.get property
      const url = uploadedFile.urls?.get || uploadedFile.url
      if (!url) {
        throw new Error(`Invalid response from Replicate file upload: ${JSON.stringify(uploadedFile)}`)
      }
      console.error('[Replicate MCP] Extracted URL:', url)
      return url
    } catch (error: any) {
      console.error('[Replicate MCP] Failed to upload file:', error)
      throw new Error(`Failed to upload file to Replicate: ${error.message}`)
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
    }
    return mimeTypes[ext || ''] || 'application/octet-stream'
  }

  private async checkPredictionStatus(predictionId: string) {
    const prediction = await replicate.predictions.get(predictionId)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: prediction.id,
            status: prediction.status,
            output: prediction.output,
            error: prediction.error,
            createdAt: prediction.created_at,
            completedAt: prediction.completed_at,
          }),
        },
      ],
    }
  }

  private async getPredictionResult(predictionId: string) {
    const prediction = await replicate.predictions.get(predictionId)

    if (prediction.status !== 'succeeded') {
      throw new Error(`Prediction not completed. Status: ${prediction.status}`)
    }

    // Handle different output formats
    let videoUrl: string | null = null
    
    if (prediction.output) {
      if (Array.isArray(prediction.output)) {
        videoUrl = prediction.output[0] || null
      } else if (typeof prediction.output === 'string') {
        videoUrl = prediction.output
      } else if (typeof prediction.output === 'object' && prediction.output !== null) {
        // Try common property names
        videoUrl = (prediction.output as any).url || 
                   (prediction.output as any).videoUrl || 
                   (prediction.output as any).video_url ||
                   (prediction.output as any).output ||
                   null
      }
    }

    if (!videoUrl) {
      console.error('[Replicate MCP] Prediction output structure:', JSON.stringify({
        output: prediction.output,
        outputType: typeof prediction.output,
        isArray: Array.isArray(prediction.output),
        predictionId: prediction.id,
        status: prediction.status,
      }, null, 2))
      throw new Error(`Prediction succeeded but output is missing or in unexpected format. Output: ${JSON.stringify(prediction.output)}`)
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            videoUrl,
            predictionId: prediction.id,
          }),
        },
      ],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    
    // Handle transport errors gracefully
    process.on('SIGPIPE', () => {
      // EPIPE errors are common when the client disconnects - ignore them
      console.error('Received SIGPIPE - client disconnected')
    })
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
        // EPIPE errors are common when the client disconnects - ignore them
        console.error('EPIPE error caught (client disconnected):', error.message)
        return
      }
      console.error('Uncaught exception:', error)
      process.exit(1)
    })
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'EPIPE') {
        // EPIPE errors are common when the client disconnects - ignore them
        console.error('EPIPE rejection caught (client disconnected):', reason)
        return
      }
      console.error('Unhandled rejection at:', promise, 'reason:', reason)
    })
    
    await this.server.connect(transport)
    console.error('Replicate MCP server running on stdio')
  }
}

const server = new ReplicateMCPServer()
server.run().catch((error) => {
  if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
    // EPIPE errors are common when the client disconnects - ignore them
    console.error('EPIPE error during server startup (client disconnected):', error.message)
    process.exit(0) // Exit gracefully
  } else {
    console.error('Server startup error:', error)
    process.exit(1)
  }
})

