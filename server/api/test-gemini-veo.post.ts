import { 
  generateVideoWithGemini, 
  extendVideoWithGemini,
  pollGeminiOperation,
  downloadGeminiVideo,
  type GeminiVideoConfig 
} from '../utils/gemini-veo'
import { promises as fs } from 'fs'
import path from 'path'

// Helper to convert local file path to asset URL
function getAssetUrl(filePath: string): string {
  const filename = path.basename(filePath)
  const config = useRuntimeConfig()
  const baseUrl = config.public.appUrl || 'http://localhost:3000'
  return `${baseUrl}/api/assets/${filename}`
}

export default defineEventHandler(async (event) => {
  console.log('[Test Gemini Veo] Starting test workflow')
  
  let baseVideoPath: string | null = null
  let extendedVideoPath: string | null = null
  let baseVideoSuccess = false // Track if base video was successfully generated
  
  try {
    // Step 1: Generate base video
    console.log('[Test Gemini Veo] Step 1: Generating base video...')
    const basePrompt = 'A simple test scene: A red ball rolling across a green field for 4 seconds.'
    const config: GeminiVideoConfig = {
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 4,
    }
    
    const baseOperation = await generateVideoWithGemini(basePrompt, config)
    const baseOperationId = baseOperation.name
    console.log('[Test Gemini Veo] Base video operation started:', baseOperationId)
    
    // Step 2: Poll for base video completion
    console.log('[Test Gemini Veo] Step 2: Polling for base video completion...')
    const completedBaseOperation = await pollGeminiOperation(baseOperation, 6 * 60 * 1000, 10000)
    
    // Log the response structure for debugging
    console.log('[Test Gemini Veo] Completed operation response keys:', Object.keys(completedBaseOperation.response || {}))
    console.log('[Test Gemini Veo] Generated videos:', completedBaseOperation.response?.generatedVideos?.length || 0)
    if (completedBaseOperation.response?.generatedVideos?.[0]) {
      console.log('[Test Gemini Veo] First video keys:', Object.keys(completedBaseOperation.response.generatedVideos[0]))
      console.log('[Test Gemini Veo] First video object:', JSON.stringify(completedBaseOperation.response.generatedVideos[0], null, 2))
    }
    
    // Extract video file - the actual structure is:
    // response.generateVideoResponse.generatedSamples[0].video.uri
    let baseVideoFile = completedBaseOperation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
    
    // Fallback: try the old structure format (for compatibility)
    if (!baseVideoFile) {
      baseVideoFile = completedBaseOperation.response?.generatedVideos?.[0]?.video
    }
    
    // If we got the video object, extract the URI if it's a string
    if (baseVideoFile && typeof baseVideoFile === 'object' && baseVideoFile.uri) {
      // The video object has a uri property - we can use the URI directly or the object
      baseVideoFile = baseVideoFile.uri || baseVideoFile
    }
    
    if (!baseVideoFile) {
      // Log the full response for debugging
      const fullResponseStr = JSON.stringify(completedBaseOperation.response, null, 2)
      const fullOperationStr = JSON.stringify(completedBaseOperation, null, 2)
      console.error('[Test Gemini Veo] Full response:', fullResponseStr)
      console.error('[Test Gemini Veo] Full operation:', fullOperationStr)
      
      // Include the response in the error so we can see it
      const error = new Error('No video file in base operation response - checked multiple possible structures')
      ;(error as any).responseData = completedBaseOperation.response
      ;(error as any).fullOperation = completedBaseOperation
      throw error
    }
    
    console.log('[Test Gemini Veo] Found video file:', typeof baseVideoFile, baseVideoFile)
    
    console.log('[Test Gemini Veo] Base video generated')
    
    // Step 3: Download base video
    console.log('[Test Gemini Veo] Step 3: Downloading base video...')
    baseVideoPath = await downloadGeminiVideo(baseVideoFile)
    console.log('[Test Gemini Veo] Base video downloaded to:', baseVideoPath)
    baseVideoSuccess = true // Mark base video as successfully generated
    
    // Step 4: Extend base video
    console.log('[Test Gemini Veo] Step 4: Extending base video...')
    const extendPrompt = 'Extend the scene seamlessly: The red ball continues rolling into a blue sky background.'
    const extendConfig: GeminiVideoConfig = {
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 4,
    }
    
    const extendOperation = await extendVideoWithGemini(baseVideoPath, extendPrompt, extendConfig)
    const extendOperationId = extendOperation.name
    console.log('[Test Gemini Veo] Extension operation started:', extendOperationId)
    
    // Step 5: Poll for extension completion
    console.log('[Test Gemini Veo] Step 5: Polling for extension completion...')
    const completedExtendOperation = await pollGeminiOperation(extendOperation, 6 * 60 * 1000, 10000)
    
    // Extract extended video file - use the same structure as base video
    let extendedVideoFile = completedExtendOperation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
    
    // Fallback: try the old structure format
    if (!extendedVideoFile) {
      extendedVideoFile = completedExtendOperation.response?.generatedVideos?.[0]?.video
    }
    
    // If we got the video object, extract the URI if it's a string
    if (extendedVideoFile && typeof extendedVideoFile === 'object' && extendedVideoFile.uri) {
      extendedVideoFile = extendedVideoFile.uri || extendedVideoFile
    }
    
    if (!extendedVideoFile) {
      console.error('[Test Gemini Veo] Full extension response:', JSON.stringify(completedExtendOperation.response, null, 2))
      throw new Error('No video file in extension operation response')
    }
    
    console.log('[Test Gemini Veo] Extended video generated')
    
    // Step 6: Download extended video
    console.log('[Test Gemini Veo] Step 6: Downloading extended video...')
    extendedVideoPath = await downloadGeminiVideo(extendedVideoFile)
    console.log('[Test Gemini Veo] Extended video downloaded to:', extendedVideoPath)
    
    // Convert local paths to URLs for frontend
    const baseVideoUrl = baseVideoPath.startsWith('http') 
      ? baseVideoPath 
      : getAssetUrl(baseVideoPath)
    const extendedVideoUrl = extendedVideoPath.startsWith('http')
      ? extendedVideoPath
      : getAssetUrl(extendedVideoPath)
    
    return {
      success: true,
      baseVideoUrl,
      extendedVideoUrl,
      baseOperationId,
      extendedOperationId,
      baseVideoPath,
      extendedVideoPath,
    }
  } catch (error: any) {
    console.error('[Test Gemini Veo] Error during test:', error)
    
    // Only clean up base video if base video generation/download failed
    // If base video succeeded but extension failed, keep the base video file
    if (baseVideoPath && !baseVideoSuccess) {
      try {
        await fs.unlink(baseVideoPath)
        console.log('[Test Gemini Veo] Cleaned up base video file (generation failed)')
      } catch (cleanupError) {
        console.warn('[Test Gemini Veo] Failed to clean up base video:', cleanupError)
      }
    } else if (baseVideoPath && baseVideoSuccess) {
      console.log('[Test Gemini Veo] Keeping base video file (extension failed but base video succeeded)')
    }
    
    // Always clean up extended video if it exists (since extension failed)
    if (extendedVideoPath) {
      try {
        await fs.unlink(extendedVideoPath)
        console.log('[Test Gemini Veo] Cleaned up extended video file')
      } catch (cleanupError) {
        console.warn('[Test Gemini Veo] Failed to clean up extended video:', cleanupError)
      }
    }
    
    // Include response data in error for debugging
    const errorResponse: any = {
      success: false,
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      baseVideoUrl: baseVideoPath ? (baseVideoPath.startsWith('http') ? baseVideoPath : getAssetUrl(baseVideoPath)) : null,
      extendedVideoUrl: null,
    }
    
    // Add response data if available (for debugging)
    if ((error as any).responseData) {
      errorResponse.responseData = (error as any).responseData
    }
    if ((error as any).fullOperation) {
      errorResponse.fullOperation = (error as any).fullOperation
    }
    
    return errorResponse
  }
})

