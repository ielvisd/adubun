import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawn } from 'child_process'
import path from 'path'
import { parsePromptDirect, planStoryboardDirect, isServerlessEnvironment } from './openai-direct'
import { generateImageDirect, checkPredictionStatusDirect, getPredictionResultDirect } from './replicate-direct'

interface MCPClients {
  replicate?: Client
  openai?: Client
  elevenlabs?: Client
}

let clients: MCPClients = {}

export async function initializeMCPClients(): Promise<MCPClients> {
  if (Object.keys(clients).length > 0) {
    return clients
  }

  // Check if we're in a serverless environment - MCP won't work there
  if (isServerlessEnvironment()) {
    console.warn('[MCP Client] Serverless environment detected - MCP clients cannot be initialized (child processes not supported)')
    // Return empty clients object - callers should handle this with fallbacks
    return clients
  }

  try {
    // Replicate Client
    const replicateTransport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', path.join(process.cwd(), 'mcp-servers/replicate/index.ts')],
    })
    clients.replicate = new Client(
      { name: 'adubun-client', version: '1.0.0' },
      { capabilities: {} }
    )
    
    // Add error handlers for transport
    replicateTransport.onerror = (error) => {
      console.error('[Replicate MCP Transport] Error:', error)
    }
    
    await clients.replicate.connect(replicateTransport)

    // OpenAI Client
    const openaiTransport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', path.join(process.cwd(), 'mcp-servers/openai/index.ts')],
    })
    clients.openai = new Client(
      { name: 'adubun-client', version: '1.0.0' },
      { capabilities: {} }
    )
    
    // Add error handlers for transport
    openaiTransport.onerror = (error) => {
      console.error('[OpenAI MCP Transport] Error:', error)
    }
    
    await clients.openai.connect(openaiTransport)

    // ElevenLabs Client
    const elevenlabsTransport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', path.join(process.cwd(), 'mcp-servers/elevenlabs/index.ts')],
    })
    clients.elevenlabs = new Client(
      { name: 'adubun-client', version: '1.0.0' },
      { capabilities: {} }
    )
    
    // Add error handlers for transport
    elevenlabsTransport.onerror = (error) => {
      console.error('[ElevenLabs MCP Transport] Error:', error)
    }
    
    await clients.elevenlabs.connect(elevenlabsTransport)

    return clients
  } catch (error: any) {
    console.error('[MCP Client] Failed to initialize MCP clients:', error)
    console.error('[MCP Client] Error code:', error.code)
    console.error('[MCP Client] Error message:', error.message)
    
    // Check if this is a spawn/child process error (common on serverless)
    if (error.code === 'ENOENT' || 
        error.message?.includes('spawn') || 
        error.message?.includes('child process') ||
        error.message?.includes('Cannot find module') ||
        isServerlessEnvironment()) {
      console.warn('[MCP Client] Child process spawn failed - likely serverless environment')
      // Return empty clients - callers should use fallbacks
      return clients
    }
    
    // Handle EPIPE errors during initialization
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('[MCP Client] EPIPE error during MCP client initialization')
      // Return empty clients - callers should use fallbacks
      return clients
    }
    
    // For other errors, still return empty clients but log the error
    console.error('[MCP Client] MCP initialization failed, returning empty clients')
    return clients
  }
}

export function getMCPClients(): MCPClients {
  return clients
}

export async function callReplicateMCP(
  tool: string,
  args: Record<string, any>
): Promise<any> {
  // For generate_image, check_prediction_status, and get_prediction_result in serverless environments, use direct API
  if ((tool === 'generate_image' || tool === 'check_prediction_status' || tool === 'get_prediction_result') && isServerlessEnvironment()) {
    console.log(`[MCP Client] Using direct Replicate API for ${tool} (serverless environment detected)`)
    try {
      if (tool === 'generate_image') {
        return await generateImageDirect(
          args.model,
          args.prompt,
          args.image_input,
          args.size,
          args.aspect_ratio,
          args.width,
          args.height,
          args.sequential_image_generation,
          args.max_images,
          args.enhance_prompt,
          args.output_format
        )
      } else if (tool === 'check_prediction_status') {
        return await checkPredictionStatusDirect(args.predictionId)
      } else if (tool === 'get_prediction_result') {
        return await getPredictionResultDirect(args.predictionId)
      }
    } catch (error: any) {
      console.error('[MCP Client] Direct API call failed:', error)
      throw error
    }
  }

  try {
    // Try to initialize MCP clients
    let clients: MCPClients
    try {
      clients = await initializeMCPClients()
    } catch (initError: any) {
      // If MCP initialization fails and we're in serverless, fallback to direct API
      if ((tool === 'generate_image' || tool === 'check_prediction_status' || tool === 'get_prediction_result') && 
          (isServerlessEnvironment() || initError.message?.includes('spawn') || initError.code === 'ENOENT')) {
        console.warn(`[MCP Client] MCP initialization failed, falling back to direct API for ${tool}:`, initError.message)
        try {
          if (tool === 'generate_image') {
            return await generateImageDirect(
              args.model,
              args.prompt,
              args.image_input,
              args.size,
              args.aspect_ratio,
              args.width,
              args.height,
              args.sequential_image_generation,
              args.max_images,
              args.enhance_prompt,
              args.output_format
            )
          } else if (tool === 'check_prediction_status') {
            return await checkPredictionStatusDirect(args.predictionId)
          } else if (tool === 'get_prediction_result') {
            return await getPredictionResultDirect(args.predictionId)
          }
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback also failed:', directError)
          throw directError
        }
      }
      throw initError
    }

    if (!clients.replicate) {
      // Fallback to direct API for supported tools if client not available
      if (tool === 'generate_image' || tool === 'check_prediction_status' || tool === 'get_prediction_result') {
        console.warn(`[MCP Client] Replicate MCP client not available, using direct API for ${tool}`)
        try {
          if (tool === 'generate_image') {
            return await generateImageDirect(
              args.model,
              args.prompt,
              args.image_input,
              args.size,
              args.aspect_ratio,
              args.width,
              args.height,
              args.sequential_image_generation,
              args.max_images,
              args.enhance_prompt,
              args.output_format
            )
          } else if (tool === 'check_prediction_status') {
            return await checkPredictionStatusDirect(args.predictionId)
          } else if (tool === 'get_prediction_result') {
            return await getPredictionResultDirect(args.predictionId)
          }
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback failed:', directError)
          throw directError
        }
      }
      throw new Error('Replicate MCP client not initialized')
    }

    console.log(`[Replicate MCP Client] Calling tool: ${tool}`)
    console.log(`[Replicate MCP Client] Arguments:`, JSON.stringify(args, null, 2))

    const result = await clients.replicate.callTool({
      name: tool,
      arguments: args,
    })

    console.log(`[Replicate MCP Client] Raw MCP result:`, JSON.stringify({
      hasContent: !!result.content,
      contentLength: result.content?.length,
      firstContentType: result.content?.[0]?.type,
      firstContentText: result.content?.[0]?.text?.substring(0, 500),
    }, null, 2))

    if (!result.content || !result.content[0] || !result.content[0].text) {
      console.error(`[Replicate MCP Client] Invalid MCP response structure:`, JSON.stringify(result, null, 2))
      throw new Error('Invalid MCP response structure')
    }

    const parsed = JSON.parse(result.content[0].text)
    console.log(`[Replicate MCP Client] Parsed response:`, JSON.stringify(parsed, null, 2))
    console.log(`[Replicate MCP Client] Parsed response keys:`, Object.keys(parsed || {}))

    return parsed
  } catch (error: any) {
    console.error(`[MCP Client] Replicate MCP call error:`, error)
    console.error(`[MCP Client] Tool: ${tool}, Args:`, JSON.stringify(args, null, 2))
    
    // For supported tools, try direct API as fallback if MCP fails
    if (tool === 'generate_image' || tool === 'check_prediction_status' || tool === 'get_prediction_result') {
      // Check if error is related to MCP/child process issues
      const isMCPError = error.code === 'EPIPE' || 
                        error.message?.includes('EPIPE') ||
                        error.message?.includes('spawn') ||
                        error.message?.includes('child process') ||
                        error.code === -32001 ||
                        error.message?.includes('MCP') ||
                        error.message?.includes('not initialized')
      
      if (isMCPError) {
        console.warn(`[MCP Client] MCP error detected for ${tool}, falling back to direct API`)
        try {
          let result: any
          if (tool === 'generate_image') {
            result = await generateImageDirect(
              args.model,
              args.prompt,
              args.image_input,
              args.size,
              args.aspect_ratio,
              args.width,
              args.height,
              args.sequential_image_generation,
              args.max_images,
              args.enhance_prompt,
              args.output_format
            )
          } else if (tool === 'check_prediction_status') {
            result = await checkPredictionStatusDirect(args.predictionId)
          } else if (tool === 'get_prediction_result') {
            result = await getPredictionResultDirect(args.predictionId)
          }
          console.log(`[MCP Client] Direct API fallback succeeded for ${tool}`)
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback also failed:', directError)
          // Throw the original MCP error with context
          throw new Error(`MCP call failed and direct API fallback also failed: ${error.message}. Direct API error: ${directError.message}`)
        }
      }
    }
    
    // Handle EPIPE errors gracefully
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('[MCP Client] EPIPE error detected - MCP server connection closed unexpectedly')
      throw new Error('MCP server connection closed unexpectedly. Please try again.')
    }
    
    if (error.stack) {
      console.error(`[MCP Client] Stack trace:`, error.stack)
    }
    throw new Error(`Replicate MCP call failed: ${error.message || 'Unknown error'}`)
  }
}

export async function callOpenAIMCP(
  tool: string,
  args: Record<string, any>
): Promise<any> {
  // For parse_prompt in serverless environments, use direct API
  if (tool === 'parse_prompt' && isServerlessEnvironment()) {
    console.log('[MCP Client] Using direct OpenAI API for parse_prompt (serverless environment detected)')
    try {
      const result = await parsePromptDirect(args.prompt, args.adType)
      return result
    } catch (error: any) {
      console.error('[MCP Client] Direct API call failed:', error)
      throw error
    }
  }

  // For plan_storyboard in serverless environments, use direct API
  if (tool === 'plan_storyboard' && isServerlessEnvironment()) {
    console.log('[MCP Client] Using direct OpenAI API for plan_storyboard (serverless environment detected)')
    try {
      const result = await planStoryboardDirect(
        args.parsed,
        args.duration,
        args.style,
        args.referenceImages,
        args.adType
      )
      return result
    } catch (error: any) {
      console.error('[MCP Client] Direct API call failed:', error)
      throw error
    }
  }

  try {
    // Try to initialize MCP clients
    let clients: MCPClients
    try {
      clients = await initializeMCPClients()
    } catch (initError: any) {
      // If MCP initialization fails and we're in serverless, fallback to direct API
      if (tool === 'parse_prompt' && (isServerlessEnvironment() || initError.message?.includes('spawn') || initError.code === 'ENOENT')) {
        console.warn('[MCP Client] MCP initialization failed, falling back to direct API for parse_prompt:', initError.message)
        try {
          const result = await parsePromptDirect(args.prompt, args.adType)
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback also failed:', directError)
          throw directError
        }
      }
      if (tool === 'plan_storyboard' && (isServerlessEnvironment() || initError.message?.includes('spawn') || initError.code === 'ENOENT')) {
        console.warn('[MCP Client] MCP initialization failed, falling back to direct API for plan_storyboard:', initError.message)
        try {
          const result = await planStoryboardDirect(
            args.parsed,
            args.duration,
            args.style,
            args.referenceImages,
            args.adType
          )
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback also failed:', directError)
          throw directError
        }
      }
      throw initError
    }

    if (!clients.openai) {
      // Fallback to direct API for parse_prompt if client not available
      if (tool === 'parse_prompt') {
        console.warn('[MCP Client] OpenAI MCP client not available, using direct API for parse_prompt')
        try {
          const result = await parsePromptDirect(args.prompt, args.adType)
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback failed:', directError)
          throw directError
        }
      }
      // Fallback to direct API for plan_storyboard if client not available
      if (tool === 'plan_storyboard') {
        console.warn('[MCP Client] OpenAI MCP client not available, using direct API for plan_storyboard')
        try {
          const result = await planStoryboardDirect(
            args.parsed,
            args.duration,
            args.style,
            args.referenceImages,
            args.adType
          )
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback failed:', directError)
          throw directError
        }
      }
      // For other tools, provide a clear error message
      throw new Error(`OpenAI MCP client not initialized. Tool '${tool}' requires MCP servers which are not available in serverless environments. Please use a different deployment platform or implement a direct API fallback for this tool.`)
    }

    // Use longer timeouts for operations that can take a while
    let timeoutMs = 60 * 1000 // Default 60 seconds
    if (tool === 'plan_storyboard') {
      timeoutMs = 5 * 60 * 1000 // 5 minutes
    } else if (tool === 'generate_ad_stories') {
      timeoutMs = 2 * 60 * 1000 // 2 minutes for story generation
    }
    
    const result = await Promise.race([
      clients.openai.callTool({
        name: tool,
        arguments: args,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
      )
    ]) as any

    if (!result.content || !result.content[0]) {
      console.error('Invalid MCP response structure:', result)
      throw new Error('Invalid MCP response structure: no content')
    }

    const content = result.content[0]
    const text = content.text || (typeof content === 'string' ? content : JSON.stringify(content))
    
    if (!text) {
      console.error('No text content in MCP response:', content)
      throw new Error('Invalid MCP response structure: no text content')
    }

    // Debug: log the raw text response
    console.log('MCP raw text response:', text.substring(0, 500))

    // Check if the response contains an error
    if (text.trim().startsWith('{') && text.includes('"error"')) {
      try {
        const errorData = JSON.parse(text)
        if (errorData.error) {
          console.error('MCP returned error response:', errorData)
          throw new Error(`MCP tool error: ${errorData.error}`)
        }
      } catch (e: any) {
        // If it's our error, re-throw it
        if (e.message && e.message.includes('MCP tool error')) {
          throw e
        }
        // Otherwise, it's not a JSON error, continue
      }
    }

    try {
      const parsed = JSON.parse(text)
      
      // Check if parsed object only has an error field
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 1 && 'error' in parsed) {
        console.error('MCP returned error object:', parsed)
        throw new Error(`MCP tool error: ${parsed.error}`)
      }
      
      console.log('MCP parsed response:', JSON.stringify(parsed, null, 2))
      console.log('MCP parsed response keys:', Object.keys(parsed || {}))
      return parsed
    } catch (parseError: any) {
      // If it's our error, re-throw it
      if (parseError.message && parseError.message.includes('MCP tool error')) {
        throw parseError
      }
      // If it's not JSON, return as is (might be a string response)
      console.warn('MCP response is not JSON, returning as string:', text.substring(0, 100))
      console.warn('Parse error:', parseError.message)
      return { content: text }
    }
  } catch (error: any) {
    console.error('[MCP Client] OpenAI MCP call error:', error)
    console.error('[MCP Client] Tool:', tool, 'Args:', args)
    
    // For parse_prompt and plan_storyboard, try direct API as fallback if MCP fails
    if (tool === 'parse_prompt' || tool === 'plan_storyboard') {
      // Check if error is related to MCP/child process issues
      const isMCPError = error.code === 'EPIPE' || 
                        error.message?.includes('EPIPE') ||
                        error.message?.includes('spawn') ||
                        error.message?.includes('child process') ||
                        error.code === -32001 ||
                        error.message?.includes('MCP') ||
                        error.message?.includes('not initialized')
      
      if (isMCPError) {
        console.warn(`[MCP Client] MCP error detected for ${tool}, falling back to direct API`)
        try {
          let result: any
          if (tool === 'parse_prompt') {
            result = await parsePromptDirect(args.prompt, args.adType)
          } else if (tool === 'plan_storyboard') {
            result = await planStoryboardDirect(
              args.parsed,
              args.duration,
              args.style,
              args.referenceImages,
              args.adType
            )
          }
          console.log(`[MCP Client] Direct API fallback succeeded for ${tool}`)
          return result
        } catch (directError: any) {
          console.error('[MCP Client] Direct API fallback also failed:', directError)
          // Throw the original MCP error with context
          throw new Error(`MCP call failed and direct API fallback also failed: ${error.message}. Direct API error: ${directError.message}`)
        }
      }
    }
    
    // Handle MCP SDK timeout errors (error code -32001)
    if (error.code === -32001 || 
        error.message?.includes('-32001') ||
        error.message?.includes('Request timed out')) {
      console.error('[MCP Client] MCP SDK timeout detected')
      // Calculate timeout from error message or use default
      const timeoutMatch = error.message?.match(/(\d+) seconds/)
      const timeoutSeconds = timeoutMatch ? parseInt(timeoutMatch[1]) : 60
      throw new Error(`Request timed out after ${timeoutSeconds} seconds`)
    }
    
    // Handle EPIPE errors gracefully
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('[MCP Client] EPIPE error detected - MCP server connection closed unexpectedly')
      throw new Error('MCP server connection closed unexpectedly. Please try again.')
    }
    
    if (error.stack) {
      console.error('[MCP Client] Stack trace:', error.stack)
    }
    throw new Error(`OpenAI MCP call failed: ${error.message || 'Unknown error'}`)
  }
}

export async function callElevenLabsMCP(
  tool: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const clients = await initializeMCPClients()
    if (!clients.elevenlabs) {
      throw new Error('ElevenLabs MCP client not initialized')
    }

    const result = await clients.elevenlabs.callTool({
      name: tool,
      arguments: args,
    })

    if (!result.content || !result.content[0] || !result.content[0].text) {
      throw new Error('Invalid MCP response structure')
    }

    const text = result.content[0].text
    const parsed = JSON.parse(text)

    // Check if the response contains an error
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      console.error('[ElevenLabs MCP] Error response:', parsed)
      throw new Error(`ElevenLabs MCP error: ${parsed.error}`)
    }

    return parsed
  } catch (error: any) {
    console.error(`[ElevenLabs MCP] Call to ${tool} failed:`, error)
    console.error(`[ElevenLabs MCP] Tool: ${tool}, Args:`, JSON.stringify(args, null, 2))
    
    // Handle EPIPE errors gracefully
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('EPIPE error detected - MCP server connection closed unexpectedly')
      throw new Error('MCP server connection closed unexpectedly. Please try again.')
    }
    
    if (error.stack) {
      console.error(`[ElevenLabs MCP] Stack trace:`, error.stack)
    }
    throw new Error(`ElevenLabs MCP call failed: ${error.message || 'Unknown error'}`)
  }
}

