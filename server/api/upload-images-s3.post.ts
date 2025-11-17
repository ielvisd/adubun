import { uploadFileToS3 } from '../utils/s3-upload'

export default defineEventHandler(async (event) => {
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
        // Save file temporarily
        const { saveAsset } = await import('../utils/storage')
        const extension = file.filename.split('.').pop() || 'jpg'
        const tempPath = await saveAsset(Buffer.from(file.data), extension)
        
      // Upload to S3 in product_images folder
      const s3Url = await uploadFileToS3(tempPath, 'product_images')
      uploadedUrls.push(s3Url)
        
        // Clean up temp file
        const { deleteFile } = await import('../utils/storage')
        await deleteFile(tempPath)
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


