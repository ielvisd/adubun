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
    // google/veo-3.1 only supports 4, 6, or 8 seconds
    if (model === 'google/veo-3.1') {
      if (duration < 4) {
        return 4
      }
      if (duration > 8) {
        return 8
      }
      // Round to nearest valid value: 4 if ≤5, 6 if 5-7, 8 if ≥7
      if (duration <= 5) {
        return 4
      } else if (duration <= 7) {
        return 6
      } else {
        return 8
      }
    }
    
    // minimax/hailuo-ai-v2.3 supports 3, 5, or 10 seconds
    if (model === 'minimax/hailuo-ai-v2.3') {
      if (duration < 3) {
        return 3
      }
      if (duration > 10) {
        return 10
      }
      // Round to nearest: 3 if ≤4, 5 if 4-7.5, 10 if ≥7.5
      if (duration <= 4) {
        return 3
      } else if (duration <= 7.5) {
        return 5
      } else {
        return 10
      }
    }
    
    // For other models, return as-is or apply default constraints
    return duration
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_video',
          description: 'Generate video using Replicate models (google/veo-3.1, runway/gen-3-alpha-turbo, stability-ai/stable-video-diffusion, minimax/hailuo-ai-v2.3, anotherbyte/seedance-1.0)',
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
              first_frame_image: {
                type: 'string',
                description: 'File path or URL to first frame image for video generation (for models that support it).',
              },
              subject_reference: {
                type: 'string',
                description: 'An optional character reference image to use as the subject in the generated video (for models that support it). File path or URL.',
              },
              image: {
                type: 'string',
                description: 'Input image for image-to-video generation (for models that support image-to-video). File path or URL.',
              },
              motion_bucket_id: {
                type: 'number',
                description: 'Motion bucket ID for stable-video-diffusion model',
              },
              cond_aug: {
                type: 'number',
                description: 'Condition augmentation for stable-video-diffusion model',
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
              args.first_frame_image,
              args.subject_reference,
              args.image,
              args.motion_bucket_id,
              args.cond_aug
            )
          
          case 'check_prediction_status':
            return await this.checkPredictionStatus(args.predictionId)
          
          case 'get_prediction_result':
            return await this.getPredictionResult(args.predictionId)
          
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
    firstFrameImage?: string,
    subjectReference?: string,
    image?: string,
    motionBucketId?: number,
    condAug?: number
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
      if (modelId === 'google/veo-3.1' || modelId === 'minimax/hailuo-ai-v2.3') {
        input.duration = roundedDuration
      }
    }
    
    // Handle aspect ratio
    if (aspectRatio) {
      input.aspect_ratio = aspectRatio
    }
    
    // Model-specific input handling
    if (modelId === 'google/veo-3.1') {
      // Veo 3.1 supports prompt, first_frame_image, subject_reference
      if (prompt) {
        input.prompt = prompt
      }
      if (firstFrameImage) {
        input.first_frame_image = firstFrameImage
      }
      if (subjectReference) {
        input.subject_reference = subjectReference
      }
    } else if (modelId === 'runway/gen-3-alpha-turbo') {
      // Runway Gen-3 supports prompt and optional image
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
    } else if (modelId === 'stability-ai/stable-video-diffusion') {
      // Stable Video Diffusion requires image, optional motion_bucket_id and cond_aug
      if (image) {
        input.image = image
      }
      if (motionBucketId !== undefined) {
        input.motion_bucket_id = motionBucketId
      }
      if (condAug !== undefined) {
        input.cond_aug = condAug
      }
    } else if (modelId === 'minimax/hailuo-ai-v2.3') {
      // Hailuo supports prompt and duration
      if (prompt) {
        input.prompt = prompt
      }
    } else if (modelId === 'anotherbyte/seedance-1.0') {
      // Seedance supports prompt and optional image
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
    } else {
      // Default: try to use prompt and common fields
      if (prompt) {
        input.prompt = prompt
      }
      if (image) {
        input.image = image
      }
    }
    
    console.error(`[Replicate MCP] Creating prediction with model: ${modelId}`)
    console.error('[Replicate MCP] Input params:', JSON.stringify(input, null, 2))
    
    const prediction = await replicate.predictions.create({
      model: modelId,
      input,
    })

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
    await this.server.connect(transport)
    console.error('Replicate MCP server running on stdio')
  }
}

const server = new ReplicateMCPServer()
server.run().catch(console.error)

