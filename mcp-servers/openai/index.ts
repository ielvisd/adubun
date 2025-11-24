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
              adType: {
                type: 'string',
                description: 'Type of ad (lifestyle, product, unboxing, testimonial, tutorial, brand_story)',
              },
              context: {
                type: 'object',
                description: 'Additional context for generation',
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
              mood: {
                type: 'string',
                description: 'The emotional tone/mood for the story (e.g., professional, playful, dramatic)',
              },
              adType: {
                type: 'string',
                description: 'Type of ad (lifestyle, product, unboxing, testimonial, tutorial, brand_story)',
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
              (args?.model as string) || 'gpt-4o',
              args?.messages as any,
              args?.response_format as any
            )
          
          case 'parse_prompt':
            return await this.parsePrompt(args?.prompt as string)
          
          case 'plan_storyboard':
            return await this.planStoryboard(
              args?.parsed, 
              args?.duration as number, 
              args?.style as string, 
              (args?.referenceImages as string[]) || [], 
              args?.adType as string | undefined, 
              args?.context
            )
          
          case 'check_storyboard_status':
            return await this.checkStoryboardStatus(args?.jobId as string)
          
          case 'text_to_speech':
            return await this.textToSpeech(
              args?.text as string,
              (args?.voice as string) || 'alloy',
              (args?.model as string) || 'tts-1'
            )
          
          case 'analyze_frames':
            return await this.analyzeFrames(args?.frameUrls as string[])
          
          case 'analyze_reference_images':
            return await this.analyzeReferenceImages(args?.imageUrls as string[])
          
          case 'generate_ad_stories':
            return await this.generateAdStories(
              args?.prompt as string,
              (args?.imageUrls as string[]) || [],
              (args?.duration as number) || 24,
              (args?.clipCount as number) || 4,
              (args?.clipDuration as number) || 6,
              args?.mood as string | undefined,
              args?.adType as string | undefined
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
    
    AD TYPES (for classification):
    - Lifestyle: Product in real-life use
    - Product: Direct product focus, macro shots
    - Unboxing: Packaging, opening, reveal experience
    - Testimonial: User review, authentic, face-to-camera
    - Tutorial: Step-by-step guide, instructional
    - Brand Story: Narrative, values, cinematic

You must return a valid JSON object with exactly these fields:
- product: string (the product or service being advertised)
- targetAudience: string (the target demographic or audience)
- mood: string (the emotional tone or mood)
- keyMessages: array of strings (main messages to convey, at least 2-3 items)
- visualStyle: string (the visual aesthetic or style)
- callToAction: string (what action should viewers take)
- adType: string (inferred ad type if not explicitly stated, one of: lifestyle, product, unboxing, testimonial, tutorial, brand_story)

Return ONLY valid JSON, no other text. Example format:
{
  "product": "Luxury Watch",
  "targetAudience": "Affluent professionals aged 30-50",
  "mood": "Elegant and sophisticated",
  "keyMessages": ["Premium craftsmanship", "Timeless design", "Status symbol"],
  "visualStyle": "Cinematic with gold accents",
  "callToAction": "Visit our website to explore the collection",
  "adType": "product"
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
- characterDescription: (REQUIRED if person/character is visible) A detailed description of any person/character visible in the image(s). Include:
  - Age: Be specific (e.g., "mid-20s", "early 30s", "young adult", "middle-aged"). DO NOT use "teenage" unless the person clearly appears to be 13-19 years old. If uncertain, use "young adult" or estimate based on visible features.
  - Gender: "male", "female", "non-binary", or "unspecified" if not clear
  - Physical appearance: Hair color/style, build, distinctive features, facial features
  - Clothing: Clothing style and colors if visible
  Format: "A [age] [gender] with [physical features], wearing [clothing]"
  Example: "A woman in her mid-20s with long brown hair, average build, wearing casual modern clothing"
  If no person is visible, use empty string "".
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

2. Character Description (if person/character is visible):
   - Analyze the person's age carefully. Look at facial features, skin texture, body proportions, and overall appearance.
   - DO NOT default to "teenage" unless the person clearly appears to be 13-19 years old.
   - Use specific age ranges: "mid-20s", "early 30s", "late 20s", "young adult", "middle-aged", etc.
   - Include physical features: hair color/style, build, distinctive features
   - Include clothing style if visible
   - This character description will be used to generate the story, so accuracy is critical.

3. Suggest enhancements to visual prompts that would better match these images

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
      let parsed: { sceneDescription: string; characterDescription?: string; suggestedEnhancements: string; keyElements: string[]; styleNotes: string }
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
        
        // Validate characterDescription (optional but should be string if present)
        if (parsed.characterDescription !== undefined && typeof parsed.characterDescription !== 'string') {
          throw new Error('characterDescription must be a string if provided')
        }
      } catch (parseError: any) {
        console.error('[OpenAI MCP] Invalid JSON response from analyze_reference_images:', content)
        throw new Error(`OpenAI returned invalid response: ${parseError.message}`)
      }

      // Log character description if found
      if (parsed.characterDescription) {
        console.error(`[OpenAI MCP] Character description extracted: ${parsed.characterDescription}`)
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sceneDescription: parsed.sceneDescription,
              characterDescription: parsed.characterDescription || '',
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

  private async planStoryboard(parsed: any, duration: number, style: string, referenceImages: string[] = [], adType?: string, context?: any) {
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
    this.processStoryboardAsync(jobId, parsed, duration, style, referenceImages, adType, context).catch((error) => {
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

  private async processStoryboardAsync(jobId: string, parsed: any, duration: number, style: string, referenceImages: string[] = [], adType?: string, context?: any) {
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
        const characterDescription = analysisContent.characterDescription || ''
        
        console.error(`[OpenAI MCP] Reference image analysis completed:`)
        console.error(`[OpenAI MCP] Scene description: ${sceneDescription}`)
        console.error(`[OpenAI MCP] Character description: ${characterDescription}`)
        console.error(`[OpenAI MCP] Key elements: ${analysisContent.keyElements?.join(', ')}`)
        console.error(`[OpenAI MCP] Style notes: ${analysisContent.styleNotes}`)
        console.error(`[OpenAI MCP] Suggested enhancements: ${imageEnhancements}`)
        
        // Store sceneDescription and characterDescription for use in system prompt
        imageAnalysis.sceneDescription = sceneDescription
        imageAnalysis.characterDescription = characterDescription
      } catch (error: any) {
        console.error(`[OpenAI MCP] Failed to analyze reference images: ${error.message}`)
        if (error.stack) {
          console.error(`[OpenAI MCP] Error stack: ${error.stack}`)
        }
        console.error(`[OpenAI MCP] Continuing without image-based enhancements`)
        
        // Set defaults so storyboard generation can continue
        imageAnalysis = {
          sceneDescription: '', // Empty - will skip reference image requirements
          characterDescription: '', // Empty - no character info available
          suggestedEnhancements: '',
          keyElements: [],
          styleNotes: '',
        }
        imageEnhancements = ''
        // Continue without enhancements if analysis fails
      }
    }
    
    // Extract sceneDescription and characterDescription if available
    const sceneDescription = imageAnalysis?.sceneDescription || ''
    const characterDescription = imageAnalysis?.characterDescription || ''
    
    // Build ad-type specific instructions
    let adTypeInstruction = ''
    if (adType) {
      switch (adType) {
        case 'lifestyle':
          adTypeInstruction = `
AD TYPE: LIFESTYLE AD
- Focus on the product being used in real-life situations
- Emphasize social context, environment, and benefits
- Show human interaction and emotional connection with the product
- Visuals should feel authentic and aspirational
`
          break
        case 'product':
          adTypeInstruction = `
AD TYPE: PRODUCT FOCUS AD
- CRITICAL: The product must be the main focus in 100% of frames
- Use macro shots, close-ups, and slow pans to show details
- Minimal distractions in the background (bokeh, clean studio, or simple setting)
- Highlight craftsmanship, materials, and design features
- Lighting should be studio-quality to showcase the product best
`
          break
        case 'unboxing':
          adTypeInstruction = `
AD TYPE: UNBOXING EXPERIENCE
- Scene Structure:
  1. Hook: Sealed box/packaging on a surface or being held
  2. Body 1: Hands opening the box/packaging (anticipation)
  3. Body 2: The reveal/first look of the product inside
  4. CTA: The product fully removed and displayed with accessories
- Focus on the tactile experience and packaging details
`
          break
        case 'testimonial':
          adTypeInstruction = `
AD TYPE: TESTIMONIAL / USER REVIEW
- Visual style: "Selfie-style" or authentic interview camera angles
- Focus on facial expressions and genuine emotion
- Show the person holding or using the product while talking
- Alternating between "talking head" shots and B-roll of product usage
- The vibe should be trustworthy and personal
`
          break
        case 'tutorial':
          adTypeInstruction = `
AD TYPE: TUTORIAL / HOW-TO
- Scene Structure:
  1. Hook: The problem or "before" state
  2. Body 1: Step 1 of usage (clear action)
  3. Body 2: Step 2/3 of usage (clear action)
  4. CTA: The result or "after" state
- Visuals must be instructional and clear
- Focus on hands performing actions with the product
`
          break
        case 'brand_story':
          adTypeInstruction = `
AD TYPE: BRAND STORY
- Cinematic, narrative-driven approach
- Focus on values, origin, and atmosphere rather than direct selling
- Use wider shots, atmospheric lighting, and emotional storytelling
- Connect the brand values to the viewer's identity
`
          break
        case 'luxury':
          adTypeInstruction = `
AD TYPE: LUXURY/CINEMATIC AD STRATEGY
- CRITICAL: NO HUMANS in any frame - pure product and nature cinematography
- Epic, cinematic camera work: aerial shots, diving cameras, sweeping crane movements
- Product as the sole protagonist in a grand natural narrative
- Dramatic natural environments: waterfalls, mountains, oceans, forests, dramatic weather
- Atmospheric effects: mist, smoke in water, light rays, water splashes, slow motion
- Product integration with raw materials: wood grains, water droplets, stone textures, botanical elements
- Camera movements:
  * Aerial establishing shots (bird's eye view diving down)
  * Underwater cinematography (product submerged, bubbles, light refraction)
  * Slow dolly pushes into product details
  * Sweeping crane shots around product
  * Smooth transitions between elements and product
- Lighting: Dramatic, moody, often with single light source, high contrast, natural light (sun rays, golden hour)
- Color palette: Monochromatic or limited (blues, blacks, deep greens, golds, earth tones)
- Visual storytelling structure: Nature → Essence → Ingredients → Product
- Emphasize: Scale, grandeur, premium quality, natural power, transformation
- Slow motion sequences to emphasize beauty and drama (water drops, smoke trails, falling petals)
- Each shot should feel like high-end luxury commercial cinematography (Dior, Chanel, Rolex level)
- Product reveal should be dramatic and hero-shot worthy
`
          break
      }
    }

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
    
    // Use context.systemPrompt if available (passed from generate-storyboards), otherwise build it
    let systemPrompt = context?.systemPrompt
    
    if (!systemPrompt) {
      // Default to 16-second format if duration is 16 or not specified
      const is16SecondFormat = !duration || duration === 16
      
      // Build common instructions that apply to both formats
      const commonInstructions = `
Each segment needs:
- type: "hook" | "body" | "cta"
- description: Shot description
- startTime: number (seconds)
- endTime: number (seconds)
- visualPrompt: Detailed, specific prompt for video generation (this will be the primary/default prompt).

🚨 VEO 3.1 PROMPTING FORMULA:
For the 'visualPrompt' field, you MUST use this specific 5-part structure for EVERY scene:
[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]

Definitions:
- Cinematography: Camera work, shot composition, movement. Use advanced techniques: dolly shot, tracking shot, crane shot, aerial view, slow pan, POV shot, wide shot, close-up, extreme close-up, low angle, two-shot, shallow depth of field, wide-angle lens, soft focus, macro lens, deep focus
- Subject: Main character or focal point (e.g., "a young woman", "a sleek product bottle")
- Action: What the subject is doing (e.g., "walking briskly", "catching the light")
- Context: Environment and background (e.g., "in a busy city street", "on a wooden table")
- Style & Ambiance: Aesthetic, mood, lighting (e.g., "cinematic lighting", "warm golden hour glow")

🚨 VEO 3.1 CAPABILITIES:
- Variable clip length: 4, 6, or 8 seconds
- Rich audio & dialogue: Generate realistic, synchronized sound, from multi-person conversations to precisely timed sound effects
- Timestamp prompting: Use [00:00-00:02] format for precise action timing
- Sound effects: Use "SFX: [description]" (e.g., "SFX: thunder cracks in the distance")
- Ambient noise: Use "Ambient noise: [description]" (e.g., "Ambient noise: the quiet hum of a starship bridge")
- Dialogue: Use quotation marks for specific speech (e.g., A woman says, "We have to leave now.")

🚨 TIMECODE & AUDIO REQUIREMENTS:
- Veo 3.1 supports native audio generation with rich audio & dialogue capabilities. You MUST include audio cues within the visualPrompt if applicable.
- **Timestamp prompting**: Use precise timecodes for actions: "[00:00-00:02] The woman smiles. [00:02-00:04] She turns to the camera." This allows you to direct complete sequences with precise cinematic pacing.
- For DIALOGUE:
  - If a character speaks, write it explicitly with quotation marks: 'The man says: "Hello, world."'
  - Use ellipses (...) for natural pauses.
  - Include audio actions: "(laughs)", "(sighs)", "(claps)".
  - **CRITICAL: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.**
- For SOUND EFFECTS (SFX): Describe sounds with clarity: "SFX: thunder cracks in the distance", "SFX: door creaks open"
- For AMBIENT NOISE: Define the background soundscape: "Ambient noise: the quiet hum of a starship bridge", "Ambient noise: distant city traffic"
- Audio inputs are strictly ignored by the video model, so all audio intent must be in the prompt text.

  Must include:
  * Specific camera angles and movements (close-up, wide shot, pan, zoom, etc.)
  * Lighting details (soft natural light, studio lighting, etc.)
  * Composition and framing details
  * Realistic, natural actions and movements
  * Product placement and holding details (characters hold products and talk about them, never using them)
  * Background and setting specifics
  * Avoid abstract or unrealistic descriptions - focus on professional, realistic product showcase
  * EMOTIONAL VISUAL STORYTELLING: Include details that create emotional impact - facial expressions, body language, visual mood, and emotional atmosphere that connects with viewers
  * PEOPLE COUNT LIMITATION: Limit scenes to 3-4 people maximum. Prefer smaller groups (1-3 people) when possible for better face quality. Avoid large groups, crowds, or more than 4 people in any scene
  * FACE QUALITY: Use close-ups and medium shots to ensure clear, sharp faces. Emphasize "sharp faces, clear facial features, detailed faces, professional portrait quality" in prompts. Avoid scenes with many people that could result in blurry or distorted faces
  * **🚨🚨🚨 CRITICAL BODY PROPORTIONS - ABSOLUTE MANDATORY REQUIREMENT 🚨🚨🚨**: ALL characters in visual prompts MUST have CORRECT body proportions and standard human anatomy. Each character must have EXACTLY: two hands (one left, one right), two arms (one left, one right), two legs, and one head. All body parts must be properly proportioned, naturally sized, and correctly positioned. ABSOLUTELY DO NOT describe or generate: ❌ Multiple limbs (NO extra arms, NO extra legs, NO more than 2 arms, NO more than 2 legs, NO duplicate limbs), ❌ Disproportionate body parts (NO huge arms, NO oversized hands, NO abnormally large limbs, NO tiny arms, NO disproportionate body parts), ❌ Anatomical deformities (NO deformed anatomy, NO abnormal proportions, NO malformed limbs, NO incorrect body structure). MUST describe: ✅ Exactly 2 arms (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 hands (one left, one right) - properly proportioned and naturally sized, ✅ Exactly 2 legs - properly proportioned and naturally sized, ✅ All body parts in correct proportions relative to the character's body size, ✅ Natural, realistic human anatomy with standard body proportions. This is a MANDATORY requirement - any visual prompt describing multiple limbs, disproportionate body parts, or anatomical deformities will be REJECTED.
  * **🚨🚨🚨 CRITICAL: CHARACTER AND PRODUCT VISIBILITY (MANDATORY)**: Both the main character AND the product (if a product is part of the story) MUST be VISIBLE in ALL frames and segments. The character must be visible even when focusing on products, and the product must be visible even when focusing on the character. Both must appear together in the same frame. DO NOT create frames that show only the character without the product, or only the product without the character. This is a MANDATORY requirement - both character and product must be visible in EVERY frame.
  * CRITICAL: For story continuity - Each segment must logically flow from the previous segment:
    - Hook segment: ${sceneDescription ? `🚨 MANDATORY: MUST start with exactly what is shown in the reference image: "${sceneDescription}". The visualPrompt MUST begin by describing this exact scene. Example: If sceneDescription is "a man wearing a watch on his wrist", the prompt must start with "Close-up/Medium/Wide shot of a man wearing a watch on his wrist..." NOT "watch on table" or any other variation.` : 'Establish the scene, character, or action. For 16-second format: Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End on peak of emotion/action (mini-resolve).'}
    - Body segment(s): 🚨🚨🚨 ABSOLUTE REQUIREMENT: Create ZERO cuts, ZERO transitions, ZERO edits. Each segment must flow as a CONTINUOUS story with NO cuts, NO jumps, NO scene changes, NO transitions, NO edits. Use language like "continuing seamlessly", "the same moment flows", "without interruption", "continuous action", "unbroken flow". Avoid any language suggesting scene changes, cuts, transitions, or edits. The story should feel like ONE continuous unbroken shot, not multiple scenes. VEO must generate this as a single continuous shot without any cuts or transitions. For 16-second format: Camera continues moving (match energy of hook). Product enters magically or talent holds it and talks about it in real-time. Character holds the product and discusses it, never actually using it. Slow-motion reveal at 4-5s of this clip. End on mini-resolve.
    - CTA segment: Build to a natural conclusion that showcases the product, continuing seamlessly from the body segment(s) with NO visual breaks, NO cuts, NO transitions, NO edits, NO scene changes. Maintain the same camera perspective, same environment, same moment in time flowing forward. 🚨🚨🚨 ABSOLUTE REQUIREMENT: This must be ONE unbroken continuous shot with ZERO cuts, ZERO transitions, ZERO edits. VEO must generate this as a single continuous shot. For 16-second format: The CTA segment MUST have TWO distinct frames - a starting frame (same as body's last frame) and a visually DISTINCT ending frame. The ending frame should be a hero shot with: Freeze on perfect product/after state, text overlay with tagline, logo lockup visible, static or very slow push camera movement. The visualPrompt MUST explicitly describe the hero shot composition, text overlay placement, and logo lockup. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. CRITICAL: The ending frame must be visually different from the starting frame - use different camera angle, composition, or add text/logo overlay to create distinct visual progression.
  * 🚨🚨🚨 ABSOLUTE REQUIREMENT: Each segment must be ONE unbroken continuous shot with ZERO cuts, ZERO transitions, ZERO edits, ZERO scene changes. Each segment must feel like a natural continuation of the previous segment with NO visual breaks, NO cuts, NO transitions, NO edits, NO scene changes. Maintain the same camera perspective, same environment, same moment in time flowing forward. VEO must generate each segment as a single continuous shot without any cuts or transitions.
  * Create a cohesive narrative arc where each segment feels like a natural continuation, not an abrupt change
  * 🚨🚨🚨 NO MIRRORS/REFLECTIONS - ABSOLUTE MANDATORY REQUIREMENT: DO NOT use mirrors, reflections, or stories about people looking at their reflection. DO NOT include mirrors in visual prompts. DO NOT generate images with mirrors visible. Avoid any scenes involving mirrors or reflective surfaces. The visualPrompt MUST explicitly avoid any mention of mirrors, reflections, or reflective surfaces. Generated images must NOT show mirrors or reflections. This is a HARD REQUIREMENT - any visual prompt or generated image containing mirrors will be rejected.
  * **CRITICAL: NO CHILDREN**: DO NOT include children in any scenes. No children visible in any part of the storyboard. All characters must be adults.
  * **CRITICAL: NO ELECTRONIC DEVICES**: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the storyboard will be rejected.
  * **CRITICAL: MINIMAL BACKGROUND**: Keep scenes clean and focused. Avoid cluttered backgrounds with lots of objects, furniture, or visual distractions. Minimize background elements to keep focus on the product and characters. Simple, uncluttered environments work best. Use shallow depth of field or selective focus to blur background distractions when needed.
  * **CRITICAL: SIMPLE TASKS**: Keep tasks simple and achievable within the segment duration. Each segment should show ONE simple action that moves the story forward, not complex multi-step tasks. For example, instead of "clearing a table" (too complex for 6 seconds), show "picking up one item" or "placing one object". Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate.
  * **CRITICAL: ONE PRODUCT ONLY**: Each scene must contain ONLY ONE product. Do NOT include multiple products, product variations, or different product models in the same scene. If the product is a robot, there should be only ONE robot. If the product is a bottle, there should be only ONE bottle. Multiple products in a scene will cause visual confusion and inconsistency. Examples to avoid: ❌ "two robots", ❌ "multiple bottles", ❌ "several products". Instead use: ✅ "one robot", ✅ "a single bottle", ✅ "the product".
  * **CRITICAL: ONE CHARACTER SPEAKING**: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.
  * **🚨🚨🚨 CRITICAL: NATURAL PROGRESSION - DIFFERENT POSES/ACTIONS (MANDATORY)**: Each segment must show a DIFFERENT pose and/or action from the previous segment while maintaining character and product consistency. The visual prompts must describe:
    - Different character poses (different standing/sitting positions, different gestures, different facial expressions, different body orientations)
    - Different actions (character performing different activities, product being used in different ways, evolving story progression)
    - Progressive story flow (each segment should advance the narrative with new actions, not repeat the same pose/action)
    - Visual composition changes (different camera angles, different framing, different focal points while maintaining same background)
  Examples: ✅ Hook: "character standing, looking frustrated" → Body: "character sitting, applying product" → CTA: "character standing, smiling, holding product" (different poses AND actions). ❌ Hook: "character standing, holding product" → Body: "character standing, holding product" → CTA: "character standing, holding product" (same pose - REJECTED). The story must progress with evolving poses and actions across segments.
  * ${sceneDescription ? `🚨 CRITICAL REMINDER: The hook segment visualPrompt MUST start with "${sceneDescription}". This is non-negotiable. Before finalizing your response, verify that the hook segment visualPrompt begins with this exact scene description.` : ''}
  * 🚨 CHARACTER CONSISTENCY: Extract ALL characters from the hook segment and maintain their EXACT appearance across ALL segments:
    - In hook segment: Include explicit character descriptions with gender, age, physical features (hair color/style, build), and clothing
    - In body and CTA segments: Use phrases like "the same [age] [gender] person with [features]" or "continuing with the identical character appearance"
    - CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
    - Do NOT change character gender, age, or physical appearance between scenes
    - Example: If hook describes "a teenage boy with brown hair", body segments must reference "the same teenage boy with brown hair", not "a teen" or "a young person"
    - **🚨🚨🚨 CRITICAL: PRODUCT HAND CONSISTENCY (MANDATORY)**: If a character holds a product in their hand (left or right), they MUST keep it in the SAME hand across ALL segments to maintain continuity. Do NOT switch hands between segments. If the product is in the left hand in the hook segment, it must remain in the left hand in the body and CTA segments. If the product is in the right hand in the hook segment, it must remain in the right hand in the body and CTA segments. This applies to ALL products (bottles, serums, makeup, containers, items, etc.). The visualPrompt MUST explicitly state which hand holds the product and maintain this consistency across all segments. Example: If hook segment shows "the character holds the product bottle in her left hand", then body and CTA segments must also show "the same character holds the product bottle in her left hand" (NOT right hand).
    - **🚨🚨🚨 CRITICAL: BACKGROUND/SCENE CONSISTENCY (MANDATORY)**: Maintain the EXACT same background, environment, and setting across ALL frames and segments. Do NOT change scenes, backgrounds, or environments between segments. The same room, same location, same background elements must appear consistently. Only camera angles, character poses, and product positions may change - the background/scene must remain identical. If the hook segment is in a bathroom, ALL segments (body and CTA) must be in the SAME bathroom with the SAME background elements. If the hook segment is in a kitchen, ALL segments must be in the SAME kitchen. The visualPrompt MUST explicitly maintain the same background/environment description across all segments. Example: If hook segment shows "in a clean bathroom with white sink", then body and CTA segments must also show "in the same clean bathroom with white sink" (NOT a different room or different background).
    - **🚨🚨🚨 CRITICAL: FOREGROUND CONSISTENCY (MANDATORY)**: Maintain the EXACT same foreground elements (characters, products, objects) across ALL scenes/videos. The same character with identical appearance, clothing, and physical features must appear in the same position and state. The same product must appear with identical design, color, and placement. Only camera angles, poses, and compositions may change - foreground elements must remain pixel-perfect consistent. Characters must maintain the EXACT same clothing (same shirt, same pants, same colors, same style), EXACT same physical features (same hair, same build, same facial features), and EXACT same product appearance (same design, same color, same size) across ALL segments. Do NOT change character clothing, physical features, or product appearance between segments. The visualPrompt MUST explicitly maintain the same foreground elements description across all segments. Example: If hook segment shows "a young woman with long brown hair wearing a white shirt holding a blue serum bottle", then body and CTA segments must also show "the same young woman with long brown hair wearing a white shirt holding the same blue serum bottle" (NOT different hair, different shirt, or different product).
- visualPromptAlternatives: Array of 3-5 alternative visual prompts for this segment. Each alternative should:
  * Follow the 5-part formula: [Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]
  * Offer a different creative approach (different camera angle, lighting, composition, or perspective)
  * Maintain the same core message and product focus
  * Be equally detailed and specific as the primary visualPrompt
  * Provide variety in visual style while staying true to the segment's purpose
  * Maintain story continuity with previous segments (for body and CTA segments)
  * ${sceneDescription ? `🚨 CRITICAL: For the hook segment, ALL alternative prompts MUST also start with the same sceneDescription: "${sceneDescription}". They can vary camera angle (close-up, wide, overhead, side), lighting (soft, dramatic, natural, studio), composition, or perspective, but the product placement and scene must match the reference image. DO NOT create alternatives that change the product placement (e.g., from "wearing on wrist" to "on table" or "in case") - these are different scenes, not alternatives. Example: If sceneDescription is "a man wearing a watch on his wrist", all alternatives must show "person/man wearing watch on wrist", not "watch on table" or "watch in case".` : ''}
- audioNotes: Format as "Dialogue: [character name/description] in a warm, confident voice with an American accent says: '[actual script text]'" OR "Voiceover: [actual script text to be spoken by off-screen narrator]" OR "Music: [description of music/sound effects]". 
  
  🚨 CRITICAL VOICE CONSISTENCY: The hook scene MUST establish the voice description "in a warm, confident voice with an American accent". ALL subsequent scenes (body, CTA) MUST use the EXACT SAME voice description to ensure voice consistency across all scenes. 
  
  🚨 CRITICAL: ONLY generate dialogue in audioNotes if the user has explicitly provided dialogue text. If no dialogue is provided by the user, set audioNotes to an empty string (""). DO NOT auto-generate dialogue based on the story content. Only include dialogue when the user has explicitly specified it.
  
  🚨🚨🚨 CRITICAL CTA DIALOGUE WORD LIMIT - ABSOLUTE MANDATORY (ZERO TOLERANCE) 🚨🚨🚨
  For CTA segments specifically, any dialogue MUST be EXACTLY 5 words or less. This is a HARD REQUIREMENT with ZERO TOLERANCE. You MUST NEVER generate CTA dialogue with more than 5 words. 
  
  Before including any dialogue in a CTA segment's audioNotes field, you MUST:
    1. FIRST, count the words in your intended dialogue text BEFORE writing it - count each word carefully, one by one
    2. If your intended dialogue exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it - take only the first 5 words
    3. Generate ONLY dialogue that is 5 words or less - do NOT generate dialogue and then truncate it
    4. Examples of VALID CTA dialogue: 
       ✅ "Buy now to transform." (5 words)
       ✅ "Shop now and save." (4 words)
       ✅ "Get yours today." (3 words)
       ✅ "Transform your life now." (5 words)
    5. Examples of INVALID dialogue you MUST NOT generate: 
       ❌ "Purchase now to enjoy 60% off." (6 words - FORBIDDEN - DO NOT GENERATE THIS)
       ❌ "Purchase now to transform your skin." (7 words - FORBIDDEN - DO NOT GENERATE THIS)
       ❌ "Buy now to transform your skin overnight!" (8 words - FORBIDDEN - DO NOT GENERATE THIS)
       ❌ "Shop now and save big today!" (6 words - FORBIDDEN - DO NOT GENERATE THIS)
       ✅ Instead, use: "Purchase now to transform." (5 words - VALID) or "Buy now to transform." (5 words - VALID)
    6. CRITICAL: If the user provides dialogue that exceeds 5 words, you MUST shorten it to 5 words or less BEFORE including it. Take only the first 5 words. Do NOT include the original long dialogue. For example, if user provides "Purchase now to transform your skin." (7 words), you MUST use only "Purchase now to transform." (5 words).
    7. COUNT WORDS BEFORE WRITING: Always count words BEFORE you write the dialogue in audioNotes. Do not write dialogue first and then count - count first, then write only if it's 5 words or less.
  - This requirement applies ONLY to CTA segments. Any CTA dialogue exceeding 5 words will cause the storyboard to be REJECTED and the entire response will be regenerated. You MUST count words BEFORE generating CTA dialogue, not after. If you generate dialogue with more than 5 words, the ENTIRE storyboard will be rejected.
  
  🚨🚨🚨 CRITICAL: DIALOGUE REQUIREMENT - MANDATORY FOR ALL SCENES (NO EXCEPTIONS) 🚨🚨🚨:
  - **MANDATORY DIALOGUE**: EVERY scene (hook, body, CTA) MUST include character dialogue in the audioNotes field. NO EXCEPTIONS - dialogue is required for ALL scenes, including product reveals and transitions. No scene should be silent.
  - **DIALOGUE FORMAT**: Use "Dialogue: [character] in a warm, confident voice with an American accent says: '[text]'" format (e.g., "Dialogue: The woman in a warm, confident voice with an American accent says: 'How am I going to finish all of this?'")
  - **CRITICAL VOICE CONSISTENCY**: The hook scene MUST establish the voice description "in a warm, confident voice with an American accent". ALL subsequent scenes (body, CTA) MUST use the EXACT SAME voice description to ensure voice consistency across all scenes.
  - **VOICEOVER**: Use only for off-screen narration if absolutely necessary. Format: "Voiceover: [text]" (e.g., "Voiceover: Discover the luxury watch collection...")
  - **PREFER DIALOGUE**: For most ads, use Dialogue format so characters speak on-camera. Only use Voiceover if explicitly needed for off-screen narration.
  - **CRITICAL**: If the user has not provided dialogue, you MUST generate appropriate dialogue for each scene that matches the story content and scene purpose. Dialogue should:
    * Hook scene: Introduce the problem or situation
    * Body scene(s): Develop the story, show product interaction
    * CTA scene: Conclude with call to action (5 words or less for CTA)
  - **NO SILENT SCENES**: Every scene must have dialogue. If a scene would naturally be silent, add dialogue that fits the context (e.g., character thinking aloud, reacting, or speaking to themselves).
  
  🚨 CRITICAL: If you use Dialogue format, you MUST update the visualPrompt to show the character speaking:
  - Add timecodes showing when dialogue occurs: "[00:00-00:04] The woman speaks: 'How am I going to finish all of this?'"
  - Describe the character's mouth movement and speaking gesture in the visualPrompt
  - Ensure the character is shown speaking on-camera, not just reacting
  
  CORRECT examples:
  - "Dialogue: The woman in a warm, confident voice with an American accent says: 'How am I going to finish all of this?'"
  - "Dialogue: The young woman in a warm, confident voice with an American accent says: 'Are you going to help me with this?' (slight laugh)"
  - "Dialogue: The same woman in a warm, confident voice with an American accent says: 'Finally, a little balance in my life.'"
  - "Music: Upbeat electronic music. Dialogue: The man in a warm, confident voice with an American accent says: 'This changes everything.'"
  
  INCORRECT examples (DO NOT USE):
  - "Voiceover: A narrator describes the product features" (this is a description, not script)
  - "Voiceover: The voiceover explains the benefits" (this is a description, not script)
  - "A professional voiceover discusses the product" (this is a description, not script)
  - "Dialogue: The woman thinks about her problems" (this is not dialogue, it's a thought)
  
  If there's both music and dialogue/voiceover, format as: "Music: [description]. Dialogue: [character] in a warm, confident voice with an American accent says: '[text]'" OR "Music: [description]. Voiceover: [text]"
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
${characterDescription ? `
🚨 REFERENCE IMAGE CHARACTER (MANDATORY):
The reference images show: "${characterDescription}"

CRITICAL: You MUST use this EXACT character description for ALL segments. Do NOT use generic terms like "teenage", "young person", or "a person". Use the specific character details from the reference images.

Hook segment visualPrompt: MUST start with or include: "${characterDescription}"
Body and CTA segment visualPrompts: MUST reference "the same ${characterDescription}" or "continuing with ${characterDescription}"

DO NOT:
- Use "teenage", "teen", "late teens", or any teen-related terms UNLESS the character description explicitly says "teenage" (which should never happen if reference images show an adult)
- Use vague age terms - ALWAYS use the specific age from character description (e.g., "mid-20s", "early 30s", "young adult")
- Change the character's age, appearance, or gender between segments
- Use generic terms like "a person", "someone", "a young person", or "a teen" - always use the specific character description from reference images

Example: If characterDescription is "A woman in her mid-20s with long brown hair, average build, wearing casual modern clothing", then:
✅ CORRECT: "A woman in her mid-20s with long brown hair, average build, wearing casual modern clothing, holding the product..."
✅ CORRECT: "The same woman in her mid-20s with long brown hair continues..."
❌ WRONG: "A teenage girl..." (WRONG - character is mid-20s, not teenage)
❌ WRONG: "A young person..." (WRONG - too vague, use specific age)
❌ WRONG: "A person..." (WRONG - use specific character description)
` : `
- Extract ALL characters mentioned in the hook segment and maintain their EXACT appearance across ALL segments
- For each character, identify and maintain: gender (male/female/non-binary), age (be specific: "mid-20s", "early 30s", "young adult", etc. - DO NOT default to "teenage" unless clearly 13-19 years old), physical features (hair color/style, build, distinctive features), and clothing style
- Hook segment visualPrompt: MUST include explicit character descriptions (e.g., "a woman in her mid-20s with [hair color] hair, [build], wearing [clothing]")
- Body and CTA segment visualPrompts: MUST reference characters as "the same [age] [gender] person with [features]" or "continuing with the identical character appearance"
- CRITICAL: Characters must maintain the SAME gender, age, physical features, and clothing style across ALL segments
- Do NOT use vague terms like "a teen" or "a person" in later segments - always reference the specific character description from the hook
- Do NOT change character gender, age, or physical appearance between scenes
- Do NOT default to "teenage" - use specific age ranges based on visible features
- Example: If hook describes "a woman in her mid-20s with brown hair", body segments must reference "the same woman in her mid-20s with brown hair", not generic terms
`}

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

      if (is16SecondFormat) {
        systemPrompt = `${referenceImageSection}Create a video storyboard for a 16-second "Lego Block" format ad with exactly 3 segments. 
    
    ${adTypeInstruction}

    🚨 REQUIRED SEGMENT STRUCTURE (16-Second Format):
You MUST create exactly 3 segments with the following structure:
- 1 hook segment (0-6s, required) - Attention-grabbing opening. Can be problem-focused (frustrated face, spilled coffee, sweaty gym guy) or any compelling opening. Start extreme close-up or compelling angle. Camera slowly pushes in or circles while action/problem escalates. End clip on the peak of emotion/action. Single continuous shot with ZERO cuts.
- 1 body segment (6-12s, required) - Product introduction + transformation. One continuous shot delivering the "oh shit" moment. Camera continues moving (match the energy of clip 1), product enters frame magically or talent uses it in real-time → instant before/after inside the shot. Slow-motion reveal at second 4-5 of this clip (around 10-11s total timeline). Single continuous shot with ZERO cuts.
- 1 CTA segment (12-16s, required) - Hero shot + CTA + logo lockup. Static or very slow push. Freeze on perfect product/after state. Text + logo slam in. One punchy tagline (spoken or on-screen). Ends exactly at 16.000s. Single continuous shot with ZERO cuts.

🚨 CINEMATIC FLOW REQUIREMENTS:
- CAMERA MOMENTUM MATCHING: Match camera momentum across cuts. If clip 1 ends pushing in, clip 2 should start already pushing or whip from the motion. Maintain energy flow between segments.
- COLOR GRADING: Color-grade all clips identically before sequencing for visual consistency.
- MINI-RESOLVE ENDINGS: End every clip on a "mini-resolve" (beat drop, head turn, smile, product glint) so even if someone watches only the first 4-8s it still feels complete.
- ZERO CUTS: Each segment must be a SINGLE CONTINUOUS SHOT with ZERO cuts inside the clip. No scene changes, no transitions, no cuts within the segment.
- NO MIRRORS/REFLECTIONS: DO NOT use mirrors, reflections, or stories about people looking at their reflection. Avoid any scenes involving mirrors or reflective surfaces.

The storyboard MUST include all three types: hook, body, and CTA. Do not create a storyboard with only one segment.${commonInstructions}`
      } else {
        // Legacy 24-second format (4 segments) - kept for backward compatibility
        systemPrompt = `${referenceImageSection}Create a video storyboard with 3-5 segments. 
    
    ${adTypeInstruction}

    🚨 REQUIRED SEGMENT STRUCTURE:
You MUST create at least 3 segments with the following structure:
- 1 hook segment (required) - Establishes the scene, character, or action
- 1-3 body segments (at least 1 required) - Continues the story from the hook
- 1 CTA segment (required) - Builds to a natural conclusion showcasing the product

The storyboard MUST include all three types: hook, body, and CTA. Do not create a storyboard with only one segment.${commonInstructions}`
      }
    }

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
    clipCount: number = 3,
    clipDuration: number = 6,
    mood?: string,
    adType?: string
  ) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }

      // Detect if product is a robot/humanoid based on prompt
      const detectRobotProduct = (prompt: string): boolean => {
        const promptLower = prompt.toLowerCase()
        const robotKeywords = ['robot', 'humanoid', 'unitree', 'g1', 'robotic', 'android', 'automaton', 'mechanical assistant', 'ai robot']
        return robotKeywords.some(keyword => promptLower.includes(keyword))
      }
      
      const productIsRobot = detectRobotProduct(prompt)
      console.log(`[Generate Stories] Product is robot: ${productIsRobot}`)

      // Build ad-type-specific narrative guidance
      let adTypeGuidance = ''
      if (adType) {
        switch (adType) {
          case 'lifestyle':
            adTypeGuidance = `
AD TYPE: LIFESTYLE AD NARRATIVE
- Story should focus on people using the product in real-life situations
- Emphasize social benefits, relationships, and everyday experiences
- Show how the product fits into and enhances the user's lifestyle
- Focus on emotional benefits and aspirational living
- Hook: Relatable everyday situation or desire
- Body: Product enhancing real-life moments
- CTA: How product transforms lifestyle`
            break
          case 'product':
            adTypeGuidance = `
AD TYPE: PRODUCT-FOCUSED AD NARRATIVE
- Story should center entirely on the product itself
- CRITICAL: NO HUMANS allowed in this ad type - pure product focus only
- Emphasize product features, craftsmanship, materials, and quality
- The product is the only subject - no people, no hands, no human interaction
- Focus on what makes the product special, unique, and desirable
- Hook: Product reveal or standout feature showcase
- Body: Showcase key features, details, textures, and craftsmanship
- CTA: Product benefits, quality, and call to purchase
- Visual focus: Close-ups, macro shots, 360° views, material details`
            break
          case 'unboxing':
            adTypeGuidance = `
AD TYPE: UNBOXING AD NARRATIVE
- Story MUST follow a reveal structure: anticipation → opening → reveal → satisfaction
- Hook: Show sealed packaging, build anticipation
- Body: Opening the package and revealing the product (ONE action)
- CTA: Product displayed with all accessories, satisfaction moment
- Focus on the tactile, sensory experience of unboxing`
            break
          case 'testimonial':
            adTypeGuidance = `
AD TYPE: TESTIMONIAL AD NARRATIVE
- Story should be from the user's authentic point of view
- Emphasize real problems solved and genuine experiences
- Structure: Problem → Discovery → Solution → Recommendation
- Hook: User shares their problem/need
- Body: How they found and tried the product
- CTA: Their recommendation and transformation
- Tone should feel personal, authentic, and trustworthy`
            break
          case 'tutorial':
            adTypeGuidance = `
AD TYPE: TUTORIAL/HOW-TO AD NARRATIVE
- Story MUST follow an instructional structure: problem → action → result
- Hook: Present the problem or challenge clearly
- Body: ONE key action demonstrating how to use the product (single action)
- CTA: Show the final result/benefit achieved
- Focus on clarity, actionable steps, and practical value
- The body should show ONE clear action, not multiple steps`
            break
          case 'brand_story':
            adTypeGuidance = `
AD TYPE: BRAND STORY AD NARRATIVE
- Story should focus on brand values, mission, and origin
- Emphasize the "why" behind the brand, not just what it sells
- Create an emotional connection to the brand's purpose
- Hook: Brand's origin story or core value
- Body: How brand lives its mission
- CTA: Invite viewers to be part of the brand's journey
- Cinematic, aspirational, and value-driven narrative`
            break
          case 'luxury':
            adTypeGuidance = `
AD TYPE: LUXURY/CINEMATIC AD NARRATIVE
- Epic, cinematic storytelling connecting product to nature and elements
- CRITICAL: NO HUMANS in this narrative - product is the sole protagonist in a grand, dramatic story
- Story structure: Epic environment → Product integration → Product hero shot
- Hook: Establish epic natural environment (waterfalls, mountains, oceans, dramatic landscapes)
- Body: Product integrated with natural elements in ONE transformative moment (water, mist, smoke, atmospheric effects)
- CTA: Product reveal as the hero, brand name overlay, powerful tagline
- Tone: Aspirational, powerful, premium, awe-inspiring
- Focus on transformation, purity, and natural power
- The product embodies the essence of natural elements
- Visual narrative: Nature → Essence → Product
- No people, no hands - pure product and nature cinematography`
            break
        }
      }

      const systemPrompt = `You are an expert at creating emotionally captivating ad stories for short-form video content. Your goal is to create narratives that deeply resonate with viewers through emotional storytelling techniques.

Generate exactly 3 cohesive story options for a ${duration}-second ad. Each story will be broken down into 3 scenes: Hook, Body, and CTA. Each story should offer a different narrative approach, emotional angle, or problem-solving perspective while staying true to the product and prompt.

${adTypeGuidance ? `${adTypeGuidance}\n` : ''}

${productIsRobot ? '**CRITICAL: This product IS a robot/humanoid. Stories should feature the robot as the main character helping people.**' : '**CRITICAL: This product is NOT a robot. Stories should focus on people using the product directly. DO NOT include robots, humanoids, or mechanical assistants in the story unless the product itself is a robot.**'}

🚨 16-SECOND FORMAT REQUIREMENT - ULTRA-SIMPLE & SNAPPY:
For ${duration}-second ads, stories MUST be ULTRA-SIMPLE and SNAPPY. The entire story should be: Hook (problem visible) → Body (product/person does ONE simple action) → CTA (gratitude/resolution). No complex sequences, no multi-step actions, no elaborate setups.

${productIsRobot ? `GOOD SIMPLE STORIES FOR ROBOT PRODUCTS (✅ APPROVED):
- "Person looks tired → Robot brings coffee → Person smiles"
- "Person struggles with task → Robot offers help → Person shows gratitude"
- "Person looks stressed → Robot brings tea → Person relaxes"` : `GOOD SIMPLE STORIES FOR PRODUCTS (✅ APPROVED):
- "Person struggles with task → Person holds product and talks about it → Person discusses success"
- "Person has problem → Person holds product and discusses how it solves it → Person shows gratitude"
- "Person needs solution → Person holds product and talks about it → Problem discussed"`}

BAD COMPLEX STORIES (❌ REJECTED - TOO COMPLICATED):
- ❌ "Person prepares for party, realizes forgotten item, robot retrieves item from shelf, hands it over, person finishes setup" (multiple steps - REJECTED)
- ❌ "Person struggles with pose, robot adjusts mat, person finds center, completes pose" (multi-step sequence - REJECTED)
- ❌ "Person slumps over counter, robot brews coffee, places cup, person's eyes light up, person smiles" (too many actions - REJECTED)

The story must:
- Be a cohesive, complete narrative that flows from Hook → Body → CTA
- **CRITICAL: Only ONE action should happen in the entire story. The product/character should do ONE thing, not multiple things. Structure: Hook (setup/problem visible) → Body (ONE simple action happens) → CTA (gratitude/resolution). The body action must be achievable in 6 seconds - think one gesture, one movement, one simple act. NOT multiple steps, sequences, or complex tasks.**
- **Examples of ONE simple action: ${productIsRobot ? '✅ "Robot offers a cup of tea" ✅ "Robot brings coffee" ✅ "Robot hands over an item"' : '✅ "Person holds product and talks about it" ✅ "Person holds product and discusses how it solves the problem" ✅ "Person holds product and talks about recording"'}**
- **Examples of MULTIPLE actions (REJECTED): ${productIsRobot ? '❌ "Robot brews coffee AND places cup" ❌ "Robot retrieves item AND hands it over" ❌ "Robot adjusts mat AND person finds balance"' : '❌ "Person sets up product AND uses it" ❌ "Person prepares AND records" ❌ "Person holds product AND applies it"'}**
- **CRITICAL: Maintain the SAME location/setting throughout ALL scenes (Hook, Body, CTA). NO location changes, NO scene changes, NO environment changes. The entire story must take place in ONE continuous location (e.g., same room, same outdoor space, same office, same kitchen, same park bench, etc.). All action must happen in the exact same place with the same background, same environment, same surroundings. This is essential for creating a continuous video with no cuts or transitions.**
- **HARD REJECTION RULE: Any story that mentions mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection will be automatically rejected. DO NOT generate stories with these elements.**
- **CRITICAL: DO NOT include children in any scenes. No children visible in any part of the story. All characters must be adults.**
- **CRITICAL: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the story will be rejected.**
- **CRITICAL: Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate to make the story engaging and memorable.**
- **CRITICAL: Keep tasks SIMPLE and SNAPPY - achievable in 6 seconds. The body scene should show ONE simple action that moves the story forward, not complex multi-step tasks. Think: one gesture, one movement, one simple act. Examples: ${productIsRobot ? '✅ "Robot brings coffee" ✅ "Robot offers tea" ✅ "Robot hands over item" ❌ "Robot brews coffee, places cup, person reacts" (too many steps) ❌ "Robot retrieves item from shelf, glides over, hands it to person" (multi-step - REJECTED)' : '✅ "Person holds product and talks about it" ✅ "Person holds product and discusses how it solves problem" ✅ "Person holds product and talks about recording" ❌ "Person sets up product, uses it, shows result" (too many steps - REJECTED) ❌ "Person prepares, uses product, demonstrates success" (multi-step - REJECTED)'}.**
- **CRITICAL: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.**
- Be emotionally captivating and create a strong emotional connection between the viewer and the product/story
- Evoke specific emotions (joy, aspiration, relief, excitement, inspiration, trust, etc.) through relatable moments and emotional triggers
- Use emotional storytelling techniques: create an emotional hook that grabs attention, build emotional investment through the body scene, and deliver an emotional payoff in the CTA
- Include relatable moments that viewers can connect with on a personal level
- Be related to the initial prompt
- Be suitable for a ${duration}-second ad format
- Include a full paragraph description that captures the entire story arc and emotional journey
- Include a single emoji that best represents the story's theme and content (NO images, only emojis)

EMOTIONAL STORYTELLING REQUIREMENTS:
- Hook: Create an emotional opening that immediately captures attention and establishes an emotional connection (curiosity, surprise, relatability, aspiration). **Must establish the single location that will be used throughout the entire story. Keep it SIMPLE - just show the problem or situation.**
- Body: Build emotional investment through ONE SIMPLE action that demonstrates the product solving a problem. This must be a SINGLE, CLEAR action (not multiple actions, not a sequence). Think: ${productIsRobot ? 'Person has problem → Robot does ONE thing → Problem solved' : 'Person has problem → Person holds product and talks about how it solves problem → Problem discussed'}. **Must continue in the exact same location established in the Hook. No location changes, no scene changes. Character holds product and talks about it, never actually using it.**
- CTA: Deliver an emotional payoff that connects the emotional journey to the product, creating a memorable and compelling call to action. **Must remain in the exact same location as all previous scenes.**

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
      "body": "Brief body description for the single action that happens (ONE action only)",
      "callToAction": "Brief CTA description for the closing scene"
    },
    {
      "id": "story-2",
      "title": "A Different Story Title",
      "description": "A full paragraph (3-5 sentences) describing a different story approach",
      "emoji": "✨",
      "hook": "Brief hook description for the opening scene",
      "body": "Brief body description for the single action that happens (ONE action only)",
      "callToAction": "Brief CTA description for the closing scene"
    },
    {
      "id": "story-3",
      "title": "Another Story Title",
      "description": "A full paragraph (3-5 sentences) describing yet another story approach",
      "emoji": "🚀",
      "hook": "Brief hook description for the opening scene",
      "body": "Brief body description for the single action that happens (ONE action only)",
      "callToAction": "Brief CTA description for the closing scene"
    }
  ]
}`

      const userPrompt = `Create 3 emotionally captivating ad stories based on this prompt: "${prompt}"

Each story should offer a unique narrative approach, different emotional angle, or alternative problem-solving perspective. Make each story distinct while staying true to the product and prompt.

${adType ? `CRITICAL: This is a ${adType.replace('_', ' ')} ad. The story MUST follow the ${adType.replace('_', ' ')} narrative structure and requirements outlined above.` : ''}

${imageUrls.length > 0 ? `Reference images are available to inform the visual style and product details.` : ''}

**CRITICAL REQUIREMENT: The entire story (Hook, Body, CTA) MUST take place in ONE SINGLE LOCATION with NO location changes, NO scene changes, and NO environment changes. Choose a specific location (e.g., "a modern kitchen", "a cozy living room", "a park bench", "an office desk") and keep ALL scenes in that exact same place. The story should feel like one continuous moment happening in the same location, not multiple scenes in different places.**

**HARD REJECTION RULE: DO NOT use mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection. Any story containing these elements will be automatically rejected.**

**CRITICAL RESTRICTIONS:**
- **NO MIRRORS/REFLECTIONS**: HARD REJECTION RULE - DO NOT use mirrors, reflections, reflective surfaces, bathroom mirrors, or people looking at their reflection. Any story containing these elements will be automatically rejected.
- **ONE ACTION ONLY - ULTRA-SIMPLE**: CRITICAL - Only ONE simple action should happen in the entire story. The product/character should do ONE thing in the body scene, not multiple things, not a sequence. The body should be: ${productIsRobot ? 'Person has problem → Robot does ONE simple thing → Person shows gratitude' : 'Person has problem → Person holds product and talks about how it solves problem → Person shows gratitude'}. That's it. Examples: ${productIsRobot ? '✅ "Robot offers a cup of tea" (single action) ✅ "Robot brings coffee" (single action) ❌ "Robot brews coffee AND places cup" (multiple actions - REJECTED) ❌ "Robot retrieves item from shelf AND glides over AND hands it to person" (sequence - REJECTED) ❌ "Robot tidies magazine AND offers tea AND helps zip dress" (multiple actions - REJECTED)' : '✅ "Person holds product and talks about it" (single action) ✅ "Person holds product and discusses how it solves problem" (single action) ❌ "Person sets up product AND uses it" (multiple actions - REJECTED) ❌ "Person prepares AND uses product AND shows result" (sequence - REJECTED) ❌ "Person holds product AND applies it" (multiple actions - REJECTED)'}.
- **16-SECOND FORMAT - KEEP IT SNAPPY**: For ${duration}-second ads, stories must be ULTRA-SIMPLE. Avoid complex setups, multi-step sequences, or elaborate actions. Think: problem → solution (one action) → gratitude. The body action must be achievable in 6 seconds with a single gesture or movement.
- **NO CHILDREN**: DO NOT include children in any scenes. No children visible in any part of the story. All characters must be adults.
- **NO ELECTRONIC DEVICES**: DO NOT use laptops, phones, tablets, computers, screens, monitors, or ANY electronic devices in scenes. ABSOLUTELY NO technology interfaces, NO devices, NO screens of any kind. This is a hard requirement - if you include any electronic device, the story will be rejected.
- **SIMPLE TASKS**: Keep the body action SIMPLE and SNAPPY. The body scene should show ONE simple action that moves the story forward, not complex multi-step tasks. Examples: ${productIsRobot ? '✅ "Robot brings coffee" ✅ "Robot offers tea" ✅ "Robot hands over item" ❌ "Robot brews coffee, places cup, person reacts" (too many steps - REJECTED) ❌ "Person prepares for party, realizes forgotten item, robot retrieves item, hands it over" (complex sequence - REJECTED)' : '✅ "Person uses product" ✅ "Product solves problem" ✅ "Person records with product" ❌ "Person sets up product, uses it, shows result" (too many steps - REJECTED) ❌ "Person prepares, uses product, demonstrates success" (complex sequence - REJECTED)'}.
- **ONE CHARACTER SPEAKING**: Only one character should speak per segment. Different characters can speak in different segments, but within a single segment, only one character speaks.
- **PROBLEM-SOLVING FOCUS**: Focus on what the product is solving - make the problem clear and the solution obvious. Use humor when appropriate to make the story engaging and memorable.
- **MINIMAL BACKGROUND**: Keep scenes clean and focused. Avoid cluttered backgrounds with lots of objects, furniture, or visual distractions. Minimize background elements to keep focus on the product and characters. Simple, uncluttered environments work best.
- **NO MESSY SURFACES**: DO NOT use "messy", "cluttered", "disorganized", or "chaotic" to describe surfaces, countertops, tables, desks, or any surfaces. Keep all surfaces clean, organized, and minimal. Examples to avoid: ❌ "messy countertop", ❌ "cluttered table", ❌ "disorganized workspace". Instead use: ✅ "clean countertop", ✅ "minimal table", ✅ "organized workspace". Messy surfaces lead to duplicate or weird items appearing in scenes.

Focus on creating a story that evokes strong emotions and creates a deep connection with viewers through relatable moments, emotional triggers, and compelling narratives - all while maintaining a single continuous location throughout with minimal background clutter and clean, organized surfaces. Remember: For ${duration}-second format, KEEP IT SIMPLE AND SNAPPY. ${productIsRobot ? 'Problem → Robot does ONE thing → Gratitude' : 'Problem → Person uses product/Product solves problem → Gratitude'}. That's the formula.`

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

      if (parsed.stories.length !== 3) {
        throw new Error(`Expected 3 stories, got ${parsed.stories.length}`)
      }

      // Validation function to check for mirror/reflection keywords
      const hasMirrorReflection = (text: string): boolean => {
        if (!text) return false
        const lowerText = text.toLowerCase()
        const mirrorKeywords = [
          'mirror', 'reflection', 'reflective', 'reflecting', 'reflected',
          'bathroom mirror', 'looking at reflection', 'looking in mirror',
          'mirror surface', 'reflective surface', 'glass reflection'
        ]
        return mirrorKeywords.some(keyword => lowerText.includes(keyword))
      }

      // Validate each story has required fields and check for violations
      for (let i = 0; i < parsed.stories.length; i++) {
        const story = parsed.stories[i]
        
        // Check for required fields - support both new format (body) and old format (bodyOne/bodyTwo) for backward compatibility
        const hasBody = story.body || story.bodyOne || story.bodyTwo
        if (!story.description || !story.hook || !hasBody || !story.callToAction) {
          throw new Error(`Story ${i + 1} missing required fields (description, hook, body, callToAction)`)
        }

        // Check for mirror/reflection violations - HARD REJECTION
        const allText = `${story.description} ${story.hook} ${story.body || story.bodyOne || story.bodyTwo} ${story.callToAction}`.toLowerCase()
        if (hasMirrorReflection(allText)) {
          throw new Error(`Story ${i + 1} contains mirrors/reflections and will be rejected. Found in: ${story.description || story.hook || story.body || story.callToAction}`)
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
