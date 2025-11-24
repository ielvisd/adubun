import { uploadFileToS3 } from '../utils/s3-upload'

export default defineEventHandler(async (event) => {
  try {
    console.log('[Upload Images S3] Starting upload process...')
    
    // Check AWS credentials first
    const awsKeyId = process.env.AWS_ACCESS_KEY_ID
    const awsSecret = process.env.AWS_SECRET_ACCESS_KEY
    const awsBucket = process.env.AWS_S3_BUCKET_NAME
    const awsRegion = process.env.AWS_REGION || 'us-east-1'
    
    if (!awsKeyId || !awsSecret || !awsBucket) {
      console.error('[Upload Images S3] Missing AWS credentials:', {
        hasKeyId: !!awsKeyId,
        hasSecret: !!awsSecret,
        hasBucket: !!awsBucket,
        region: awsRegion,
      })
      throw createError({
        statusCode: 500,
        message: 'AWS credentials not configured on server. Please contact administrator.',
      })
    }
    
    console.log('[Upload Images S3] AWS credentials present:', {
      hasKeyId: !!awsKeyId,
      hasSecret: !!awsSecret,
      bucket: awsBucket,
      region: awsRegion,
    })
    
    const formData = await readMultipartFormData(event)
    
    if (!formData) {
      console.error('[Upload Images S3] No formData received')
      throw createError({
        statusCode: 400,
        message: 'No files uploaded',
      })
    }

    const files = formData.filter(item => item.filename && item.data)
    console.log(`[Upload Images S3] Received ${files.length} files to upload`)
    
    if (files.length === 0) {
      console.error('[Upload Images S3] No valid files in formData')
      throw createError({
        statusCode: 400,
        message: 'No valid files found in upload',
      })
    }
    
    const uploadedUrls: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.data && file.filename) {
        console.log(`[Upload Images S3] Processing file ${i + 1}/${files.length}: ${file.filename} (${file.data.length} bytes)`)
        
        try {
          // Save file temporarily
          const { saveAsset } = await import('../utils/storage')
          const extension = file.filename.split('.').pop() || 'jpg'
          console.log(`[Upload Images S3] Saving temp file with extension: ${extension}`)
          const tempPath = await saveAsset(Buffer.from(file.data), extension)
          console.log(`[Upload Images S3] Temp file saved: ${tempPath}`)
          
          // Upload to S3 in product_images folder
          console.log(`[Upload Images S3] Uploading to S3 bucket: ${awsBucket}/product_images/`)
          const s3Url = await uploadFileToS3(tempPath, 'product_images')
          console.log(`[Upload Images S3] Successfully uploaded to S3: ${s3Url.substring(0, 100)}...`)
          uploadedUrls.push(s3Url)
          
          // Clean up temp file
          const { deleteFile } = await import('../utils/storage')
          await deleteFile(tempPath)
          console.log(`[Upload Images S3] Temp file cleaned up: ${tempPath}`)
        } catch (fileError: any) {
          console.error(`[Upload Images S3] Failed to process file ${file.filename}:`, {
            error: fileError.message,
            stack: fileError.stack,
          })
          throw fileError
        }
      }
    }

    console.log(`[Upload Images S3] Upload complete: ${uploadedUrls.length} files uploaded`)
    return {
      urls: uploadedUrls,
      count: uploadedUrls.length,
    }
  } catch (error: any) {
    console.error('[Upload Images S3] Error:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      name: error.name,
    })
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to upload images to S3',
    })
  }
})


