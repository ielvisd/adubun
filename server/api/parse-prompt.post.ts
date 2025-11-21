import { parsePromptSchema } from '../utils/validation'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'

export default defineEventHandler(async (event) => {
  try {
    // Handle multipart form data for image uploads
    const formData = await readMultipartFormData(event)
    let body: any = {}
    const { saveAsset } = await import('../utils/storage')
    
    if (formData) {
      // Parse multipart form data
      for (const item of formData) {
        if (item.filename && item.data) {
          // It's a file - save it and get the path
          const extension = item.filename.split('.').pop() || 'jpg'
          const filePath = await saveAsset(Buffer.from(item.data), extension)
          
          // Store the file path in body
          // Veo 3.1 fields
          if (item.name === 'image') {
            if (!body.image) body.image = filePath
          } else if (item.name === 'lastFrame') {
            body.lastFrame = filePath
          } else if (item.name === 'referenceImages') {
            if (!body.referenceImages) body.referenceImages = []
            body.referenceImages.push(filePath)
          }
          // Legacy fields
          else if (item.name === 'firstFrameImage') {
            body.firstFrameImage = filePath
          } else if (item.name === 'subjectReference') {
            body.subjectReference = filePath
          } else if (item.name === 'inputImage') {
            body.inputImage = filePath
          }
        } else if (item.name) {
          // It's a form field
          const value = item.data.toString('utf-8')
          // Try to parse numbers
          if (item.name === 'duration' || item.name === 'seed') {
            body[item.name] = Number(value)
          } else if (item.name === 'generateAudio') {
            body[item.name] = value === 'true'
          } else if (item.name === 'image' || item.name === 'lastFrame' || item.name === 'firstFrameImage' || item.name === 'subjectReference' || item.name === 'inputImage') {
            // Could be a URL string
            body[item.name] = value || null
          } else if (item.name === 'referenceImages') {
            // Handle array of reference images (URLs)
            if (!body.referenceImages) body.referenceImages = []
            if (value) body.referenceImages.push(value)
          } else if (item.name === 'model') {
            // Model ID
            body[item.name] = value || undefined
          } else {
            body[item.name] = value
          }
        }
      }
    } else {
      // Regular JSON body
      body = await readBody(event)
    }
    
    const validated = parsePromptSchema.parse(body)

    // Parse with OpenAI MCP first (this is the slow part)
    const parsed = await callOpenAIMCP('parse_prompt', {
      prompt: validated.prompt,
      adType: validated.adType, // Pass adType to prompt parser context
    })

    // Debug: log the raw response
    console.log('Raw parsed response from MCP:', JSON.stringify(parsed, null, 2))
    console.log('Type of parsed:', typeof parsed)
    console.log('Is array?', Array.isArray(parsed))

    // Handle different response formats from MCP client
    let parsedData: any
    
    // If it's already a parsed object (most common case)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Check if it's wrapped in a content property
      if ('content' in parsed && typeof parsed.content === 'string') {
        // If MCP client returned { content: "..." }, parse the content
        try {
          parsedData = JSON.parse(parsed.content)
        } catch (e) {
          console.error('Failed to parse content string:', e)
          throw new Error('Failed to parse MCP response content')
        }
      } else {
        // Already parsed object
        parsedData = parsed
      }
    } else if (typeof parsed === 'string') {
      // If it's a string, parse it
      try {
        parsedData = JSON.parse(parsed)
      } catch (e) {
        console.error('Failed to parse string response:', e)
        throw new Error('Failed to parse MCP response as JSON')
      }
    } else {
      console.error('Unexpected response format:', parsed)
      throw new Error('Unexpected response format from MCP client')
    }

    // Debug: log the parsed data
    console.log('Parsed data after processing:', JSON.stringify(parsedData, null, 2))
    console.log('Parsed data keys:', Object.keys(parsedData || {}))
    console.log('Parsed data type:', typeof parsedData)

    // Quick validation - check if it's a valid object
    if (!parsedData || typeof parsedData !== 'object') {
      console.error('Invalid parsed data:', parsedData)
      console.error('Type of parsedData:', typeof parsedData)
      throw new Error('Invalid response from prompt parser: response is not a valid object')
    }

    // Check if the response is an error object
    if (parsedData && typeof parsedData === 'object' && 'error' in parsedData && Object.keys(parsedData).length === 1) {
      const errorMessage = parsedData.error || 'Unknown error from MCP server'
      console.error('MCP server returned error:', errorMessage)
      throw new Error(`Failed to parse prompt: ${errorMessage}. Please check your OPENAI_API_KEY environment variable and ensure it's valid.`)
    }

    // Track cost (do this after MCP call to not delay response)
    // Use setImmediate to not block the response
    setImmediate(async () => {
      try {
        await trackCost('parse-prompt', 0.001, { prompt: validated.prompt })
      } catch (e) {
        console.error('Failed to track cost:', e)
      }
    })

    // Validate required fields exist (but don't fail if some are missing - let generate page handle it)
    const requiredFields = ['product', 'targetAudience', 'mood', 'keyMessages', 'visualStyle', 'callToAction']
    const missingFields = requiredFields.filter(field => !(field in parsedData))
    
    if (missingFields.length > 0) {
      console.warn('Missing required fields:', missingFields)
      console.warn('Available fields:', Object.keys(parsedData))
      
      // If the object is completely empty, throw error
      if (Object.keys(parsedData).length === 0) {
        throw new Error('OpenAI returned an empty response. Please check your API key and try again.')
      }
      
      // Check if fields might be in a different case (snake_case vs camelCase)
      const lowerCaseFields = Object.keys(parsedData).map(k => k.toLowerCase())
      const fieldMapping: Record<string, string> = {
        'product': 'product',
        'targetaudience': 'targetAudience',
        'target_audience': 'targetAudience',
        'mood': 'mood',
        'keymessages': 'keyMessages',
        'key_messages': 'keyMessages',
        'visualstyle': 'visualStyle',
        'visual_style': 'visualStyle',
        'calltoaction': 'callToAction',
        'call_to_action': 'callToAction',
      }
      
      // Try to map fields
      const mappedData: any = {}
      for (const [key, value] of Object.entries(parsedData)) {
        const lowerKey = key.toLowerCase()
        if (fieldMapping[lowerKey]) {
          mappedData[fieldMapping[lowerKey]] = value
        } else {
          mappedData[key] = value
        }
      }
      
      // Check again after mapping
      const stillMissing = requiredFields.filter(field => !(field in mappedData))
      if (stillMissing.length < missingFields.length) {
        // Some fields were mapped, use the mapped data
        Object.assign(parsedData, mappedData)
        console.log('Successfully mapped some fields:', Object.keys(mappedData))
      }
      // Note: We don't throw here - let the generate page handle missing fields
    }

    return {
      ...parsedData,
      meta: {
        duration: validated.duration || 30,
        aspectRatio: validated.aspectRatio,
        style: validated.style,
        mode: validated.mode || 'demo',
        model: validated.model || 'google/veo-3.1-fast', // Default to google/veo-3.1-fast
        adType: validated.adType || 'lifestyle', // Default to lifestyle,
        mood: validated.mood, // Pass through mood
        // Veo 3.1 fields
        image: validated.image || undefined,
        lastFrame: validated.lastFrame || undefined,
        referenceImages: validated.referenceImages || undefined,
        negativePrompt: validated.negativePrompt || undefined,
        resolution: validated.resolution || '1080p',
        generateAudio: validated.generateAudio !== undefined ? validated.generateAudio : true,
        seed: validated.seed || undefined,
        // Legacy fields for other models
        firstFrameImage: validated.firstFrameImage || validated.inputImage || undefined,
        subjectReference: validated.subjectReference || undefined,
      },
    }
  } catch (error: any) {
    console.error('Parse prompt error:', error)
    console.error('Error stack:', error.stack)
    
    // If it's a validation error, return 400 with helpful message
    if (error.name === 'ZodError' || error.issues) {
      const zodError = error as any
      const firstError = zodError.errors?.[0] || zodError.issues?.[0]
      const field = firstError?.path?.[0] || 'input'
      const message = firstError?.message || 'Invalid input data'
      
      throw createError({
        statusCode: 400,
        message: `${field === 'prompt' ? 'Please provide a valid description' : `Invalid ${field}`}: ${message}`,
        data: {
          errors: zodError.errors || zodError.issues,
          field,
        },
      })
    }
    
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to parse prompt',
      data: {
        originalError: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    })
  }
})
