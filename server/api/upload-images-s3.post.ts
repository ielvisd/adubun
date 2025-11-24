import { uploadBufferToS3 } from '../utils/s3-upload'
import { getHeader, setHeader } from 'h3'

export default defineEventHandler(async (event) => {
  // Set CORS headers to allow cross-origin requests
  const origin = getHeader(event, 'origin')
  setHeader(event, 'Access-Control-Allow-Origin', origin || '*')
  setHeader(event, 'Access-Control-Allow-Methods', 'POST, OPTIONS')
  setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')
  setHeader(event, 'Access-Control-Allow-Credentials', 'true')
  
  // Handle preflight OPTIONS request
  if (event.node.req.method === 'OPTIONS') {
    return { status: 'ok' }
  }

  try {
    const formData = await readMultipartFormData(event)
    
    if (!formData) {
      throw createError({
        statusCode: 400,
        message: 'No files uploaded',
      })
    }

    const files = formData.filter(item => item.filename && item.data)
    const uploadedUrls: string[] = []

    for (const file of files) {
      if (file.data && file.filename) {
        // Convert file data to Buffer and upload directly to S3
        // This avoids filesystem writes which fail on Vercel serverless functions
        const fileBuffer = Buffer.from(file.data)
        
        // Upload directly to S3 in product_images folder
        const s3Url = await uploadBufferToS3(fileBuffer, file.filename, 'product_images')
        uploadedUrls.push(s3Url)
      }
    }

    return {
      urls: uploadedUrls,
      count: uploadedUrls.length,
    }
  } catch (error: any) {
    console.error('[Upload Images S3] Error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload images to S3',
    })
  }
})


