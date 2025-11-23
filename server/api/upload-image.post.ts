import { readMultipartFormData } from 'h3'
import { saveAsset } from '../../utils/storage'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({ statusCode: 400, message: 'No file uploaded' })
    }

    const imageFile = formData.find(field => field.name === 'image')
    if (!imageFile || !imageFile.data) {
      throw createError({ statusCode: 400, message: 'No image file found' })
    }

    // Validate file type
    if (!imageFile.filename?.match(/\.(jpg|jpeg|png|webp)$/i)) {
      throw createError({ statusCode: 400, message: 'Invalid image format' })
    }

    const buffer = Buffer.from(imageFile.data)
    const ext = path.extname(imageFile.filename || '.jpg').replace('.', '')
    
    const savedPath = await saveAsset(buffer, ext)
    const assetId = path.basename(savedPath)
    
    // Construct public URL (assuming /api/assets is serving these)
    // If using storage util, it usually saves to data/assets. 
    // We need to make sure there's a route serving them or we return a full URL if configured.
    // For now, we'll return the /api/assets/ route which should be handled by a server route
    const url = `/api/assets/${assetId}`

    return { success: true, url }
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload image'
    })
  }
})

