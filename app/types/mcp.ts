export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
}

export interface MCPCallResult {
  content: Array<{
    type: 'text'
    text: string
  }>
}

export interface ReplicateGenerateVideoParams {
  prompt: string
  duration: number
  aspect_ratio: string
}

export interface ReplicatePredictionStatus {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[]
  error?: string
}

export interface OpenAICompletionParams {
  model: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  response_format?: { type: 'json_object' }
}

export interface ElevenLabsTTSParams {
  text: string
  voice_id?: string
  model_id?: string
}

