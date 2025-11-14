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
import axios from 'axios'

// Load environment variables from .env file
const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '..', '.env'),
  resolve(process.cwd(), '..', '.env'),
]

for (const envPath of envPaths) {
  const result = config({ path: envPath })
  if (result.parsed && process.env.ELEVENLABS_API_KEY) {
    console.error(`Loaded .env from: ${envPath}`)
    break
  }
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

class ElevenLabsMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-elevenlabs',
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
          name: 'text_to_speech',
          description: 'Convert text to speech using ElevenLabs',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              voice_id: {
                type: 'string',
                description: 'Voice ID to use',
                default: '21m00Tcm4TlvDq8ikWAM',
              },
              model_id: {
                type: 'string',
                description: 'Model ID to use',
                default: 'eleven_monolingual_v1',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'get_voice_list',
          description: 'Get list of available voices',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_voice_settings',
          description: 'Get settings for a specific voice',
          inputSchema: {
            type: 'object',
            properties: {
              voice_id: {
                type: 'string',
                description: 'Voice ID',
              },
            },
            required: ['voice_id'],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'text_to_speech':
            return await this.textToSpeech(
              args.text,
              args.voice_id || '21m00Tcm4TlvDq8ikWAM',
              args.model_id || 'eleven_monolingual_v1'
            )
          
          case 'get_voice_list':
            return await this.getVoiceList()
          
          case 'get_voice_settings':
            return await this.getVoiceSettings(args.voice_id)
          
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

  private async textToSpeech(text: string, voiceId: string, modelId: string) {
    try {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ElevenLabs API key is not configured')
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Text to convert is empty')
      }

      const response = await axios.post(
        `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: modelId,
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      )

      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response from ElevenLabs API')
      }

      // Return base64 encoded audio
      const audioBase64 = Buffer.from(response.data).toString('base64')

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
              voiceId,
              modelId,
            }),
          },
        ],
      }
    } catch (error: any) {
      console.error('[ElevenLabs MCP] textToSpeech error:', error.message)
      if (error.response) {
        console.error('[ElevenLabs MCP] API response status:', error.response.status)
        console.error('[ElevenLabs MCP] API response data:', error.response.data?.toString?.() || error.response.data)
      }
      throw error
    }
  }

  private async getVoiceList() {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    })

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data),
        },
      ],
    }
  }

  private async getVoiceSettings(voiceId: string) {
    const response = await axios.get(
      `${ELEVENLABS_BASE_URL}/voices/${voiceId}/settings`,
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    )

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data),
        },
      ],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('ElevenLabs MCP server running on stdio')
  }
}

const server = new ElevenLabsMCPServer()
server.run().catch(console.error)

