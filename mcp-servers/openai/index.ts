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
import OpenAI from 'openai'

// Load environment variables from .env file
// Try multiple possible locations for the .env file
const envPaths = [
  resolve(process.cwd(), '.env'),           // Project root (when run from project root)
  resolve(__dirname, '..', '..', '.env'),  // Project root (when run from mcp-servers/openai)
  resolve(process.cwd(), '..', '.env'),     // Parent directory
]

// Load .env file - dotenv will not throw if file doesn't exist
for (const envPath of envPaths) {
  const result = config({ path: envPath })
  if (result.parsed && process.env.OPENAI_API_KEY) {
    console.error(`Loaded .env from: ${envPath}`)
    break
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

class OpenAIMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-openai',
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
          name: 'chat_completion',
          description: 'Create a chat completion using OpenAI',
          inputSchema: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                description: 'Model to use (e.g., gpt-4o)',
                default: 'gpt-4o',
              },
              messages: {
                type: 'array',
                description: 'Array of message objects',
                items: {
                  type: 'object',
                  properties: {
                    role: {
                      type: 'string',
                      enum: ['system', 'user', 'assistant'],
                    },
                    content: {
                      type: 'string',
                    },
                  },
                },
              },
              response_format: {
                type: 'object',
                description: 'Response format (e.g., { type: "json_object" })',
              },
            },
            required: ['messages'],
          },
        },
        {
          name: 'parse_prompt',
          description: 'Parse user prompt into structured ad video requirements',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'User prompt text',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'plan_storyboard',
          description: 'Generate video storyboard with segments',
          inputSchema: {
            type: 'object',
            properties: {
              parsed: {
                type: 'object',
                description: 'Parsed prompt data',
              },
              duration: {
                type: 'number',
                description: 'Video duration in seconds',
              },
              style: {
                type: 'string',
                description: 'Visual style',
              },
            },
            required: ['parsed', 'duration', 'style'],
          },
        },
        {
          name: 'text_to_speech',
          description: 'Convert text to speech using OpenAI TTS',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              voice: {
                type: 'string',
                description: 'Voice to use (alloy, echo, fable, onyx, nova, shimmer)',
                enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
                default: 'alloy',
              },
              model: {
                type: 'string',
                description: 'Model to use (tts-1 or tts-1-hd)',
                enum: ['tts-1', 'tts-1-hd'],
                default: 'tts-1',
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
          case 'chat_completion':
            return await this.chatCompletion(
              args.model || 'gpt-4o',
              args.messages,
              args.response_format
            )
          
          case 'parse_prompt':
            return await this.parsePrompt(args.prompt)
          
          case 'plan_storyboard':
            return await this.planStoryboard(args.parsed, args.duration, args.style)
          
          case 'text_to_speech':
            return await this.textToSpeech(
              args.text,
              args.voice || 'alloy',
              args.model || 'tts-1'
            )
          
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error: any) {
        // Log the error for debugging
        console.error(`MCP tool error [${name}]:`, error)
        console.error('Error stack:', error.stack)
        
        // Re-throw the error so it's properly handled by the MCP framework
        // The MCP SDK will handle error responses appropriately
        throw error
      }
    })
  }

  private async chatCompletion(
    model: string,
    messages: Array<{ role: string; content: string }>,
    responseFormat?: { type: string }
  ) {
    const completion = await openai.chat.completions.create({
      model,
      messages: messages as any,
      response_format: responseFormat as any,
    })

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            content: completion.choices[0].message.content,
            usage: completion.usage,
          }),
        },
      ],
    }
  }

  private async parsePrompt(prompt: string) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    const systemPrompt = `You are an expert at extracting structured ad video requirements from user prompts. 

You must return a valid JSON object with exactly these fields:
- product: string (the product or service being advertised)
- targetAudience: string (the target demographic or audience)
- mood: string (the emotional tone or mood)
- keyMessages: array of strings (main messages to convey, at least 2-3 items)
- visualStyle: string (the visual aesthetic or style)
- callToAction: string (what action should viewers take)

Return ONLY valid JSON, no other text. Example format:
{
  "product": "Luxury Watch",
  "targetAudience": "Affluent professionals aged 30-50",
  "mood": "Elegant and sophisticated",
  "keyMessages": ["Premium craftsmanship", "Timeless design", "Status symbol"],
  "visualStyle": "Cinematic with gold accents",
  "callToAction": "Visit our website to explore the collection"
}`

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI completion response')
      }

      // Validate that the response is valid JSON with required fields
      try {
        const parsed = JSON.parse(content)
        const requiredFields = ['product', 'targetAudience', 'mood', 'keyMessages', 'visualStyle', 'callToAction']
        const missingFields = requiredFields.filter(field => !(field in parsed))
        
        if (missingFields.length > 0) {
          console.error('OpenAI response missing fields:', missingFields)
          console.error('OpenAI response content:', content)
        }
      } catch (parseError) {
        console.error('OpenAI response is not valid JSON:', content)
        throw new Error('OpenAI returned invalid JSON response')
      }

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      }
    } catch (error: any) {
      console.error('OpenAI API error in parsePrompt:', error)
      throw new Error(`OpenAI API call failed: ${error.message || 'Unknown error'}`)
    }
  }

  private async planStoryboard(parsed: any, duration: number, style: string) {
    const systemPrompt = `Create a video storyboard with 3-5 segments. Each segment needs:
- type: "hook" | "body" | "cta"
- description: Shot description
- startTime: number (seconds)
- endTime: number (seconds)
- visualPrompt: Detailed prompt for image/video generation
- audioNotes: VO script or music cues

Duration: ${duration}s
Style: ${style}

Return JSON with a "segments" array.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(parsed) },
      ],
      response_format: { type: 'json_object' },
    })

    return {
      content: [
        {
          type: 'text',
          text: completion.choices[0].message.content || '{}',
        },
      ],
    }
  }

  private async textToSpeech(text: string, voice: string, model: string) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Text to convert is empty')
      }

      const response = await openai.audio.speech.create({
        model: model as 'tts-1' | 'tts-1-hd',
        voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: text,
      })

      // Convert the response buffer to base64
      const buffer = Buffer.from(await response.arrayBuffer())
      const audioBase64 = buffer.toString('base64')

      if (!audioBase64 || audioBase64.length === 0) {
        throw new Error('Failed to encode audio data to base64')
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              audioBase64,
              format: 'mp3',
              voice,
              model,
            }),
          },
        ],
      }
    } catch (error: any) {
      console.error('[OpenAI MCP] textToSpeech error:', error.message)
      if (error.response) {
        console.error('[OpenAI MCP] API response status:', error.response.status)
        console.error('[OpenAI MCP] API response data:', error.response.data)
      }
      throw error
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
    console.error('OpenAI MCP server running on stdio')
  }
}

const server = new OpenAIMCPServer()
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

