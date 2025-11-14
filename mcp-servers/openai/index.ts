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
        {
          name: 'analyze_frames',
          description: 'Analyze multiple video frames and select the best one for continuity',
          inputSchema: {
            type: 'object',
            properties: {
              frameUrls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of 3 frame image URLs or file paths',
              },
            },
            required: ['frameUrls'],
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
          
          case 'analyze_frames':
            return await this.analyzeFrames(args.frameUrls)
          
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
- visualPrompt: Detailed, specific prompt for video generation (this will be the primary/default prompt). Must include:
  * Specific camera angles and movements (close-up, wide shot, pan, zoom, etc.)
  * Lighting details (soft natural light, studio lighting, etc.)
  * Composition and framing details
  * Realistic, natural actions and movements
  * Product placement and interaction details
  * Background and setting specifics
  * Avoid abstract or unrealistic descriptions - focus on professional, realistic product showcase
- visualPromptAlternatives: Array of 3-5 alternative visual prompts for this segment. Each alternative should:
  * Offer a different creative approach (different camera angle, lighting, composition, or perspective)
  * Maintain the same core message and product focus
  * Be equally detailed and specific as the primary visualPrompt
  * Provide variety in visual style while staying true to the segment's purpose
- audioNotes: Format as "Voiceover: [actual script text to be spoken]" OR "Music: [description of music/sound effects]". 
  CRITICAL: For voiceover segments, provide ONLY the actual script text that will be spoken by a narrator, NOT descriptive notes.
  The voiceover text will be converted to speech using text-to-speech, so it must be natural, conversational script text.
  
  CORRECT examples:
  - "Voiceover: Discover the luxury watch collection that defines elegance. Each timepiece is crafted with precision and passion."
  - "Voiceover: Transform your fitness journey today. Join thousands who have achieved their goals with our revolutionary program."
  - "Music: Upbeat electronic music. Voiceover: Experience the future of technology in your hands."
  
  INCORRECT examples (DO NOT USE):
  - "Voiceover: A narrator describes the product features" (this is a description, not script)
  - "Voiceover: The voiceover explains the benefits" (this is a description, not script)
  - "A professional voiceover discusses the product" (this is a description, not script)
  
  If there's both music and voiceover, format as: "Music: [description]. Voiceover: [actual script text to be spoken]"
  If there's only music, format as: "Music: [description of music/sound effects]"

Duration: ${duration}s
Style: ${style}

Return JSON with a "segments" array. Each segment must include:
- visualPrompt (string): The primary/default visual prompt
- visualPromptAlternatives (array of strings): 3-5 alternative visual prompts for user selection`

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

  private async analyzeFrames(frameUrls: string[]) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      if (!frameUrls || frameUrls.length !== 3) {
        throw new Error('analyze_frames requires exactly 3 frame URLs')
      }

      // Helper function to convert file path or URL to base64 image
      const getImageBase64 = async (urlOrPath: string): Promise<string> => {
        // If it's a URL (http/https), fetch it
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
          const response = await fetch(urlOrPath)
          if (!response.ok) {
            throw new Error(`Failed to fetch image from URL: ${urlOrPath}`)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          return buffer.toString('base64')
        }
        
        // If it's a local file path, read it
        const fs = await import('fs/promises')
        const fileBuffer = await fs.readFile(urlOrPath)
        return fileBuffer.toString('base64')
      }

      // Convert all frames to base64
      const frameImages = await Promise.all(
        frameUrls.map(async (url, index) => {
          try {
            const base64 = await getImageBase64(url)
            return {
              type: 'image_url' as const,
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            }
          } catch (error: any) {
            console.error(`[OpenAI MCP] Failed to load frame ${index + 1} from ${url}:`, error.message)
            throw new Error(`Failed to load frame ${index + 1}: ${error.message}`)
          }
        })
      )

      const systemPrompt = `You are analyzing 3 frames extracted from the end of a video segment. Your task is to select the frame (1, 2, or 3) that best represents the final state and would work best as a starting point for the next video segment in a commercial advertisement.

Consider:
- Visual composition and clarity
- Narrative continuity (how well it transitions to the next scene)
- Product visibility and positioning
- Overall aesthetic quality
- Frame stability (avoid blurry or motion-blurred frames)

Return your response as a JSON object with:
- selectedFrame: 1, 2, or 3 (the index of the best frame)
- reasoning: A brief explanation of why this frame was selected`

      const userMessage = `Analyze these 3 frames from the end of a video segment. Frame 1 is 1 second from the end, Frame 2 is 0.5 seconds from the end, and Frame 3 is at the very end. Select the frame that would work best as a starting point for the next video segment.`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              ...frameImages,
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI completion response')
      }

      // Parse and validate the response
      let parsed: { selectedFrame: number; reasoning: string }
      try {
        parsed = JSON.parse(content)
        if (typeof parsed.selectedFrame !== 'number' || parsed.selectedFrame < 1 || parsed.selectedFrame > 3) {
          throw new Error('Invalid selectedFrame value (must be 1, 2, or 3)')
        }
        if (typeof parsed.reasoning !== 'string') {
          throw new Error('Missing or invalid reasoning field')
        }
      } catch (parseError: any) {
        console.error('[OpenAI MCP] Invalid JSON response from analyze_frames:', content)
        throw new Error(`OpenAI returned invalid response: ${parseError.message}`)
      }

      // Convert to 0-based index for array access
      const selectedFrameIndex = parsed.selectedFrame - 1

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              selectedFrame: parsed.selectedFrame,
              selectedFrameIndex,
              reasoning: parsed.reasoning,
            }),
          },
        ],
      }
    } catch (error: any) {
      console.error('[OpenAI MCP] analyzeFrames error:', error.message)
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

