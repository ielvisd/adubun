import { callReplicateMCP } from '../utils/mcp-client'
import { uploadFileToReplicate } from '../utils/replicate-upload'
import { readMultipartFormData } from 'h3'
import { saveAsset } from '../utils/storage'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    console.log('[Generate Image] Received request')
    
    // Handle multipart form data for file uploads
    let formData
    try {
      formData = await readMultipartFormData(event)
      console.log('[Generate Image] Form data received:', formData ? `${formData.length} items` : 'null')
    } catch (formDataError: any) {
      console.log('[Generate Image] No multipart form data, trying JSON body:', formDataError.message)
      formData = null
    }
    
    let body: any = {}

    if (formData) {
      // Parse multipart form data
      for (const item of formData) {
        if (item.filename && item.data) {
          // It's a file - save it and get the path
          const extension = item.filename.split('.').pop() || 'jpg'
          console.log(`[Generate Image] Saving file: ${item.filename} (${item.data.length} bytes)`)
          
          // Ensure item.data is a Buffer
          const fileBuffer = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data)
          const filePath = await saveAsset(fileBuffer, extension)
          
          // Validate the returned path
          if (!filePath || typeof filePath !== 'string') {
            console.error(`[Generate Image] ERROR: saveAsset returned invalid path:`, typeof filePath, filePath)
            throw createError({
              statusCode: 500,
              message: `Failed to save file: invalid path returned`,
            })
          }
          
          // Check for binary data corruption in the path
          const hasNullBytes = filePath.includes('\x00')
          const containsJpegMarkers = filePath.includes('JFIF') || filePath.includes('Exif') || filePath.includes('JPEG')
          if (hasNullBytes || containsJpegMarkers) {
            console.error(`[Generate Image] ERROR: File path contains binary data:`, filePath.substring(0, 200))
            throw createError({
              statusCode: 500,
              message: `Failed to save file: path contains binary data`,
            })
          }
          
          console.log(`[Generate Image] File saved to: ${filePath} (type: ${typeof filePath}, length: ${filePath.length})`)

          // Store the file path in body
          if (item.name === 'image_input') {
            if (!body.image_input) body.image_input = []
            body.image_input.push(filePath)
            console.log(`[Generate Image] Added file path to image_input array. Array length: ${body.image_input.length}`)
          }
        } else if (item.name) {
          // It's a form field
          const value = item.data.toString('utf-8')
          console.log(`[Generate Image] Form field: ${item.name} = ${value}`)
          
          // Try to parse numbers and booleans
          if (item.name === 'width' || item.name === 'height' || item.name === 'max_images') {
            body[item.name] = Number(value)
          } else if (item.name === 'enhance_prompt') {
            body[item.name] = value === 'true'
          } else if (item.name === 'image_input') {
            // Handle array of image URLs (if passed as strings)
            if (!body.image_input) body.image_input = []
            if (value) body.image_input.push(value)
          } else {
            body[item.name] = value
          }
        }
      }
    } else {
      // Regular JSON body
      try {
        body = await readBody(event)
        console.log('[Generate Image] JSON body received:', Object.keys(body))
      } catch (bodyError: any) {
        console.error('[Generate Image] Failed to read body:', bodyError.message)
        throw createError({
          statusCode: 400,
          message: `Failed to parse request body: ${bodyError.message}`,
        })
      }
    }

    console.log('[Generate Image] Parsed body:', JSON.stringify(body, null, 2))

    // Validate required fields
    if (!body.prompt) {
      console.error('[Generate Image] Missing required field: prompt')
      throw createError({
        statusCode: 400,
        message: 'Prompt is required',
      })
    }

    // Prepare image inputs - upload to Replicate if they're local files
    let imageInputUrls: string[] | undefined
    if (body.image_input && Array.isArray(body.image_input) && body.image_input.length > 0) {
      console.log(`[Generate Image] Processing ${body.image_input.length} input images`)
      if (body.image_input.length > 10) {
        throw createError({
          statusCode: 400,
          message: 'Maximum 10 input images allowed',
        })
      }

      // Upload each image to Replicate to get public URLs
      try {
        imageInputUrls = await Promise.all(
          body.image_input.map(async (img: string, index: number) => {
            // Validate the path before uploading
            console.log(`[Generate Image] Uploading image ${index + 1}/${body.image_input.length}`)
            console.log(`[Generate Image] Image path type: ${typeof img}, length: ${img?.length}`)
            console.log(`[Generate Image] Image path (first 200 chars): ${img?.substring(0, 200)}`)
            
            // Check for binary data corruption
            if (typeof img !== 'string') {
              console.error(`[Generate Image] ERROR: Image path is not a string:`, typeof img, img)
              console.error(`[Generate Image] Image value:`, JSON.stringify(img))
              throw new Error(`Invalid image path at index ${index}: not a string`)
            }
            
            // Log the path for debugging
            console.log(`[Generate Image] Validating path at index ${index}:`)
            console.log(`[Generate Image] Path type: ${typeof img}`)
            console.log(`[Generate Image] Path length: ${img.length}`)
            console.log(`[Generate Image] Path value: ${img}`)
            
            // Use the same validation logic as uploadFileToReplicate
            // Check if it's a valid path first before checking for binary data
            const isAbsolutePath = path.isAbsolute(img)
            const isRelativePath = img.includes('/') || img.includes('\\') || img.startsWith('./') || img.startsWith('../')
            const looksLikePath = isAbsolutePath || isRelativePath || img.match(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/)
            
            // Only check for binary data if it doesn't look like a valid path
            if (!looksLikePath) {
              const hasNullBytes = img.includes('\x00')
              const containsJpegMarkers = img.includes('JFIF') || img.includes('Exif') || img.includes('JPEG')
              const startsWithNonPrintable = img.length > 0 && img.charCodeAt(0) < 32 && img.charCodeAt(0) !== 9 && img.charCodeAt(0) !== 10 && img.charCodeAt(0) !== 13
              
              if (hasNullBytes || (startsWithNonPrintable && !img.startsWith('/')) || containsJpegMarkers) {
                console.error(`[Generate Image] ERROR: Image path contains binary data at index ${index}`)
                console.error(`[Generate Image] Full path value:`, JSON.stringify(img))
                throw new Error(`Invalid image path at index ${index}: contains binary data`)
              }
            } else {
              console.log(`[Generate Image] Path looks valid (absolute: ${isAbsolutePath}, relative: ${isRelativePath})`)
            }
            
            return await uploadFileToReplicate(img)
          })
        )
        console.log(`[Generate Image] Successfully uploaded ${imageInputUrls.length} images`)
      } catch (uploadError: any) {
        console.error('[Generate Image] Error uploading images:', uploadError)
        console.error('[Generate Image] Upload error stack:', uploadError.stack)
        throw createError({
          statusCode: 500,
          message: `Failed to upload images: ${uploadError.message}`,
        })
      }
    }

    // Get model from body (default to seedream for backward compatibility)
    const model = body.model || 'bytedance/seedream-4'

    // Build parameters for Replicate MCP call
    const params: any = {
      model,
      prompt: body.prompt,
    }

    // Add image inputs if any
    if (imageInputUrls && imageInputUrls.length > 0) {
      params.image_input = imageInputUrls
    }

    // Add model-specific parameters
    if (model === 'bytedance/seedream-4') {
      params.size = body.size || '2K'
      params.aspect_ratio = body.aspect_ratio || 'match_input_image'
      params.width = body.width || 2048
      params.height = body.height || 2048
      params.sequential_image_generation = body.sequential_image_generation || 'disabled'
      params.max_images = body.max_images || 1
      params.enhance_prompt = body.enhance_prompt !== undefined ? body.enhance_prompt : true
    } else if (model === 'google/nano-banana') {
      params.aspect_ratio = body.aspect_ratio || 'match_input_image'
      params.output_format = body.output_format || 'jpg'
    }

    console.log('[Generate Image] Calling Replicate MCP generate_image with params:', JSON.stringify(params, null, 2))
    
    // Call Replicate MCP to generate image
    const result = await callReplicateMCP('generate_image', params)
    
    console.log('[Generate Image] Replicate MCP generate_image response:', JSON.stringify(result, null, 2))

    // Handle response - it might be a string that needs parsing
    let parsedResult = result
    if (typeof result === 'string') {
      try {
        parsedResult = JSON.parse(result)
      } catch (e) {
        // If it's not JSON, use as-is
      }
    }

    // Return prediction ID for polling
    const predictionId = parsedResult?.predictionId || parsedResult?.id
    if (!predictionId) {
      console.error('[Generate Image] No prediction ID in response:', JSON.stringify(parsedResult, null, 2))
      throw createError({
        statusCode: 500,
        message: 'Failed to get prediction ID from Replicate',
      })
    }

    return {
      predictionId,
      status: parsedResult?.status || 'starting',
    }
  } catch (error: any) {
    console.error('[Generate Image] Error:', error)
    console.error('[Generate Image] Error stack:', error.stack)
    console.error('[Generate Image] Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      name: error.name,
    })
    
    // Return a more detailed error message to help debug
    const errorMessage = error.message || 'Failed to generate image'
    const statusCode = error.statusCode || 500
    
    throw createError({
      statusCode,
      message: errorMessage,
      data: {
        originalError: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    })
  }
})

