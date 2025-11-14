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

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_video',
          description: 'Generate video using Replicate minimax/video-01 model',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Video generation prompt',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds',
                default: 6,
              },
              aspect_ratio: {
                type: 'string',
                description: 'Aspect ratio (16:9, 9:16, 1:1)',
                default: '16:9',
              },
              first_frame_image: {
                type: 'string',
                description: 'File path or URL to first frame image for video generation. The output video will have the same aspect ratio as this image.',
              },
              subject_reference: {
                type: 'string',
                description: 'An optional character reference image to use as the subject in the generated video (uses S2V-01 model). File path or URL.',
              },
            },
            required: ['prompt'],
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
              args.prompt,
              args.duration || 6,
              args.aspect_ratio || '16:9',
              args.first_frame_image,
              args.subject_reference
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
    prompt: string,
    duration: number,
    aspectRatio: string,
    firstFrameImage?: string,
    subjectReference?: string
  ) {
    const input: any = {
      prompt,
      duration,
      aspect_ratio: aspectRatio,
    }

    // Add image inputs if provided (should already be URLs from API endpoint)
    if (firstFrameImage) {
      input.first_frame_image = firstFrameImage
    }
    if (subjectReference) {
      input.subject_reference = subjectReference
    }
    const prediction = await replicate.predictions.create({
      model: 'minimax/video-01',
      input,
    })

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            predictionId: prediction.id,
            status: prediction.status,
            createdAt: prediction.created_at,
          }),
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

