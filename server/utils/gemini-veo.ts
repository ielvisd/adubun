import { GoogleGenAI } from '@google/genai'
import { promises as fs } from 'fs'
import path from 'path'
import { downloadFile, saveAsset } from './storage'

// Initialize Gemini client using the new @google/genai SDK
// Based on official documentation: https://ai.google.dev/gemini-api/docs/video?example=dialogue#javascript_2
let genAI: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set')
    }
    // The new SDK uses an options object
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

// Using the official Google Generative AI SDK for Veo video generation and extension
// Based on official documentation: https://ai.google.dev/gemini-api/docs/video
// Model names: veo-3.1-generate-preview (generation), veo-2.0-generate-preview (extension)

export interface GeminiVideoConfig {
  aspectRatio: '16:9' | '9:16' | '1:1'
  resolution?: '720p' | '1080p'
  durationSeconds?: number
  seed?: number
}

export interface GeminiVideoOperation {
  name: string
  done: boolean
  response?: {
    // New format: generateVideoResponse.generatedSamples[0].video.uri
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video: {
          uri: string
        }
      }>
    }
    // Old format: generatedVideos[0].video (for compatibility)
    generatedVideos?: Array<{
      video: {
        uri: string
      }
    }>
  }
  error?: {
    code: number
    message: string
  }
}

/**
 * Generate a continuity-focused prompt for video extension
 * Combines previous segment context with next segment's visual prompt
 */
export function generateContinuityPrompt(
  previousSegmentDescription: string,
  previousSegmentVisualPrompt: string,
  nextSegmentDescription: string,
  nextSegmentVisualPrompt: string
): string {
  return `Continue seamlessly from the end of the input video, transitioning from the previous scene: "${previousSegmentDescription}, ${previousSegmentVisualPrompt}" into the next scene: "${nextSegmentDescription}, ${nextSegmentVisualPrompt}". The transition should be smooth and natural, maintaining visual consistency. The video builds naturally to the final frame. At the end, the video must come to a full stop with zero motion. During the final 20 frames, gradually remove all movement until the scene becomes completely still. The last 12 frames must be a literal freeze-frame of the final image. No re-drawing, no micro-shifts, and no flicker. The final frame must remain identical and unchanged until the clip ends. The video then holds it completely motionless and unchanged for exactly 1 second at the end. Ensure zero camera movement, object shifts, or effects in the last second for flawless scene continuation. No transitions, dissolves, cuts, or visual effects.`
}

/**
 * Generate a base video using Gemini Veo 3.1 API
 * Based on official documentation: https://ai.google.dev/gemini-api/docs/video?example=dialogue#javascript_2
 * @param prompt - Text prompt describing the video to generate
 * @param config - Video configuration (aspect ratio, resolution, duration)
 * @returns Operation object that can be polled
 */
export async function generateVideoWithGemini(
  prompt: string,
  config: GeminiVideoConfig
): Promise<GeminiVideoOperation> {
  console.log('[Gemini Veo] Starting video generation with config:', {
    aspectRatio: config.aspectRatio,
    resolution: config.resolution || '720p',
    durationSeconds: config.durationSeconds || 4,
    promptLength: prompt.length,
  })

  try {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set')
    }
    
    console.log('[Gemini Veo] Using new @google/genai SDK')
    console.log('[Gemini Veo] Model: veo-3.1-generate-preview')
    
    // Use the new SDK as shown in the official documentation
    const ai = getGeminiClient()
    
    // Generate video using the new SDK API
    // Note: The SDK may handle config options differently, so we start with basic prompt
    let operation = await ai.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt: prompt,
    })
    
    console.log('[Gemini Veo] Video generation operation started:', operation.name)
    console.log('[Gemini Veo] Operation done:', operation.done)
    
    // Log the SDK operation structure for debugging
    console.log('[Gemini Veo] SDK operation type:', typeof operation)
    console.log('[Gemini Veo] SDK operation keys:', Object.keys(operation))
    if ((operation as any).response) {
      console.log('[Gemini Veo] SDK operation.response keys:', Object.keys((operation as any).response))
    }
    
    // Convert SDK operation to our interface format
    // Store the original SDK operation in a way we can access it if needed
    const converted: GeminiVideoOperation = {
      name: operation.name,
      done: operation.done || false,
      response: (operation as any).response,
      error: (operation as any).error,
    } as GeminiVideoOperation
    
    // Store original SDK operation for potential use in polling
    ;(converted as any)._sdkOperation = operation
    
    return converted
  } catch (error: any) {
    console.error('[Gemini Veo] ===== Error Starting Video Generation =====')
    console.error('[Gemini Veo] Error:', error.name, '-', error.message)
    if (error.stack && process.env.NODE_ENV === 'development') {
      console.error('[Gemini Veo] Stack:', error.stack)
    }
    
    // Log full error details
    if (error.response) {
      console.error('[Gemini Veo] Error response:', JSON.stringify(error.response, null, 2))
    }
    if (error.cause) {
      console.error('[Gemini Veo] Error cause:', error.cause)
    }
    
    // Preserve original error message but add context
    const errorMessage = error.message || 'Unknown error'
    const enhancedError = new Error(`Failed to start video generation: ${errorMessage}`)
    enhancedError.cause = error
    throw enhancedError
  }
}

/**
 * Extend a Veo-generated video using Gemini API
 * @param videoPathOrUrl - Path to local video file or URL to download
 * @param prompt - Continuity prompt for the extension
 * @param config - Video configuration (aspect ratio, resolution, duration)
 * @returns Operation object that can be polled
 */
export async function extendVideoWithGemini(
  videoPathOrUrl: string,
  prompt: string,
  config: GeminiVideoConfig
): Promise<GeminiVideoOperation> {
  // Download video if it's a URL
  let localVideoPath: string
  let shouldCleanup = false
  
  if (videoPathOrUrl.startsWith('http://') || videoPathOrUrl.startsWith('https://')) {
    console.log('[Gemini Veo] Downloading video from URL:', videoPathOrUrl.substring(0, 100) + '...')
    try {
      localVideoPath = await downloadFile(videoPathOrUrl)
      console.log('[Gemini Veo] Video downloaded to:', localVideoPath)
      shouldCleanup = true
      
      // Verify the downloaded file exists and is a valid local path (not a URL)
      if (localVideoPath.startsWith('http://') || localVideoPath.startsWith('https://')) {
        throw new Error('downloadFile returned a URL instead of a local path')
      }
      
      // Verify the file actually exists
      try {
        await fs.access(localVideoPath)
      } catch (accessError) {
        throw new Error(`Downloaded file does not exist at path: ${localVideoPath}`)
      }
    } catch (downloadError: any) {
      console.error('[Gemini Veo] Failed to download video:', downloadError)
      throw new Error(`Failed to download video for extension: ${downloadError.message}`)
    }
  } else {
    localVideoPath = videoPathOrUrl
    // Verify it's actually a local path, not a URL
    if (localVideoPath.startsWith('http://') || localVideoPath.startsWith('https://')) {
      throw new Error(`Invalid video path: expected local file path but got URL: ${localVideoPath.substring(0, 100)}...`)
    }
  }

  // Read video file as buffer
  let videoBuffer: Buffer
  try {
    videoBuffer = await fs.readFile(localVideoPath)
    console.log('[Gemini Veo] Video file read successfully, size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')
  } catch (readError: any) {
    console.error('[Gemini Veo] Failed to read video file:', readError)
    // Clean up downloaded file if we downloaded it
    if (shouldCleanup) {
      try {
        await fs.unlink(localVideoPath)
      } catch (cleanupError) {
        console.warn('[Gemini Veo] Failed to clean up after read error:', cleanupError)
      }
    }
    throw new Error(`Failed to read video file: ${readError.message}`)
  }
  
  // Convert aspect ratio to Gemini format
  const aspectRatioMap: Record<string, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '1:1': '1:1',
  }
  const geminiAspectRatio = aspectRatioMap[config.aspectRatio] || '16:9'
  
  // Determine resolution (default to 720p for extensions)
  const resolution = config.resolution || '720p'
  
  // Determine duration (max 7 seconds for extension, default to 6)
  const durationSeconds = config.durationSeconds 
    ? Math.min(config.durationSeconds, 7) 
    : 6

  console.log('[Gemini Veo] Starting video extension with config:', {
    aspectRatio: geminiAspectRatio,
    resolution,
    durationSeconds,
    promptLength: prompt.length,
  })

  try {
    // Use REST API with correct model name: models/veo-3.1-generate-preview
    // This matches the Python SDK's genai.generate_videos() method behavior
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set')
    }
    
    // Convert video buffer to base64 for the API call
    const videoBase64 = videoBuffer.toString('base64')
    
    console.log('[Gemini Veo] Starting video extension')
    console.log('[Gemini Veo] Video size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')
    console.log('[Gemini Veo] Using model: models/veo-3.1-generate-preview')
    
    // Use veo-3.1-generate-preview for extension (same as generation)
    // Format: https://generativelanguage.googleapis.com/v1beta/{model}:generateVideos
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:generateVideos?key=${apiKey}`
    
    // Build request body according to official API specification
    // For extension, we pass the video parameter
    const requestBody: any = {
      prompt,
      video: {
        data: videoBase64,
        mimeType: 'video/mp4',
      },
      config: {
        aspectRatio: geminiAspectRatio,
        resolution,
        durationSeconds: durationSeconds.toString(),
        ...(config.seed && { seed: config.seed }),
      },
    }
    
    console.log('[Gemini Veo] Base64 size:', (videoBase64.length / 1024 / 1024).toFixed(2), 'MB')
    
    // Make API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response received'
      const statusCode = response?.status || 0
      
      // Try to parse error as JSON for more details
      let errorJson: any = null
      try {
        errorJson = JSON.parse(errorText)
      } catch {
        // Not JSON, use text as-is
      }
      
      console.error('[Gemini Veo] ===== API Error =====')
      console.error('[Gemini Veo] Status:', statusCode, response?.statusText || 'No response')
      console.error('[Gemini Veo] Endpoint:', apiUrl.split('?')[0]) // Log endpoint without key
      console.error('[Gemini Veo] Video size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')
      console.error('[Gemini Veo] Prompt length:', prompt.length, 'characters')
      if (errorJson) {
        console.error('[Gemini Veo] Error details:', JSON.stringify(errorJson, null, 2))
      } else {
        console.error('[Gemini Veo] Error text:', errorText.substring(0, 1000))
      }
      console.error('[Gemini Veo] Full error response:', errorText)
      
      // Provide specific error messages based on status code
      if (statusCode === 401 || statusCode === 403) {
        throw new Error(`Gemini API authentication error (${statusCode}): Check GOOGLE_API_KEY environment variable. ${errorJson?.error?.message || errorText.substring(0, 200)}`)
      }
      
      if (statusCode === 404) {
        const modelInfo = 'veo-3.1-generate-preview'
        const errorDetails = errorJson?.error?.message || errorText || 'No error details provided'
        throw new Error(`Gemini API endpoint not found (404): The Veo API endpoint may not be available or the model name (${modelInfo}) is incorrect. Check: 1) API key has video extension access, 2) Model name is correct, 3) Project has Veo enabled. Error: ${errorDetails.substring(0, 300)}`)
      }
      
      if (statusCode === 400) {
        const errorMessage = errorJson?.error?.message || errorText.substring(0, 200)
        throw new Error(`Gemini API bad request (400): Invalid request format or parameters. ${errorMessage}`)
      }
      
      if (statusCode === 502 || statusCode === 503) {
        throw new Error(`Gemini API server error (${statusCode}): The API service is temporarily unavailable. Please try again later. ${errorJson?.error?.message || errorText.substring(0, 200)}`)
      }
      
      // Generic error for other status codes
      const errorMessage = errorJson?.error?.message || errorText.substring(0, 200)
      throw new Error(`Gemini API error (${statusCode}): ${errorMessage}`)
    }

    const result = await response.json()
    
    // The API returns an operation object
    // Extract operation name from response
    const operationName = result.name || result.operation?.name
    
    if (!operationName) {
      console.error('[Gemini Veo] Invalid API response structure:', JSON.stringify(result, null, 2))
      throw new Error('No operation name in Gemini API response. The API may have returned an unexpected format.')
    }

    console.log('[Gemini Veo] Video extension operation started:', operationName)
    
    // Return operation-like object
    return {
      name: operationName,
      done: false,
      response: result.response,
      error: result.error,
    } as GeminiVideoOperation
  } catch (error: any) {
    console.error('[Gemini Veo] ===== Error Starting Video Extension =====')
    console.error('[Gemini Veo] Error:', error.name, '-', error.message)
    if (error.stack && process.env.NODE_ENV === 'development') {
      console.error('[Gemini Veo] Stack:', error.stack)
    }
    
    // Clean up downloaded file if we downloaded it
    if (shouldCleanup && localVideoPath) {
      try {
        await fs.unlink(localVideoPath)
        console.log('[Gemini Veo] Cleaned up temporary video file after error')
      } catch (cleanupError) {
        console.warn('[Gemini Veo] Failed to clean up temp file:', cleanupError)
      }
    }
    
    // Preserve original error message but add context
    const enhancedError = new Error(`Failed to start video extension: ${error.message || 'Unknown error'}`)
    enhancedError.cause = error
    throw enhancedError
  } finally {
    // Clean up downloaded video if it was downloaded (only if no error occurred)
    // Note: We clean up in the catch block if there's an error, so this is for successful operations
    // Actually, we should keep the file until the operation completes, so we'll clean it up later
    // For now, we'll leave it and clean it up after the operation completes in extendVideoComplete
  }
}

/**
 * Poll a Gemini operation until it completes
 * Based on official documentation: https://ai.google.dev/gemini-api/docs/video?example=dialogue#javascript_2
 * @param operation - The operation object from generateVideos or extendVideoWithGemini
 * @param maxWaitTime - Maximum time to wait in milliseconds (default: 6 minutes)
 * @param pollInterval - Interval between polls in milliseconds (default: 10 seconds)
 * @returns Completed operation with video URL
 */
export async function pollGeminiOperation(
  operation: GeminiVideoOperation,
  maxWaitTime: number = 6 * 60 * 1000, // 6 minutes
  pollInterval: number = 10000 // 10 seconds
): Promise<GeminiVideoOperation> {
  const startTime = Date.now()
  
  console.log('[Gemini Veo] Polling operation:', operation.name)
  
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is not set')
  }
  
  let currentOperation = operation
  
  while (!currentOperation.done) {
    const elapsed = Date.now() - startTime
    if (elapsed > maxWaitTime) {
      throw new Error(`Operation timed out after ${maxWaitTime / 1000} seconds`)
    }

    try {
      console.log('[Gemini Veo] Waiting for video generation to complete...')
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      
      // Use REST API to poll operation status (consistent with extendVideoWithGemini approach)
      // Format: https://generativelanguage.googleapis.com/v1/{operation_name}
      const apiUrl = `https://generativelanguage.googleapis.com/v1/${currentOperation.name}?key=${apiKey}`
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to poll operation: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`)
      }

      const result = await response.json()
      
      // Log the raw result structure for debugging
      console.log('[Gemini Veo] Raw result keys:', Object.keys(result))
      console.log('[Gemini Veo] Result has response:', !!result.response)
      console.log('[Gemini Veo] Result done:', result.done)
      
      // Update current operation with polled status
      // When operation is done, response might be in result.response or at top level
      // For Gemini Veo, the response should be in result.response when done
      const operationResponse = result.response || null
      
      currentOperation = {
        name: result.name || currentOperation.name,
        done: result.done || false,
        response: operationResponse,
        error: result.error,
      } as GeminiVideoOperation
      
      console.log('[Gemini Veo] Operation status:', {
        done: currentOperation.done,
        hasError: !!currentOperation.error,
        hasResponse: !!currentOperation.response,
      })

      if (currentOperation.done) {
        if (currentOperation.error) {
          throw new Error(`Operation failed: ${currentOperation.error.message || 'Unknown error'}`)
        }
        
        // Log the response structure for debugging (always log when done)
        console.log('[Gemini Veo] Response structure:', {
          hasResponse: !!operationResponse,
          responseKeys: operationResponse ? Object.keys(operationResponse) : [],
          hasGenerateVideoResponse: !!operationResponse?.generateVideoResponse,
          generatedSamples: operationResponse?.generateVideoResponse?.generatedSamples?.length || 0,
          generatedVideos: operationResponse?.generatedVideos ? operationResponse.generatedVideos.length : 0,
          firstSample: operationResponse?.generateVideoResponse?.generatedSamples?.[0] ? Object.keys(operationResponse.generateVideoResponse.generatedSamples[0]) : [],
          firstVideo: operationResponse?.generatedVideos?.[0] ? Object.keys(operationResponse.generatedVideos[0]) : [],
        })
        
        // Always log full result when done to debug structure
        console.log('[Gemini Veo] Full operation result (when done):', JSON.stringify(result, null, 2))
        if (operationResponse) {
          console.log('[Gemini Veo] Full operation response:', JSON.stringify(operationResponse, null, 2))
        }
        
        return currentOperation
      }
    } catch (error: any) {
      // If it's a timeout or final error, throw it
      if (error.message?.includes('timed out') || error.message?.includes('failed')) {
        throw error
      }
      // Otherwise, log and continue polling
      console.warn('[Gemini Veo] Error polling operation, retrying:', error.message)
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }
  
  return currentOperation
}

/**
 * Download a video from Gemini API
 * Based on official documentation: https://ai.google.dev/gemini-api/docs/video?example=dialogue#javascript_2
 * @param videoFileOrUri - The video file object from operation.response.generatedVideos[0].video, or a URI string
 * @param outputPath - Optional output path, otherwise saves to assets directory
 * @returns Path to downloaded video file
 */
export async function downloadGeminiVideo(
  videoFileOrUri: any | string,
  outputPath?: string
): Promise<string> {
  try {
    const ai = getGeminiClient()
    
    // If it's a file object (from SDK operation response), use SDK download
    if (videoFileOrUri && typeof videoFileOrUri === 'object' && !videoFileOrUri.startsWith) {
      console.log('[Gemini Veo] Downloading video using SDK file object')
      
      // Generate a temporary path if not provided
      const tempPath = outputPath || path.join(process.cwd(), 'data', 'temp', `video-${Date.now()}.mp4`)
      
      // Ensure directory exists
      const dir = path.dirname(tempPath)
      await fs.mkdir(dir, { recursive: true })
      
      // Use SDK download method
      await ai.files.download({
        file: videoFileOrUri,
        downloadPath: tempPath,
      })
      
      console.log('[Gemini Veo] Video saved to:', tempPath)
      
      // If no output path was provided, move to assets directory
      if (!outputPath) {
        const savedPath = await saveAsset(await fs.readFile(tempPath), 'mp4')
        await fs.unlink(tempPath) // Clean up temp file
        console.log('[Gemini Veo] Video moved to assets:', savedPath)
        return savedPath
      }
      
      return tempPath
    }
    
    // Fallback: If it's a URI string, download via fetch
    let videoUri = videoFileOrUri as string
    console.log('[Gemini Veo] Downloading video from URI:', videoUri)
    
    // If it's a Google API URL, add the API key if not already present
    // Handle both /v1beta/ and /download/v1beta/ URL formats
    if (videoUri.includes('generativelanguage.googleapis.com') && !videoUri.includes('key=')) {
      const apiKey = process.env.GOOGLE_API_KEY
      if (apiKey) {
        const separator = videoUri.includes('?') ? '&' : '?'
        videoUri = `${videoUri}${separator}key=${apiKey}`
        console.log('[Gemini Veo] Added API key to download URL')
      } else {
        console.warn('[Gemini Veo] GOOGLE_API_KEY not found in environment variables')
      }
    }
    
    const response = await fetch(videoUri)
    
    if (!response.ok) {
      // Handle 403 Permission Denied with helpful error message
      if (response.status === 403) {
        const errorText = await response.text().catch(() => '')
        let errorJson: any = null
        try {
          errorJson = JSON.parse(errorText)
        } catch {
          // Not JSON, use text as-is
        }
        
        const errorMessage = errorJson?.message || errorText || 'Permission denied'
        const projectId = errorJson?.details?.[0]?.metadata?.['project'] || 
                         errorMessage.match(/project (\d+)/)?.[1] ||
                         'your-project'
        
        console.error('[Gemini Veo] 403 Permission Denied error:', errorMessage)
        console.error('[Gemini Veo] Full error response:', errorText)
        
        throw new Error(
          `Failed to download video: Permission Denied (403). ` +
          `The Generative Language API may not be enabled in your Google Cloud project. ` +
          `Please enable it by visiting: ` +
          `https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=${projectId} ` +
          `If you just enabled it, wait a few minutes for the change to propagate. ` +
          `Error: ${errorMessage.substring(0, 200)}`
        )
      }
      
      // Handle other errors
      const errorText = await response.text().catch(() => '')
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`)
    }
    
    const videoBuffer = Buffer.from(await response.arrayBuffer())
    
    if (outputPath) {
      await fs.writeFile(outputPath, videoBuffer)
      console.log('[Gemini Veo] Video saved to:', outputPath)
      return outputPath
    }
    
    // Save to assets directory
    const savedPath = await saveAsset(videoBuffer, 'mp4')
    console.log('[Gemini Veo] Video saved to assets:', savedPath)
    return savedPath
  } catch (error: any) {
    console.error('[Gemini Veo] Error downloading video:', error)
    throw new Error(`Failed to download video: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Complete workflow: Extend video and wait for completion
 * @param videoPathOrUrl - Path to local video file or URL
 * @param prompt - Continuity prompt
 * @param config - Video configuration
 * @returns Path to downloaded extended video
 */
export async function extendVideoComplete(
  videoPathOrUrl: string,
  prompt: string,
  config: GeminiVideoConfig
): Promise<{ videoPath: string; operationId: string }> {
  console.log('[Gemini Veo] Starting complete video extension workflow')
  
  // Track if we need to clean up the input video file
  const wasUrl = videoPathOrUrl.startsWith('http://') || videoPathOrUrl.startsWith('https://')
  let inputVideoPath: string | null = null
  
  try {
    // Download input video if it's a URL
    if (wasUrl) {
      inputVideoPath = await downloadFile(videoPathOrUrl)
      videoPathOrUrl = inputVideoPath
    } else {
      inputVideoPath = videoPathOrUrl
    }
    
    // Start extension
    const operation = await extendVideoWithGemini(videoPathOrUrl, prompt, config)
    const operationId = operation.name
    
    // Poll until complete
    const completedOperation = await pollGeminiOperation(operation)
    
    // Extract video file - use the correct structure
    let videoFile: any = completedOperation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
    
    // Fallback: try the old structure format
    if (!videoFile) {
      videoFile = completedOperation.response?.generatedVideos?.[0]?.video
    }
    
    if (!videoFile) {
      console.error('[Gemini Veo] Full operation response:', JSON.stringify(completedOperation.response, null, 2))
      throw new Error('No video file in operation response')
    }
    
    // Extract URI if it's an object with uri property, otherwise use as-is (string or object)
    const videoFileOrUri = (videoFile && typeof videoFile === 'object' && videoFile.uri) ? videoFile.uri : videoFile
    
    // Download extended video
    const videoPath = await downloadGeminiVideo(videoFileOrUri)
    
    return {
      videoPath,
      operationId,
    }
  } finally {
    // Clean up input video file if we downloaded it
    if (wasUrl && inputVideoPath) {
      try {
        await fs.unlink(inputVideoPath)
        console.log('[Gemini Veo] Cleaned up temporary input video file')
      } catch (cleanupError) {
        console.warn('[Gemini Veo] Failed to clean up input video file:', cleanupError)
      }
    }
  }
}

