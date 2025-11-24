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
    if (model === 'google/veo-3.1' || model === 'google/veo-3-fast' || model === 'google/veo-3.1-fast') {
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
    
    return duration
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_video',
          description: 'Generate video using Replicate models (google/veo-3.1, google/veo-3-fast, google/veo-3.1-fast)',
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
                description: 'File path or URL to first frame image for video generation.',
              },
              subject_reference: {
                type: 'string',
                description: 'An optional character reference image to use as the subject in the generated video. File path or URL.',
              },
              image_legacy: {
                type: 'string',
                description: 'Input image for image-to-video generation. File path or URL.',
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
          name: 'generate_image',
          description: 'Generate image(s) using Seedream 4.0 or Nano Banana Pro model',
          inputSchema: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                enum: ['bytedance/seedream-4', 'google/nano-banana', 'google/nano-banana-pro'],
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
                description: 'Output format (Nano Banana and Nano Banana Pro only). Format of the output image.',
                default: 'jpg',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'edit_video_aleph',
          description: 'Edit video using RunwayML Aleph (Gen-4 Aleph) for in-context video editing - add/remove objects, change style, lighting, camera angles, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              video: {
                type: 'string',
                description: 'URL or file path to input video to edit',
              },
              prompt: {
                type: 'string',
                description: 'Text description of desired edits (e.g., "add rain", "change to sunset lighting", "remove background objects")',
              },
              reference_image: {
                type: 'string',
                description: 'Optional reference image URL or file path for style or content guidance',
              },
              aspect_ratio: {
                type: 'string',
                enum: ['16:9', '9:16'],
                description: 'Aspect ratio of output video. Must match input video aspect ratio.',
                default: '16:9',
              },
            },
            required: ['video', 'prompt'],
          },
        },
        {
          name: 'edit_video_gen3',
          description: 'Edit video using RunwayML Gen-3 Alpha Turbo with optional masking for targeted edits. Supports object removal, style changes, and effects. Mask should be a binary image (white=edit, black=preserve).',
          inputSchema: {
            type: 'object',
            properties: {
              video: {
                type: 'string',
                description: 'Video file path or URL to edit',
              },
              prompt: {
                type: 'string',
                description: 'Text description of the edit (e.g., "remove the person", "make it rainy")',
              },
              mask: {
                type: 'string',
                description: 'Optional: Mask image file path or URL (white pixels = edit area, black = preserve)',
              },
              reference_image: {
                type: 'string',
                description: 'Optional: Reference image for style guidance',
              },
              aspect_ratio: {
                type: 'string',
                enum: ['16:9', '9:16'],
                description: 'Aspect ratio (16:9, 9:16)',
                default: '16:9',
              },
            },
            required: ['video', 'prompt'],
          },
        },
        {
          name: 'generate_music',
          description: 'Generate music using Replicate models (google/lyria-2)',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Text description of desired music (mood, style, genre)',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds (default: match video length)',
              },
              model: {
                type: 'string',
                description: 'Model ID (default: google/lyria-2)',
                default: 'google/lyria-2',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'generate_speech',
          description: 'Generate speech using Replicate TTS models (minimax/speech-02-hd)',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              voice: {
                type: 'string',
                description: 'Voice ID/name (default: professional voice)',
              },
              model: {
                type: 'string',
                description: 'Model ID (default: minimax/speech-02-hd)',
                default: 'minimax/speech-02-hd',
              },
              speed: {
                type: 'number',
                description: 'Optional speech speed adjustment (0.5-2.0)',
              },
            },
            required: ['text'],
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
          
          case 'edit_video_aleph':
            return await this.editVideoAleph(
              args.video,
              args.prompt,
              args.reference_image,
              args.aspect_ratio || '16:9'
            )
          
          case 'edit_video_gen3':
            return await this.editVideoGen3(
              args.video,
              args.prompt,
              args.mask,
              args.reference_image,
              args.aspect_ratio || '16:9'
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
          
          case 'generate_music':
            return await this.generateMusic(
              args.prompt,
              args.duration,
              args.model || 'google/lyria-2'
            )
          
          case 'generate_speech':
            return await this.generateSpeech(
              args.text,
              args.voice,
              args.model || 'minimax/speech-02-hd',
              args.speed
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
      if (modelId === 'google/veo-3.1' || modelId === 'google/veo-3-fast' || modelId === 'google/veo-3.1-fast') {
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
    } else if (modelId === 'google/veo-3.1-fast') {
      // Veo 3.1 Fast supports: prompt, aspect_ratio, duration, image, negative_prompt, resolution, generate_audio, seed, last_frame
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
      if (lastFrame) {
        input.last_frame = lastFrame
      }
      // Note: Veo 3.1 Fast does NOT support reference_images
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
    } else if (modelId === 'google/nano-banana' || modelId === 'google/nano-banana-pro') {
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

    // It's a local file path - upload to Replicate using their files API
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      
      // Read the file as a buffer
      const fileBuffer = await fs.readFile(filePathOrUrl)
      const filename = path.basename(filePathOrUrl)
      const mimeType = this.getMimeType(filename)
      
      // Try to use form-data package, fallback to native FormData
      let formData: any
      let headers: Record<string, string> = {
        'Authorization': `Token ${process.env.REPLICATE_API_KEY || ''}`,
      }
      
      // Use form-data package for Node.js compatibility
      const FormDataModule = await import('form-data')
      const FormDataClass = FormDataModule.default || FormDataModule
      const { Readable } = await import('stream')
      
      formData = new FormDataClass()
      formData.append('file', Readable.from(fileBuffer), {
        filename: filename,
        contentType: mimeType,
      })
      headers = { ...headers, ...formData.getHeaders() }
      
      // Upload to Replicate using fetch (Replicate's files API)
      const response = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: headers,
        body: formData,
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Replicate file upload failed: ${response.status} ${errorText}`)
      }
      
      const result = await response.json()
      console.error('[Replicate MCP] File upload response:', JSON.stringify(result, null, 2))
      
      // Return the public URL - Replicate returns { urls: { get: "..." } }
      const url = result.urls?.get || result.url || (typeof result === 'string' ? result : null)
      if (!url) {
        throw new Error(`Invalid response from Replicate file upload: ${JSON.stringify(result)}`)
      }
      console.error('[Replicate MCP] Extracted URL:', url)
      return url
    } catch (error: any) {
      console.error('Failed to upload file to Replicate:', error)
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

  private async editVideoAleph(
    video: string,
    prompt: string,
    referenceImage?: string,
    aspectRatio: string = '16:9'
  ) {
    console.error('[Replicate MCP] Starting Aleph video edit')
    console.error('[Replicate MCP] Video:', video)
    console.error('[Replicate MCP] Prompt:', prompt)
    console.error('[Replicate MCP] Reference Image:', referenceImage || 'none')
    console.error('[Replicate MCP] Aspect Ratio:', aspectRatio)

    // Upload video if it's a local file path
    let videoUrl = video
    if (!video.startsWith('http://') && !video.startsWith('https://')) {
      console.error('[Replicate MCP] Uploading local video file to Replicate...')
      videoUrl = await this.uploadFile(video)
      console.error('[Replicate MCP] Video uploaded:', videoUrl)
    }

    // Upload reference image if provided and is local
    let referenceImageUrl: string | undefined = referenceImage
    if (referenceImage && !referenceImage.startsWith('http://') && !referenceImage.startsWith('https://')) {
      console.error('[Replicate MCP] Uploading reference image to Replicate...')
      referenceImageUrl = await this.uploadFile(referenceImage)
      console.error('[Replicate MCP] Reference image uploaded:', referenceImageUrl)
    }

    // Build input for Aleph
    const input: any = {
      video: videoUrl,
      prompt: prompt,
    }

    // Add reference image if provided
    if (referenceImageUrl) {
      input.reference_image = referenceImageUrl
    }

    console.error('[Replicate MCP] Creating Aleph prediction with input:', JSON.stringify(input, null, 2))

    // Create prediction using runwayml/gen4-aleph model
    const prediction = await replicate.predictions.create({
      model: 'runwayml/gen4-aleph',
      input: input,
    })

    console.error('[Replicate MCP] Aleph prediction created:', prediction.id)
    console.error('[Replicate MCP] Status:', prediction.status)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            predictionId: prediction.id,
            status: prediction.status,
            urls: prediction.urls,
          }, null, 2),
        },
      ],
    }
  }

  private async editVideoGen3(
    video: string,
    prompt: string,
    mask?: string,
    referenceImage?: string,
    aspectRatio: string = '16:9'
  ) {
    console.error('[Replicate MCP] Starting Gen-4 Aleph video edit (with mask support)')
    console.error('[Replicate MCP] Video:', video)
    console.error('[Replicate MCP] Prompt:', prompt)
    console.error('[Replicate MCP] Mask:', mask || 'none')
    console.error('[Replicate MCP] Reference Image:', referenceImage || 'none')

    // Upload video if it's a local file path
    let videoUrl = video
    if (!video.startsWith('http://') && !video.startsWith('https://')) {
      console.error('[Replicate MCP] Uploading local video file to Replicate...')
      videoUrl = await this.uploadFile(video)
      console.error('[Replicate MCP] Video uploaded:', videoUrl)
    }

    // Upload mask if provided and is local
    let maskUrl: string | undefined = mask
    if (mask && !mask.startsWith('http://') && !mask.startsWith('https://')) {
      console.error('[Replicate MCP] Uploading mask image to Replicate...')
      maskUrl = await this.uploadFile(mask)
      console.error('[Replicate MCP] Mask uploaded:', maskUrl)
    }

    // Upload reference image if provided and is local
    let referenceImageUrl: string | undefined = referenceImage
    if (referenceImage && !referenceImage.startsWith('http://') && !referenceImage.startsWith('https://')) {
      console.error('[Replicate MCP] Uploading reference image to Replicate...')
      referenceImageUrl = await this.uploadFile(referenceImage)
      console.error('[Replicate MCP] Reference image uploaded:', referenceImageUrl)
    }

    // Build input for Gen-4 Aleph
    // Using Gen-4 Aleph which is the available video editing model on Replicate
    const input: any = {
      video: videoUrl,
      prompt: prompt,
    }

    // Add mask if provided (for targeted editing)
    // Note: If Gen-4 Aleph doesn't support mask, it will ignore this parameter
    if (maskUrl) {
      input.mask = maskUrl
      console.error('[Replicate MCP] Mask will be included in request')
    }

    // Add reference image if provided
    if (referenceImageUrl) {
      input.reference_image = referenceImageUrl
    }

    console.error('[Replicate MCP] Creating Gen-4 Aleph prediction with input:', JSON.stringify(input, null, 2))

    // Create prediction using runwayml/gen4-aleph model (the actual available model)
    const prediction = await replicate.predictions.create({
      model: 'runwayml/gen4-aleph',
      input: input,
    })

    console.error('[Replicate MCP] Gen-4 Aleph prediction created:', prediction.id)
    console.error('[Replicate MCP] Status:', prediction.status)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            predictionId: prediction.id,
            status: prediction.status,
            urls: prediction.urls,
          }, null, 2),
        },
      ],
    }
  }

  private async generateMusic(
    prompt: string,
    duration?: number,
    model: string = 'google/lyria-2'
  ) {
    if (!prompt) {
      throw new Error('Prompt is required for music generation')
    }

    const input: any = {
      prompt: prompt,
    }

    if (duration !== undefined && duration > 0) {
      input.duration = duration
    }

    console.error(`[Replicate MCP] Creating music prediction with model: ${model}`)
    console.error('[Replicate MCP] Input params:', JSON.stringify(input, null, 2))

    let prediction
    try {
      prediction = await replicate.predictions.create({
        model: model,
        input,
      })
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
        console.error(`[Replicate MCP] Model not found: ${model}`)
        throw new Error(`Model "${model}" is not available on Replicate. This model may have been removed or is not accessible.`)
      }
      throw error
    }

    console.error('[Replicate MCP] Music prediction created:', JSON.stringify({
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
      urls: prediction.urls,
      model: prediction.model,
      version: prediction.version,
    }, null, 2))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            predictionId: prediction.id,
            id: prediction.id,
            status: prediction.status,
            createdAt: prediction.created_at,
          }),
        },
      ],
    }
  }

  private async generateSpeech(
    text: string,
    voice?: string,
    model: string = 'minimax/speech-02-hd',
    speed?: number
  ) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for speech generation')
    }

    const input: any = {
      text: text.trim(),
    }

    if (voice) {
      input.voice = voice
    }

    if (speed !== undefined && speed > 0) {
      input.speed = speed
    }

    console.error(`[Replicate MCP] Creating speech prediction with model: ${model}`)
    console.error('[Replicate MCP] Input params:', JSON.stringify(input, null, 2))

    let prediction
    try {
      prediction = await replicate.predictions.create({
        model: model,
        input,
      })
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes('404') || error.message?.includes('not found')) {
        console.error(`[Replicate MCP] Model not found: ${model}`)
        throw new Error(`Model "${model}" is not available on Replicate. This model may have been removed or is not accessible.`)
      }
      throw error
    }

    console.error('[Replicate MCP] Speech prediction created:', JSON.stringify({
      id: prediction.id,
      status: prediction.status,
      createdAt: prediction.created_at,
      urls: prediction.urls,
      model: prediction.model,
      version: prediction.version,
    }, null, 2))

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            predictionId: prediction.id,
            id: prediction.id,
            status: prediction.status,
            createdAt: prediction.created_at,
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
            videoUrl: mediaUrl, // Keep for backward compatibility
            audioUrl: mediaUrl, // Also include as audioUrl
            url: mediaUrl, // Generic URL field
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

