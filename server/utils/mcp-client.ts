import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawn } from 'child_process'
import path from 'path'

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

  try {
    // Pass environment variables to child processes
    const childEnv = {
      ...process.env,
      REPLICATE_API_KEY: process.env.REPLICATE_API_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
    }

    // Replicate Client
    const replicateTransport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', path.join(process.cwd(), 'mcp-servers/replicate/index.ts')],
      env: childEnv,
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
      env: childEnv,
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
      env: childEnv,
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
    console.error('Failed to initialize MCP clients:', error)
    
    // Handle EPIPE errors during initialization
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('EPIPE error during MCP client initialization')
      throw new Error('MCP server connection failed. Please try again.')
    }
    
    throw new Error(`MCP client initialization failed: ${error.message || 'Unknown error'}`)
  }
}

export function getMCPClients(): MCPClients {
  return clients
}

export async function callReplicateMCP(
  tool: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const clients = await initializeMCPClients()
    if (!clients.replicate) {
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
    console.error(`[Replicate MCP Client] Call to ${tool} failed:`, error)
    console.error(`[Replicate MCP Client] Tool: ${tool}, Args:`, JSON.stringify(args, null, 2))
    
    // Handle EPIPE errors gracefully
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('EPIPE error detected - MCP server connection closed unexpectedly')
      throw new Error('MCP server connection closed unexpectedly. Please try again.')
    }
    
    if (error.stack) {
      console.error(`[Replicate MCP Client] Stack trace:`, error.stack)
    }
    throw new Error(`Replicate MCP call failed: ${error.message || 'Unknown error'}`)
  }
}

export async function callOpenAIMCP(
  tool: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const clients = await initializeMCPClients()
    if (!clients.openai) {
      throw new Error('OpenAI MCP client not initialized')
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
    console.error('OpenAI MCP call error:', error)
    console.error('Tool:', tool, 'Args:', args)
    
    // Handle MCP SDK timeout errors (error code -32001)
    if (error.code === -32001 || 
        error.message?.includes('-32001') ||
        error.message?.includes('Request timed out')) {
      console.error('MCP SDK timeout detected')
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`)
    }
    
    // Handle EPIPE errors gracefully
    if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
      console.error('EPIPE error detected - MCP server connection closed unexpectedly')
      throw new Error('MCP server connection closed unexpectedly. Please try again.')
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack)
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

