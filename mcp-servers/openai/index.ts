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
import { nanoid } from 'nanoid'

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

interface StoryboardJob {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: any
  error?: string
  createdAt?: number
  updatedAt?: number
}

class OpenAIMCPServer {
  private server: Server
  private jobStore: Map<string, StoryboardJob> = new Map()
  private jobTimestamps: Map<string, number> = new Map()
  private jobsDir: string

  // Helper functions for persistent job storage
  private async getJobsDir(): Promise<string> {
    if (!this.jobsDir) {
      const { promises: fs } = await import('fs')
      const dataDir = process.env.MCP_FILESYSTEM_ROOT || './data'
      this.jobsDir = resolve(dataDir, 'jobs')
      await fs.mkdir(this.jobsDir, { recursive: true })
    }
    return this.jobsDir
  }

  private async saveJobToDisk(jobId: string, job: StoryboardJob): Promise<void> {
    const { promises: fs } = await import('fs')
    const jobsDir = await this.getJobsDir()
    const filePath = resolve(jobsDir, `${jobId}.json`)
    const jobWithTimestamps = {
      ...job,
      updatedAt: Date.now(),
      createdAt: job.createdAt || Date.now(),
    }
    await fs.writeFile(filePath, JSON.stringify(jobWithTimestamps, null, 2))
  }

  private async loadJobFromDisk(jobId: string): Promise<StoryboardJob | null> {
    try {
      const { promises: fs } = await import('fs')
      const jobsDir = await this.getJobsDir()
      const filePath = resolve(jobsDir, `${jobId}.json`)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

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
    this.startJobCleanup()
  }

  private startJobCleanup() {
    // Clean up jobs older than 10 minutes every 5 minutes
    setInterval(() => {
      const now = Date.now()
      const maxAge = 10 * 60 * 1000 // 10 minutes
      
      for (const [jobId, timestamp] of this.jobTimestamps.entries()) {
        if (now - timestamp > maxAge) {
          this.jobStore.delete(jobId)
          this.jobTimestamps.delete(jobId)
          console.error(`[OpenAI MCP] Cleaned up old job: ${jobId}`)
        }
      }
    }, 5 * 60 * 1000) // Run every 5 minutes
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
              referenceImages: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional array of reference image URLs/paths (firstFrameImage, subjectReference, image, referenceImages)',
              },
            },
            required: ['parsed', 'duration', 'style'],
          },
        },
        {
          name: 'check_storyboard_status',
          description: 'Check the status of an asynchronous storyboard generation job',
          inputSchema: {
            type: 'object',
            properties: {
              jobId: {
                type: 'string',
                description: 'Job ID returned from plan_storyboard',
              },
            },
            required: ['jobId'],
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
        {
          name: 'analyze_reference_images',
          description: 'Analyze reference images and suggest visual prompt enhancements',
          inputSchema: {
            type: 'object',
            properties: {
              imageUrls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of reference image URLs or file paths (firstFrameImage, subjectReference, image, referenceImages)',
              },
            },
            required: ['imageUrls'],
          },
        },
        {
          name: 'generate_ad_stories',
          description: 'Generate 3 cohesive ad story options for a 24-second ad with 4 clips (6 seconds each)',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The ad description/prompt',
              },
              imageUrls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of reference image URLs',
              },
              duration: {
                type: 'number',
                description: 'Total ad duration in seconds (default: 24)',
                default: 24,
              },
              clipCount: {
                type: 'number',
                description: 'Number of clips (default: 4)',
                default: 4,
              },
              clipDuration: {
                type: 'number',
                description: 'Duration of each clip in seconds (default: 6)',
                default: 6,
              },
            },
            required: ['prompt', 'imageUrls'],
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
            return await this.planStoryboard(args.parsed, args.duration, args.style, args.referenceImages || [])
          
          case 'check_storyboard_status':
            return await this.checkStoryboardStatus(args.jobId)
          
          case 'text_to_speech':
            return await this.textToSpeech(
              args.text,
              args.voice || 'alloy',
              args.model || 'tts-1'
            )
          
          case 'analyze_frames':
            return await this.analyzeFrames(args.frameUrls)
          
          case 'analyze_reference_images':
            return await this.analyzeReferenceImages(args.imageUrls)
          
          case 'generate_ad_stories':
            return await this.generateAdStories(
              args.prompt,
              args.imageUrls || [],
              args.duration || 24,
              args.clipCount || 4,
              args.clipDuration || 6
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

  private async analyzeReferenceImages(imageUrls: string[]) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('analyze_reference_images requires at least one image URL')
      }

      // Helper function to convert file path or URL to base64 image
      const getImageBase64 = async (urlOrPath: string): Promise<string> => {
        // If it's already a data URL, extract the base64 part
        if (urlOrPath.startsWith('data:image/')) {
          const base64Match = urlOrPath.match(/data:image\/[^;]+;base64,(.+)/)
          if (base64Match && base64Match[1]) {
            return base64Match[1]
          }
        }
        
        // If it's a URL (http/https), fetch it
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
          const response = await fetch(urlOrPath)
          if (!response.ok) {
            throw new Error(`Failed to fetch image from URL: ${urlOrPath}`)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          return buffer.toString('base64')
        }
        
        // Check if it's binary data (contains null bytes, JPEG/PNG headers, or non-printable characters at start)
        // This can happen if binary data is accidentally passed as a string
        const hasNullBytes = urlOrPath.includes('\x00')
        const startsWithJpeg = urlOrPath.length > 2 && urlOrPath.charCodeAt(0) === 0xFF && urlOrPath.charCodeAt(1) === 0xD8
        const startsWithPng = urlOrPath.startsWith('\x89PNG')
        const startsWithNonPrintable = urlOrPath.length > 0 && urlOrPath.charCodeAt(0) < 32 && urlOrPath.charCodeAt(0) !== 9 && urlOrPath.charCodeAt(0) !== 10 && urlOrPath.charCodeAt(0) !== 13
        // Check for JPEG markers in corrupted binary data (JFIF, Exif, etc.)
        const containsJpegMarkers = urlOrPath.includes('JFIF') || urlOrPath.includes('Exif') || urlOrPath.includes('JPEG')
        // Check if it looks like a valid file path (contains path separators or common path patterns)
        const looksLikePath = urlOrPath.includes('/') || urlOrPath.includes('\\') || urlOrPath.startsWith('data/assets/') || urlOrPath.startsWith('./') || urlOrPath.match(/^[a-zA-Z]:[\\/]/)
        
        // If it has binary characteristics and doesn't look like a path, treat as binary
        if ((hasNullBytes || startsWithJpeg || startsWithPng || startsWithNonPrintable || containsJpegMarkers) && !looksLikePath) {
          // It's binary data - convert directly to base64
          console.error(`[OpenAI MCP] Warning: Received binary data instead of file path (length: ${urlOrPath.length}, hasNull: ${hasNullBytes}, isJpeg: ${startsWithJpeg}, hasMarkers: ${containsJpegMarkers}). Converting directly to base64.`)
          // Use 'latin1' encoding to preserve all byte values when converting string to buffer
          const buffer = Buffer.from(urlOrPath, 'latin1')
          return buffer.toString('base64')
        }
        
        // If it's a local file path, read it
        const fs = await import('fs/promises')
        
        // Validate it's a reasonable file path (not too short)
        if (urlOrPath.length < 3) {
          throw new Error(`Invalid file path: path too short (${urlOrPath.length} chars)`)
        }
        
        // Check if file exists before reading
        try {
          await fs.access(urlOrPath)
        } catch (accessError) {
          throw new Error(`File not found or not accessible: ${urlOrPath}`)
        }
        
        const fileBuffer = await fs.readFile(urlOrPath)
        return fileBuffer.toString('base64')
      }

      // Convert all reference images to base64 for Responses API
      const referenceImages = await Promise.all(
        imageUrls.map(async (url, index) => {
          try {
            // Log the URL/path for debugging (truncate if too long)
            const urlPreview = typeof url === 'string' && url.length > 100 ? url.substring(0, 100) + '...' : url
            console.error(`[OpenAI MCP] Processing reference image ${index + 1}: ${urlPreview} (type: ${typeof url}, length: ${typeof url === 'string' ? url.length : 'N/A'})`)
            
            const base64 = await getImageBase64(url)
            return {
              type: 'input_image' as const,
              image_url: `data:image/jpeg;base64,${base64}`,
            }
          } catch (error: any) {
            console.error(`[OpenAI MCP] Failed to load reference image ${index + 1} from ${url}:`, error.message)
            console.error(`[OpenAI MCP] Image URL/path type: ${typeof url}, length: ${typeof url === 'string' ? url.length : 'N/A'}`)
            throw new Error(`Failed to load reference image ${index + 1}: ${error.message}`)
          }
        })
      )

      const systemPrompt = `You are analyzing reference images provided by the user for video generation. Your task is to identify key visual elements, subjects, composition, style, colors, mood, and any product/brand elements that should be reflected in the video prompts.

CRITICAL: You must provide an explicit description of exactly what is shown in the image(s). This is the PRIMARY output and will be used as the starting point for video generation.

🚨 MOST IMPORTANT: Product Placement/Location
You MUST identify WHERE the product is located/placed. This is the most critical detail:
- Is it being WORN (on wrist, on body, on clothing)?
- Is it on a SURFACE (on table, on desk, on shelf)?
- Is it being HELD (in hand, in fingers)?
- Is it in a CONTAINER (in box, in packaging)?

These are COMPLETELY DIFFERENT scenes. "A man wearing a watch on his wrist" is NOT the same as "a watch on a table". You must be explicit about the placement.

Analyze:
- Key visual elements and subjects in the images
- Composition and framing style
- Color palette and lighting
- Mood and atmosphere
- Product or brand elements
- Visual style and aesthetic
- Any specific details that should be preserved or emphasized
- EXACTLY what is shown: subject, action/state, product placement, context
- 🚨 WHERE the product is located/placed (this is CRITICAL)

CRITICAL: You MUST return your response as a valid JSON object only, with no additional text before or after the JSON.

Return your response as a JSON object with:
- sceneDescription: (REQUIRED) A detailed, explicit description of exactly what is shown in the image(s). Format: "A [subject] [action/state] with [product] [EXPLICIT PLACEMENT/LOCATION]". 
  Examples:
  - "A man wearing a watch on his wrist" (NOT "a man with a watch")
  - "A watch resting on a polished wooden table" (NOT "a watch")
  - "A woman holding a bottle in her hand" (NOT "a woman with a bottle")
  The sceneDescription MUST include the product's exact placement/location. This is the PRIMARY field and will be used as the starting point for the hook segment.
- suggestedEnhancements: A string containing specific prompt enhancements that should be merged with existing visual prompts to better match these reference images. Focus on concrete visual details (colors, composition, style, mood, product placement, etc.)
- keyElements: An array of strings describing the key visual elements identified
- styleNotes: A string describing the overall visual style and aesthetic

Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.`

      const userMessage = `Analyze these ${imageUrls.length} reference image(s) and provide:
1. An explicit sceneDescription of exactly what is shown (this is critical - describe the actual scene, subject, and product placement)

🚨 CRITICAL QUESTION: Where is the product located/placed?
- Is it being WORN (on wrist/body/clothing)? → Say "wearing [product] on [location]"
- Is it on a SURFACE (table/desk/shelf)? → Say "[product] on [surface]"
- Is it being HELD (in hand/fingers)? → Say "holding [product] in [location]"
- Is it in a CONTAINER (box/packaging)? → Say "[product] in [container]"

These are completely different scenes. If you see a watch on someone's wrist, say "wearing a watch on his/her wrist". If you see a watch on a table, say "watch on a table". These are NOT the same.

2. Suggest enhancements to visual prompts that would better match these images

Be extremely specific about product placement. For example:
- ✅ CORRECT: "a man wearing a watch on his wrist" (explicit placement)
- ❌ WRONG: "a man with a watch" (no placement specified)
- ❌ WRONG: "a watch" (no context or placement)`

      console.error(`[OpenAI MCP] Using GPT-5 with Responses API (high detail) for image analysis`)
      
      // Use Responses API with GPT-5 for vision, with timeout fallback
      let content: string
      try {
        const response = await Promise.race([
          (openai as any).responses.create({
            model: 'gpt-5',
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: `${systemPrompt}\n\n${userMessage}` },
                  ...referenceImages,
                ],
              },
            ],
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Responses API timeout after 90 seconds')), 90000)
          )
        ]) as any

        // Responses API returns output_text or output_content array
        if (response.output_text) {
          content = response.output_text
        } else if (response.output_content && Array.isArray(response.output_content) && response.output_content.length > 0) {
          // Handle array format - extract text from first content item
          const firstContent = response.output_content[0]
          if (firstContent.type === 'text' && firstContent.text) {
            content = firstContent.text
          } else if (typeof firstContent === 'string') {
            content = firstContent
          } else {
            // Try to stringify if it's an object
            content = JSON.stringify(firstContent)
          }
        } else {
          console.error(`[OpenAI MCP] Unexpected Responses API response format:`, JSON.stringify(response, null, 2))
          throw new Error('No content in OpenAI Responses API response')
        }
        
        if (!content) {
          throw new Error('No content in OpenAI Responses API response')
        }
        
        console.error(`[OpenAI MCP] Responses API returned content (length: ${content.length}):`, content.substring(0, 200))
      } catch (error: any) {
        console.error(`[OpenAI MCP] Responses API failed or timed out: ${error.message}`)
        console.error(`[OpenAI MCP] Falling back to Chat Completions API with GPT-4o`)
        
        // Fallback to Chat Completions API with GPT-4o
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userMessage },
                ...referenceImages.map(img => ({
                  type: 'image_url' as const,
                  image_url: {
                    url: img.image_url,
                    detail: 'high' as const,
                  },
                })),
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        })
        
        content = completion.choices[0]?.message?.content || ''
        if (!content) {
          throw new Error('No content in OpenAI Chat Completions fallback response')
        }
      }

      // Parse and validate the response
      let parsed: { sceneDescription: string; suggestedEnhancements: string; keyElements: string[]; styleNotes: string }
      try {
        // Try to parse JSON - handle cases where response might have markdown code blocks
        let jsonContent = content.trim()
        
        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```')) {
          const match = jsonContent.match(/```(?:json)?\n?(.*?)```/s)
          if (match && match[1]) {
            jsonContent = match[1].trim()
          }
        }
        
        parsed = JSON.parse(jsonContent)
        
        // Log the parsed response for debugging
        console.error(`[OpenAI MCP] Parsed response keys:`, Object.keys(parsed))
        console.error(`[OpenAI MCP] sceneDescription type: ${typeof parsed.sceneDescription}, value: ${parsed.sceneDescription?.substring(0, 100)}`)
        
        // Validate sceneDescription field
        if (!parsed.sceneDescription) {
          console.error(`[OpenAI MCP] ERROR: sceneDescription is missing or falsy. Full response:`, JSON.stringify(parsed, null, 2))
          throw new Error('Missing or invalid sceneDescription field (REQUIRED)')
        }
        
        if (typeof parsed.sceneDescription !== 'string') {
          console.error(`[OpenAI MCP] ERROR: sceneDescription is not a string. Type: ${typeof parsed.sceneDescription}, Value:`, parsed.sceneDescription)
          throw new Error(`sceneDescription must be a string, got ${typeof parsed.sceneDescription}`)
        }
        
        if (!parsed.sceneDescription.trim()) {
          console.error(`[OpenAI MCP] ERROR: sceneDescription is empty or whitespace only`)
          throw new Error('sceneDescription field is empty (REQUIRED)')
        }
        
        // Validate that sceneDescription includes product placement/location
        const sceneDescLower = parsed.sceneDescription.toLowerCase()
        const placementIndicators = ['on', 'wearing', 'holding', 'in', 'resting', 'placed', 'sitting', 'lying']
        const hasPlacement = placementIndicators.some(indicator => sceneDescLower.includes(indicator))
        
        if (!hasPlacement && (sceneDescLower.includes('watch') || sceneDescLower.includes('product') || sceneDescLower.includes('bottle') || sceneDescLower.includes('can'))) {
          console.warn(`[OpenAI MCP] WARNING: sceneDescription may be missing explicit product placement: "${parsed.sceneDescription}"`)
          console.warn(`[OpenAI MCP] sceneDescription should include WHERE the product is (on wrist, on table, in hand, etc.)`)
        }
        
        if (typeof parsed.suggestedEnhancements !== 'string') {
          throw new Error('Missing or invalid suggestedEnhancements field')
        }
        if (!Array.isArray(parsed.keyElements)) {
          throw new Error('Missing or invalid keyElements field (must be array)')
        }
        if (typeof parsed.styleNotes !== 'string') {
          throw new Error('Missing or invalid styleNotes field')
        }
      } catch (parseError: any) {
        console.error('[OpenAI MCP] Invalid JSON response from analyze_reference_images:', content)
        throw new Error(`OpenAI returned invalid response: ${parseError.message}`)
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sceneDescription: parsed.sceneDescription,
              suggestedEnhancements: parsed.suggestedEnhancements,
              keyElements: parsed.keyElements,
              styleNotes: parsed.styleNotes,
            }),
          },
        ],
      }
    } catch (error: any) {
      console.error('[OpenAI MCP] analyzeReferenceImages error:', error.message)
      if (error.response) {
        console.error('[OpenAI MCP] API response status:', error.response.status)
        console.error('[OpenAI MCP] API response data:', error.response.data)
      }
      throw error
    }
  }

  private async checkStoryboardStatus(jobId: string) {
    // First check in-memory store
    let job = this.jobStore.get(jobId)
    
    // If not found in memory, try loading from disk
    if (!job) {
      job = await this.loadJobFromDisk(jobId)
      if (job) {
        // Restore to in-memory store
        this.jobStore.set(jobId, job)
        if (job.createdAt) {
          this.jobTimestamps.set(jobId, job.createdAt)
        }
      }
    }
    
    if (!job) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'not_found',
              error: 'Job not found',
            }),
          },
        ],
      }
    }
    
    const response: any = {
      status: job.status,
    }
    
    if (job.status === 'completed' && job.result) {
      response.result = job.result
    } else if (job.status === 'failed' && job.error) {
      response.error = job.error
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

  private async planStoryboard(parsed: any, duration: number, style: string, referenceImages: string[] = []) {
    // Generate job ID and return immediately
    const jobId = nanoid()
    
    // Store job as pending (both in memory and on disk)
    const job: StoryboardJob = {
      status: 'pending',
      createdAt: Date.now(),
    }
    this.jobStore.set(jobId, job)
    this.jobTimestamps.set(jobId, Date.now())
    await this.saveJobToDisk(jobId, job).catch((error) => {
      console.error(`[OpenAI MCP] Failed to save job ${jobId} to disk:`, error)
    })
    
    // Start async processing (don't await)
    this.processStoryboardAsync(jobId, parsed, duration, style, referenceImages).catch((error) => {
      console.error(`[OpenAI MCP] Storyboard job ${jobId} failed:`, error)
      const failedJob: StoryboardJob = {
        status: 'failed',
        error: error.message || 'Unknown error',
        createdAt: job.createdAt,
      }
      this.jobStore.set(jobId, failedJob)
      this.saveJobToDisk(jobId, failedJob).catch((saveError) => {
        console.error(`[OpenAI MCP] Failed to save failed job ${jobId} to disk:`, saveError)
      })
    })
    
    // Return job ID immediately
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            jobId,
            status: 'pending',
          }),
        },
      ],
    }
  }

  private async processStoryboardAsync(jobId: string, parsed: any, duration: number, style: string, referenceImages: string[] = []) {
    // Update job status to processing (both in memory and on disk)
    const processingJob: StoryboardJob = {
      status: 'processing',
      createdAt: (await this.loadJobFromDisk(jobId))?.createdAt || Date.now(),
    }
    this.jobStore.set(jobId, processingJob)
    await this.saveJobToDisk(jobId, processingJob).catch((error) => {
      console.error(`[OpenAI MCP] Failed to save processing job ${jobId} to disk:`, error)
    })
    
    try {
      // Analyze reference images if provided
      let imageEnhancements: string = ''
      let imageAnalysis: any = null
    
    if (referenceImages && referenceImages.length > 0) {
      try {
        console.error(`[OpenAI MCP] Analyzing ${referenceImages.length} reference image(s) for prompt enhancement...`)
        const analysisResult = await this.analyzeReferenceImages(referenceImages)
        
        // Parse the MCP response format - analyzeReferenceImages returns MCP content structure
        let analysisContent: any
        if (analysisResult && analysisResult.content && analysisResult.content[0]) {
          const contentItem = analysisResult.content[0]
          if (contentItem.text) {
            // MCP content item with text property
            analysisContent = JSON.parse(contentItem.text)
          } else if (typeof contentItem === 'string') {
            // Direct string content
            analysisContent = JSON.parse(contentItem)
          } else {
            // Already an object
            analysisContent = contentItem
          }
        } else {
          throw new Error('Invalid response format from analyzeReferenceImages')
        }
        
        imageAnalysis = analysisContent
        imageEnhancements = analysisContent.suggestedEnhancements || ''
        const sceneDescription = analysisContent.sceneDescription || ''
        
        console.error(`[OpenAI MCP] Reference image analysis completed:`)
        console.error(`[OpenAI MCP] Scene description: ${sceneDescription}`)
        console.error(`[OpenAI MCP] Key elements: ${analysisContent.keyElements?.join(', ')}`)
        console.error(`[OpenAI MCP] Style notes: ${analysisContent.styleNotes}`)
        console.error(`[OpenAI MCP] Suggested enhancements: ${imageEnhancements}`)
        
        // Store sceneDescription for use in system prompt
        imageAnalysis.sceneDescription = sceneDescription
      } catch (error: any) {
        console.error(`[OpenAI MCP] Failed to analyze reference images: ${error.message}`)
        if (error.stack) {
          console.error(`[OpenAI MCP] Error stack: ${error.stack}`)
        }
        console.error(`[OpenAI MCP] Continuing without image-based enhancements`)
        
        // Set defaults so storyboard generation can continue
        imageAnalysis = {
          sceneDescription: '', // Empty - will skip reference image requirements
          suggestedEnhancements: '',
          keyElements: [],
          styleNotes: '',
        }
        imageEnhancements = ''
        // Continue without enhancements if analysis fails
      }
    }
    
    // Extract sceneDescription if available
    const sceneDescription = imageAnalysis?.sceneDescription || ''
    
    // Build the system prompt with reference image requirements at the top if available
    const referenceImageSection = sceneDescription ? `\n\n═══════════════════════════════════════════════════════════════
🚨 CRITICAL REFERENCE IMAGE REQUIREMENT - READ THIS FIRST 🚨
═══════════════════════════════════════════════════════════════

The reference image shows: "${sceneDescription}"

MANDATORY REQUIREMENT FOR HOOK SEGMENT:
The hook segment visualPrompt MUST start with exactly this scene. 

CORRECT Example (if sceneDescription is "a man wearing a watch on his wrist"):
  ✅ "Close-up shot of a man wearing a watch on his wrist, adjusting his tie in a professional setting. The camera slowly zooms in on the watch..."
  ✅ "Medium shot of a man in a formal suit, with a luxury watch visible on his wrist as he adjusts his attire..."
  
INCORRECT Examples (DO NOT USE):
  ❌ "Close-up shot of a luxury watch on a marble table..." (WRONG - watch is on table, not on wrist)
  ❌ "Wide shot of a watch on a black leather desk..." (WRONG - watch is on desk, not on wrist)
  ❌ "Watch resting on a polished wooden table..." (WRONG - watch is on table, not being worn)

The hook segment visualPrompt MUST begin by describing: "${sceneDescription}"
Then continue with natural action/movement from that starting point.

DO NOT create a different scene. The reference image is the STARTING POINT, not inspiration.
═══════════════════════════════════════════════════════════════\n\n` : ''
    
    const systemPrompt = `${referenceImageSection}Create a video storyboard with 3-5 segments. 

🚨 REQUIRED SEGMENT STRUCTURE:
You MUST create at least 3 segments with the following structure:
- 1 hook segment (required) - Establishes the scene, character, or action
- 1-3 body segments (at least 1 required) - Continues the story from the hook
- 1 CTA segment (required) - Builds to a natural conclusion showcasing the product

The storyboard MUST include all three types: hook, body, and CTA. Do not create a storyboard with only one segment.

Each segment needs:
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
  * EMOTIONAL VISUAL STORYTELLING: Include details that create emotional impact - facial expressions, body language, visual mood, and emotional atmosphere that connects with viewers
  * PEOPLE COUNT LIMITATION: Limit scenes to 3-4 people maximum. Prefer smaller groups (1-3 people) when possible for better face quality. Avoid large groups, crowds, or more than 4 people in any scene
  * FACE QUALITY: Use close-ups and medium shots to ensure clear, sharp faces. Emphasize "sharp faces, clear facial features, detailed faces, professional portrait quality" in prompts. Avoid scenes with many people that could result in blurry or distorted faces
  * CRITICAL: For story continuity - Each segment must logically flow from the previous segment:
    - Hook segment: ${sceneDescription ? `🚨 MANDATORY: MUST start with exactly what is shown in the reference image: "${sceneDescription}". The visualPrompt MUST begin by describing this exact scene. Example: If sceneDescription is "a man wearing a watch on his wrist", the prompt must start with "Close-up/Medium/Wide shot of a man wearing a watch on his wrist..." NOT "watch on table" or any other variation.` : 'Establish the scene, character, or action'}
    - Body segment(s): Continue the story from the hook, building on the narrative. Use transition language like "continuing", "as the action progresses", "building on the momentum", etc.
    - CTA segment: Build to a natural conclusion that showcases the product, transitioning smoothly from the body segment(s)
  * Create a cohesive narrative arc where each segment feels like a natural continuation, not an abrupt change
  * ${sceneDescription ? `🚨 CRITICAL REMINDER: The hook segment visualPrompt MUST start with "${sceneDescription}". This is non-negotiable. Before finalizing your response, verify that the hook segment visualPrompt begins with this exact scene description.` : ''}
  * 🚨 CHARACTER CONSISTENCY: Extract ALL characters from the hook segment and maintain their EXACT appearance across ALL segments:
    - In hook segment: Include explicit character descriptions with gender, age, physical features (hair color/style, build), and clothing
    - In body and CTA segments: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance"
    - CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
    - Do NOT change character gender, age, or physical appearance between scenes
    - Example: If hook describes "a teenage boy with brown hair", body segments must reference "the same teenage boy with brown hair", not "a teen" or "a young person"
- visualPromptAlternatives: Array of 3-5 alternative visual prompts for this segment. Each alternative should:
  * Offer a different creative approach (different camera angle, lighting, composition, or perspective)
  * Maintain the same core message and product focus
  * Be equally detailed and specific as the primary visualPrompt
  * Provide variety in visual style while staying true to the segment's purpose
  * Maintain story continuity with previous segments (for body and CTA segments)
  * ${sceneDescription ? `🚨 CRITICAL: For the hook segment, ALL alternative prompts MUST also start with the same sceneDescription: "${sceneDescription}". They can vary camera angle (close-up, wide, overhead, side), lighting (soft, dramatic, natural, studio), composition, or perspective, but the product placement and scene must match the reference image. DO NOT create alternatives that change the product placement (e.g., from "wearing on wrist" to "on table" or "in case") - these are different scenes, not alternatives. Example: If sceneDescription is "a man wearing a watch on his wrist", all alternatives must show "person/man wearing watch on wrist", not "watch on table" or "watch in case".` : ''}
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
${imageEnhancements ? `\nIMPORTANT: Reference images were provided. Use these enhancements when creating visual prompts:\n${imageEnhancements}\n\nMerge these enhancements naturally into all visual prompts (both primary and alternatives) to ensure the generated videos match the reference images.` : ''}
${sceneDescription ? `\n\n═══════════════════════════════════════════════════════════════
🚨 FINAL VALIDATION REQUIREMENT 🚨
═══════════════════════════════════════════════════════════════
Before returning your response, you MUST verify:
1. The hook segment visualPrompt begins with: "${sceneDescription}"
2. The hook segment does NOT describe the product in a different location (e.g., "on table" when image shows "on wrist")
3. All alternative prompts for the hook segment also start with this scene

PLACEMENT VALIDATION RULES:
${(() => {
  const sceneLower = sceneDescription.toLowerCase()
  if (sceneLower.includes('wearing') || sceneLower.includes('on wrist') || sceneLower.includes('on body')) {
    return `- If sceneDescription contains "wearing" or "on wrist", the hook segment MUST NOT contain: "on table", "on desk", "resting on", "sitting on", "placed on", "lying on", "on cushion", "in case", or any surface placement words
- The hook segment MUST describe the product being WORN, not on a surface
- ALL alternative prompts for the hook segment MUST also show the product being WORN (wearing/on wrist), not on a surface (table/desk/cushion/case)
- Alternatives can vary camera angle, lighting, composition, but MUST keep "person/man wearing watch on wrist"`
  } else if (sceneLower.includes('on table') || sceneLower.includes('on desk') || sceneLower.includes('resting on')) {
    return `- If sceneDescription contains "on table" or "on desk", the hook segment MUST NOT contain: "wearing", "on wrist", "on body", or any body placement words
- The hook segment MUST describe the product on a SURFACE, not being worn
- ALL alternative prompts for the hook segment MUST also show the product on a SURFACE, not being worn
- Alternatives can vary camera angle, lighting, composition, but MUST keep product "on table/desk/cushion"`
  } else if (sceneLower.includes('holding') || sceneLower.includes('in hand')) {
    return `- If sceneDescription contains "holding" or "in hand", the hook segment MUST NOT contain: "on table", "on desk", "wearing", or placement words that don't match
- The hook segment MUST describe the product being HELD
- ALL alternative prompts for the hook segment MUST also show the product being HELD
- Alternatives can vary camera angle, lighting, composition, but MUST keep product "being held"`
  }
  return `- Verify the hook segment matches the product placement described in sceneDescription
- Do NOT change the product location (worn vs on surface vs held are completely different)
- ALL alternative prompts must maintain the same product placement as sceneDescription`
})()}

If your hook segment does not start with "${sceneDescription}" or contains conflicting placement words, you MUST revise it.

ALTERNATIVE PROMPTS VALIDATION:
- Verify ALL alternative prompts for the hook segment also start with "${sceneDescription}"
- All alternatives must maintain the same product placement (wearing/on table/holding) as the sceneDescription
- Alternatives can only vary: camera angle (close-up, wide, overhead, side), lighting (soft, dramatic, natural, studio), composition, perspective - NOT product placement
- DO NOT create alternatives that change product placement (e.g., "wearing on wrist" → "on table" is WRONG)
═══════════════════════════════════════════════════════════════\n` : ''}

STORY CONTINUITY REQUIREMENTS:
- Create a cohesive narrative where each segment builds on the previous one
- Hook segment: Sets up the story, character, or action
- Body segment(s): Must continue the story from the hook. Use language that connects to the previous segment (e.g., "as the rider continues", "the action intensifies", "building on the momentum")
- CTA segment: Must naturally conclude the story, transitioning from the body segment(s) to showcase the product
- Avoid abrupt scene changes - each transition should feel natural and connected
- Maintain consistent characters, settings, or themes across segments when appropriate
- For product videos: Ensure the product appears consistently throughout, maintaining its appearance and text readability
- IMPORTANT: For product videos with text/labels (cans, bottles, packages), use shorter segment durations (2-5 seconds) to minimize text degradation and maintain product consistency throughout the video

🚨 CHARACTER CONSISTENCY REQUIREMENTS (CRITICAL):
- Extract ALL characters mentioned in the hook segment and maintain their EXACT appearance across ALL segments
- For each character, identify and maintain: gender (male/female/non-binary), age (teenage/elderly/young adult/etc.), physical features (hair color/style, build, distinctive features), and clothing style
- Hook segment visualPrompt: MUST include explicit character descriptions (e.g., "a teenage [gender] with [hair color] hair, [build], wearing [clothing]")
- Body and CTA segment visualPrompts: MUST reference characters as "the same [age] [gender] person with [features]" or "continuing with the identical character appearance"
- CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
- Do NOT use vague terms like "a teen" or "a person" in later segments - always reference "the same teenage [gender]" or "the same elderly [gender]" from the hook
- Do NOT change character gender, age, or physical appearance between scenes
- Example: If hook describes "a teenage boy with brown hair cheering up an elderly man", body segments must reference "the same teenage boy with brown hair" and "the same elderly man", not generic terms

EMOTIONAL CAPTIVATION REQUIREMENTS:
- Create visually compelling scenes that evoke emotions through facial expressions, body language, and visual mood
- Use emotional visual storytelling techniques: capture genuine expressions, meaningful gestures, and atmospheric details that create emotional resonance
- Ensure each visual prompt includes emotional elements that connect with viewers (joy, aspiration, relief, excitement, inspiration, etc.)

FACE QUALITY AND PEOPLE COUNT REQUIREMENTS:
- CRITICAL: Limit all scenes to 3-4 people maximum per scene
- Prefer smaller groups (1-3 people) when possible for better face quality
- Use close-ups and medium shots to ensure clear, sharp faces
- Avoid large groups, crowds, or more than 4 people in any scene
- Include face quality keywords in visual prompts: "sharp faces, clear facial features, detailed faces, professional portrait quality"
- Negative prompt suggestions: "blurry faces, distorted faces, crowds, large groups, more than 4 people, deformed faces, bad anatomy"

Return JSON with a "segments" array. Each segment must include:
- visualPrompt (string): The primary/default visual prompt${imageEnhancements ? ' (enhanced with reference image details)' : ''} that creates narrative flow
- visualPromptAlternatives (array of strings): 3-5 alternative visual prompts for user selection${imageEnhancements ? ' (each enhanced with reference image details)' : ''} that maintain story continuity`

    // Build user message with sceneDescription emphasis if available
    const userMessage = sceneDescription 
      ? `${JSON.stringify(parsed)}\n\n🚨 CRITICAL: The reference image shows "${sceneDescription}". The hook segment visualPrompt MUST start with this exact scene. Before finalizing, verify your hook segment begins with "${sceneDescription}" and does NOT place the product in a different location.`
      : JSON.stringify(parsed)
    
    // Use gpt-4o-mini for faster generation (within 60s MCP timeout)
    // Add timeout to ensure we don't exceed MCP SDK's 60-second limit
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 3000, // Reduced further for speed
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Storyboard generation timed out after 50 seconds')), 50000)
      )
    ]) as any

    const responseContent = completion.choices[0].message.content || '{}'
    
      // Store result in job store
      const storyboardData = JSON.parse(responseContent)
      
      // Do validation asynchronously (fire and forget) to avoid blocking
      setImmediate(() => {
        try {
          // Validate segment structure
          if (storyboardData.segments && Array.isArray(storyboardData.segments)) {
            const segmentTypes = storyboardData.segments.map((seg: any) => seg.type)
            const hasHook = segmentTypes.includes('hook')
            const hasBody = segmentTypes.includes('body')
            const hasCta = segmentTypes.includes('cta')
            
            console.error(`[OpenAI MCP] Storyboard validation: ${storyboardData.segments.length} segments found`)
            console.error(`[OpenAI MCP] Segment types: ${segmentTypes.join(', ')}`)
            
            if (!hasHook || !hasBody || !hasCta) {
              console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: Storyboard missing required segments!`)
              console.error(`[OpenAI MCP] Found: hook=${hasHook}, body=${hasBody}, cta=${hasCta}`)
              console.error(`[OpenAI MCP] Expected: hook=true, body=true, cta=true`)
              console.error(`[OpenAI MCP] The storyboard MUST include all three types: hook, body, and CTA`)
            } else {
              console.error(`[OpenAI MCP] ✅ Validation passed: Storyboard contains all required segment types (hook, body, cta)`)
            }
            
            // Validate hook segment and alternatives match sceneDescription
            if (sceneDescription && storyboardData.segments && Array.isArray(storyboardData.segments)) {
              const hookSegment = storyboardData.segments.find((seg: any) => seg.type === 'hook')
              
              if (hookSegment && hookSegment.visualPrompt) {
                const hookPromptLower = hookSegment.visualPrompt.toLowerCase()
                const sceneDescLower = sceneDescription.toLowerCase()
                
                // Check for placement mismatches in primary prompt
                const hasWearing = sceneDescLower.includes('wearing') || sceneDescLower.includes('on wrist')
                const hasOnTable = sceneDescLower.includes('on table') || sceneDescLower.includes('on desk') || sceneDescLower.includes('resting on')
                const hasHolding = sceneDescLower.includes('holding') || sceneDescLower.includes('in hand')
                
                const hookHasTable = hookPromptLower.includes('on table') || hookPromptLower.includes('on desk') || hookPromptLower.includes('resting on') || hookPromptLower.includes('lying on')
                const hookHasWearing = hookPromptLower.includes('wearing') || hookPromptLower.includes('on wrist')
                const hookHasHolding = hookPromptLower.includes('holding') || hookPromptLower.includes('in hand')
                
                // Validate placement matches
                if (hasWearing && hookHasTable) {
                  console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: sceneDescription says "${sceneDescription}" (wearing/on wrist) but hook segment says "${hookSegment.visualPrompt.substring(0, 100)}..." (on table/desk)`)
                  console.error(`[OpenAI MCP] The hook segment does NOT match the reference image placement!`)
                } else if (hasOnTable && hookHasWearing) {
                  console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: sceneDescription says "${sceneDescription}" (on table) but hook segment says "${hookSegment.visualPrompt.substring(0, 100)}..." (wearing/on wrist)`)
                  console.error(`[OpenAI MCP] The hook segment does NOT match the reference image placement!`)
                } else if (hasHolding && (hookHasTable || hookHasWearing)) {
                  console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: sceneDescription says "${sceneDescription}" (holding) but hook segment placement doesn't match`)
                }
                
                // Validate alternative prompts
                if (hookSegment.visualPromptAlternatives && Array.isArray(hookSegment.visualPromptAlternatives)) {
                  hookSegment.visualPromptAlternatives.forEach((altPrompt: string, index: number) => {
                    const altPromptLower = altPrompt.toLowerCase()
                    const altHasTable = altPromptLower.includes('on table') || altPromptLower.includes('on desk') || altPromptLower.includes('resting on') || altPromptLower.includes('lying on') || altPromptLower.includes('on cushion') || altPromptLower.includes('in case')
                    const altHasWearing = altPromptLower.includes('wearing') || altPromptLower.includes('on wrist')
                    const altHasHolding = altPromptLower.includes('holding') || altPromptLower.includes('in hand')
                    
                    // Check if alternative matches sceneDescription placement
                    if (hasWearing && altHasTable) {
                      console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: Alternative prompt ${index + 1} doesn't match sceneDescription!`)
                      console.error(`[OpenAI MCP] sceneDescription: "${sceneDescription}" (wearing/on wrist)`)
                      console.error(`[OpenAI MCP] Alternative ${index + 1}: "${altPrompt.substring(0, 100)}..." (on table/desk/cushion/case)`)
                      console.error(`[OpenAI MCP] Alternative prompts MUST also show the product being worn, not on a surface!`)
                    } else if (hasOnTable && altHasWearing) {
                      console.error(`[OpenAI MCP] ⚠️ VALIDATION ERROR: Alternative prompt ${index + 1} doesn't match sceneDescription!`)
                      console.error(`[OpenAI MCP] sceneDescription: "${sceneDescription}" (on table)`)
                      console.error(`[OpenAI MCP] Alternative ${index + 1}: "${altPrompt.substring(0, 100)}..." (wearing/on wrist)`)
                      console.error(`[OpenAI MCP] Alternative prompts MUST also show the product on a surface, not being worn!`)
                    } else if (hasWearing && !altHasWearing && !altHasHolding) {
                      console.warn(`[OpenAI MCP] ⚠️ WARNING: Alternative prompt ${index + 1} may not match sceneDescription placement`)
                      console.warn(`[OpenAI MCP] sceneDescription: "${sceneDescription}" (wearing/on wrist)`)
                      console.warn(`[OpenAI MCP] Alternative ${index + 1}: "${altPrompt.substring(0, 100)}..."`)
                    }
                  })
                }
                
                // Check if hook segment starts with sceneDescription elements
                const sceneKeywords = sceneDescLower.split(' ').filter((word: string) => word.length > 3)
                const matchingKeywords = sceneKeywords.filter((keyword: string) => hookPromptLower.includes(keyword))
                
                if (matchingKeywords.length < sceneKeywords.length * 0.5) {
                  console.warn(`[OpenAI MCP] ⚠️ WARNING: Hook segment may not match sceneDescription. Only ${matchingKeywords.length}/${sceneKeywords.length} keywords found.`)
                  console.warn(`[OpenAI MCP] sceneDescription: "${sceneDescription}"`)
                  console.warn(`[OpenAI MCP] Hook prompt start: "${hookSegment.visualPrompt.substring(0, 150)}..."`)
                } else {
                  console.error(`[OpenAI MCP] ✅ Validation passed: Hook segment appears to match sceneDescription`)
                }
              }
            }
          }
        } catch (validationError: any) {
          // Don't fail if validation fails, just log
          console.warn(`[OpenAI MCP] Could not validate storyboard response: ${validationError.message}`)
        }
      })
      
      // Store completed result (both in memory and on disk)
      const completedJob: StoryboardJob = {
        status: 'completed',
        result: storyboardData,
        createdAt: (await this.loadJobFromDisk(jobId))?.createdAt || Date.now(),
      }
      this.jobStore.set(jobId, completedJob)
      await this.saveJobToDisk(jobId, completedJob).catch((error) => {
        console.error(`[OpenAI MCP] Failed to save completed job ${jobId} to disk:`, error)
      })
    } catch (error: any) {
      // Store error (both in memory and on disk)
      const failedJob: StoryboardJob = {
        status: 'failed',
        error: error.message || 'Unknown error',
        createdAt: (await this.loadJobFromDisk(jobId))?.createdAt || Date.now(),
      }
      this.jobStore.set(jobId, failedJob)
      await this.saveJobToDisk(jobId, failedJob).catch((saveError) => {
        console.error(`[OpenAI MCP] Failed to save failed job ${jobId} to disk:`, saveError)
      })
      throw error
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
        // If it's already a data URL, extract the base64 part
        if (urlOrPath.startsWith('data:image/')) {
          const base64Match = urlOrPath.match(/data:image\/[^;]+;base64,(.+)/)
          if (base64Match && base64Match[1]) {
            return base64Match[1]
          }
        }
        
        // If it's a URL (http/https), fetch it
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
          const response = await fetch(urlOrPath)
          if (!response.ok) {
            throw new Error(`Failed to fetch image from URL: ${urlOrPath}`)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          return buffer.toString('base64')
        }
        
        // Check if it's binary data (contains null bytes, JPEG/PNG headers, or non-printable characters at start)
        // This can happen if binary data is accidentally passed as a string
        const hasNullBytes = urlOrPath.includes('\x00')
        const startsWithJpeg = urlOrPath.length > 2 && urlOrPath.charCodeAt(0) === 0xFF && urlOrPath.charCodeAt(1) === 0xD8
        const startsWithPng = urlOrPath.startsWith('\x89PNG')
        const startsWithNonPrintable = urlOrPath.length > 0 && urlOrPath.charCodeAt(0) < 32 && urlOrPath.charCodeAt(0) !== 9 && urlOrPath.charCodeAt(0) !== 10 && urlOrPath.charCodeAt(0) !== 13
        // Check for JPEG markers in corrupted binary data (JFIF, Exif, etc.)
        const containsJpegMarkers = urlOrPath.includes('JFIF') || urlOrPath.includes('Exif') || urlOrPath.includes('JPEG')
        // Check if it looks like a valid file path (contains path separators or common path patterns)
        const looksLikePath = urlOrPath.includes('/') || urlOrPath.includes('\\') || urlOrPath.startsWith('data/assets/') || urlOrPath.startsWith('./') || urlOrPath.match(/^[a-zA-Z]:[\\/]/)
        
        // If it has binary characteristics and doesn't look like a path, treat as binary
        if ((hasNullBytes || startsWithJpeg || startsWithPng || startsWithNonPrintable || containsJpegMarkers) && !looksLikePath) {
          // It's binary data - convert directly to base64
          console.error(`[OpenAI MCP] Warning: Received binary data instead of file path (length: ${urlOrPath.length}, hasNull: ${hasNullBytes}, isJpeg: ${startsWithJpeg}, hasMarkers: ${containsJpegMarkers}). Converting directly to base64.`)
          // Use 'latin1' encoding to preserve all byte values when converting string to buffer
          const buffer = Buffer.from(urlOrPath, 'latin1')
          return buffer.toString('base64')
        }
        
        // If it's a local file path, read it
        const fs = await import('fs/promises')
        
        // Validate it's a reasonable file path (not too short)
        if (urlOrPath.length < 3) {
          throw new Error(`Invalid file path: path too short (${urlOrPath.length} chars)`)
        }
        
        // Check if file exists before reading
        try {
          await fs.access(urlOrPath)
        } catch (accessError) {
          throw new Error(`File not found or not accessible: ${urlOrPath}`)
        }
        
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

CRITICAL PRIORITY ORDER:
1. Product visibility and text readability - Select the frame where any product (can, bottle, package, etc.) is most clearly visible with readable text/labels. This is the MOST IMPORTANT factor.
2. Product consistency - Prefer the frame where the product appearance most closely matches the initial reference image (if applicable).
3. Frame stability - Avoid blurry or motion-blurred frames, especially if the blur affects product visibility.
4. Visual composition and clarity - Good framing and overall image quality.
5. Narrative continuity - How well it transitions to the next scene (secondary to product visibility).

Return your response as a JSON object with:
- selectedFrame: 1, 2, or 3 (the index of the best frame)
- reasoning: A brief explanation focusing on product visibility and text readability as the primary selection criteria`

      const userMessage = `Analyze these 3 frames from the end of a video segment. Frame 1 is 1 second from the end, Frame 2 is 0.5 seconds from the end, and Frame 3 is at the very end. 

PRIMARY TASK: Select the frame where any product (can, bottle, package, label, etc.) has the clearest, most readable text and best visibility. Product text readability is the most important factor. Then consider which frame would work best as a starting point for the next video segment while maintaining product consistency.`

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

  private async generateAdStories(
    prompt: string,
    imageUrls: string[],
    duration: number = 24,
    clipCount: number = 4,
    clipDuration: number = 6
  ) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      const systemPrompt = `You are an expert at creating emotionally captivating ad stories for short-form video content. Your goal is to create narratives that deeply resonate with viewers through emotional storytelling techniques.

Generate exactly 1 cohesive story option for a ${duration}-second ad. The story will be broken down into 4 scenes: Hook, Body 1, Body 2, and CTA.

The story must:
- Be a cohesive, complete narrative that flows from Hook → Body 1 → Body 2 → CTA
- Be emotionally captivating and create a strong emotional connection between the viewer and the product/story
- Evoke specific emotions (joy, aspiration, relief, excitement, inspiration, trust, etc.) through relatable moments and emotional triggers
- Use emotional storytelling techniques: create an emotional hook that grabs attention, build emotional investment through the body scenes, and deliver an emotional payoff in the CTA
- Include relatable moments that viewers can connect with on a personal level
- Be related to the initial prompt
- Be suitable for a ${duration}-second ad format
- Include a full paragraph description that captures the entire story arc and emotional journey
- Include a single emoji that best represents the story's theme, mood, and content

EMOTIONAL STORYTELLING REQUIREMENTS:
- Hook: Create an emotional opening that immediately captures attention and establishes an emotional connection (curiosity, surprise, relatability, aspiration)
- Body 1 & 2: Build emotional investment through relatable moments, emotional triggers, or aspirational scenarios that make viewers feel something
- CTA: Deliver an emotional payoff that connects the emotional journey to the product, creating a memorable and compelling call to action

IMPORTANT: 
- The story needs a short, catchy title (4-6 words) that captures the main character's journey or transformation
- The story needs a full paragraph description that describes the complete narrative and emotional arc. This description will be used to generate storyboards later.
- Analyze the story's theme, mood, and content, then select a single Unicode emoji that best represents it. The emoji should be visually distinctive and help users quickly identify the story's character.

Return ONLY valid JSON with this exact structure:
{
  "stories": [
    {
      "id": "story-1",
      "title": "The Busy Professional's Journey",
      "description": "A full paragraph (3-5 sentences) describing the complete story arc from Hook to CTA",
      "emoji": "🎯",
      "hook": "Brief hook description for the opening scene",
      "bodyOne": "Brief body 1 description for the first body scene",
      "bodyTwo": "Brief body 2 description for the second body scene",
      "callToAction": "Brief CTA description for the closing scene"
    }
  ]
}`

      const userPrompt = `Create 1 emotionally captivating ad story based on this prompt: "${prompt}"

${imageUrls.length > 0 ? `Reference images are available to inform the visual style and product details.` : ''}

Focus on creating a story that evokes strong emotions and creates a deep connection with viewers through relatable moments, emotional triggers, and compelling narratives.`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8, // Higher temperature for more creative variety
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI completion response')
      }

      // Parse and validate the response
      let parsed: any
      try {
        parsed = JSON.parse(content)
      } catch (parseError: any) {
        throw new Error(`OpenAI returned invalid JSON: ${parseError.message}`)
      }

      // Validate structure
      if (!parsed.stories || !Array.isArray(parsed.stories)) {
        throw new Error('Response missing stories array')
      }

      if (parsed.stories.length !== 1) {
        throw new Error(`Expected 1 story, got ${parsed.stories.length}`)
      }

      // Validate each story has required fields
      for (const story of parsed.stories) {
        if (!story.description || !story.hook || !story.bodyOne || !story.bodyTwo || !story.callToAction) {
          throw new Error('Story missing required fields (description, hook, bodyOne, bodyTwo, callToAction)')
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(parsed),
          },
        ],
      }
    } catch (error: any) {
      console.error('[OpenAI MCP] generateAdStories error:', error.message)
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

