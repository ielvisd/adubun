import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'

export default defineEventHandler(async (event) => {
  try {
    // Handle multipart form data for product image uploads
    const formData = await readMultipartFormData(event)
    let body: any = {}
    const { saveAsset } = await import('../utils/storage')
    
    if (formData) {
      // Parse multipart form data
      const productImages: string[] = []
      
      for (const item of formData) {
        if (item.filename && item.data) {
          // It's a file - save it and get the path
          const extension = item.filename.split('.').pop() || 'jpg'
          const filePath = await saveAsset(Buffer.from(item.data), extension)
          
          // Store product images
          if (item.name === 'productImages') {
            productImages.push(filePath)
          }
        } else if (item.name) {
          // It's a form field
          const value = item.data.toString('utf-8')
          
          if (item.name === 'parsed') {
            // Parse the JSON string
            try {
              body.parsed = JSON.parse(value)
            } catch (e) {
              console.error('Failed to parse "parsed" field:', e)
              throw new Error('Invalid parsed data format')
            }
          } else if (item.name === 'productImages') {
            // Handle URL strings
            if (!productImages.length) {
              productImages.push(value)
            }
          } else {
            body[item.name] = value
          }
        }
      }
      
      if (productImages.length > 0) {
        body.productImages = productImages
      }
    } else {
      // Regular JSON body
      body = await readBody(event)
    }
    
    // Validate required field
    if (!body.parsed || typeof body.parsed !== 'object') {
      throw createError({
        statusCode: 400,
        message: 'Missing or invalid "parsed" field. Expected parsed prompt data.',
      })
    }
    
    // Validate parsed data has required fields
    const requiredParsedFields = ['product', 'targetAudience', 'mood', 'keyMessages', 'visualStyle', 'callToAction']
    const missingFields = requiredParsedFields.filter(field => !(field in body.parsed))
    
    if (missingFields.length > 0) {
      throw createError({
        statusCode: 400,
        message: `Missing required fields in parsed data: ${missingFields.join(', ')}`,
      })
    }
    
    // Validate product images if provided
    const productImages = body.productImages || []
    if (productImages.length > 10) {
      throw createError({
        statusCode: 400,
        message: 'Maximum 10 product images allowed',
      })
    }
    
    console.log('[Generate Stories] Generating 3 story options for product:', body.parsed.product)
    console.log('[Generate Stories] Product images:', productImages.length)
    
    // Call OpenAI MCP to generate stories
    const response = await callOpenAIMCP('generate_stories', {
      parsed: body.parsed,
      productImages,
    })
    
    // Debug: log the raw response
    console.log('[Generate Stories] Raw MCP response type:', typeof response)
    
    // Handle different response formats from MCP client
    let storiesData: any
    
    // If it's already a parsed object (most common case)
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      // Check if it's wrapped in a content property
      if ('content' in response && typeof response.content === 'string') {
        // If MCP client returned { content: "..." }, parse the content
        try {
          storiesData = JSON.parse(response.content)
        } catch (e) {
          console.error('[Generate Stories] Failed to parse content string:', e)
          throw new Error('Failed to parse MCP response content')
        }
      } else {
        // Already parsed object
        storiesData = response
      }
    } else if (typeof response === 'string') {
      // If it's a string, parse it
      try {
        storiesData = JSON.parse(response)
      } catch (e) {
        console.error('[Generate Stories] Failed to parse string response:', e)
        throw new Error('Failed to parse MCP response as JSON')
      }
    } else {
      console.error('[Generate Stories] Unexpected response format:', response)
      throw new Error('Unexpected response format from MCP client')
    }
    
    // Validate response structure
    if (!storiesData || typeof storiesData !== 'object') {
      console.error('[Generate Stories] Invalid stories data:', storiesData)
      throw new Error('Invalid response from story generator: response is not a valid object')
    }
    
    // Check if the response is an error object
    if (storiesData && typeof storiesData === 'object' && 'error' in storiesData && Object.keys(storiesData).length === 1) {
      const errorMessage = storiesData.error || 'Unknown error from MCP server'
      console.error('[Generate Stories] MCP server returned error:', errorMessage)
      throw new Error(`Failed to generate stories: ${errorMessage}`)
    }
    
    // Validate stories array
    if (!storiesData.stories || !Array.isArray(storiesData.stories)) {
      console.error('[Generate Stories] Missing or invalid stories array:', storiesData)
      throw new Error('Invalid response: expected "stories" array')
    }
    
    if (storiesData.stories.length !== 3) {
      console.error('[Generate Stories] Expected 3 stories, got:', storiesData.stories.length)
      throw new Error(`Invalid response: expected 3 stories, got ${storiesData.stories.length}`)
    }
    
    // Validate each story has required fields
    const requiredStoryFields = ['id', 'title', 'narrative', 'emotionalArc', 'keyBeats', 'targetAudience', 'rationale']
    for (const story of storiesData.stories) {
      const missingStoryFields = requiredStoryFields.filter(field => !(field in story))
      if (missingStoryFields.length > 0) {
        console.warn('[Generate Stories] Story missing fields:', missingStoryFields, 'Story:', story)
      }
    }
    
    // Track cost (do this after MCP call to not delay response)
    setImmediate(async () => {
      try {
        // Estimate cost based on:
        // - System prompt (~600 tokens)
        // - User requirements (~100 tokens)
        // - Product images (if any: ~170 tokens per image × number of images)
        // - Output (~1500 tokens for 3 detailed stories)
        const inputTokens = 700 + (productImages.length * 170)
        const outputTokens = 1500
        const inputCost = (inputTokens / 1_000_000) * 2.5  // $2.50 per 1M input tokens (gpt-4o)
        const outputCost = (outputTokens / 1_000_000) * 10.0 // $10.00 per 1M output tokens
        const totalCost = inputCost + outputCost
        
        await trackCost('generate-stories', totalCost, { 
          product: body.parsed.product,
          productImages: productImages.length,
        })
      } catch (e) {
        console.error('[Generate Stories] Failed to track cost:', e)
      }
    })
    
    console.log('[Generate Stories] Successfully generated 3 story options')
    
    return {
      stories: storiesData.stories,
    }
  } catch (error: any) {
    console.error('[Generate Stories] Error:', error)
    console.error('[Generate Stories] Error stack:', error.stack)
    
    // If it's already a createError response, re-throw it
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate story options',
      data: {
        originalError: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    })
  }
})

