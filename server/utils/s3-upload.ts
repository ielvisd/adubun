import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'

// Initialize S3 client
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    const region = process.env.AWS_REGION || 'us-east-1'
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    console.log('[S3 Client] Initializing S3 client with:', {
      region,
      hasAccessKeyId: !!accessKeyId,
      hasSecretAccessKey: !!secretAccessKey,
      accessKeyIdLength: accessKeyId?.length,
    })

    if (!accessKeyId || !secretAccessKey) {
      const errorMsg = 'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      console.error('[S3 Client] ' + errorMsg)
      throw new Error(errorMsg)
    }

    try {
      s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
      console.log('[S3 Client] Successfully initialized S3 client')
    } catch (error: any) {
      console.error('[S3 Client] Failed to initialize S3 client:', error)
      throw error
    }
  }

  return s3Client
}

/**
 * Upload a file to S3 and return a public URL
 * @param filePath - Local file path to upload
 * @param folder - Optional S3 folder prefix (e.g., 'product_images', 'scene_images', 'ai_videos')
 */
export async function uploadFileToS3(filePath: string, folder: string = 'assets'): Promise<string> {
  try {
    console.log(`[S3 Upload] Starting upload for file: ${filePath} to folder: ${folder}`)
    
    const bucketName = process.env.AWS_S3_BUCKET_NAME
    if (!bucketName) {
      const errorMsg = 'AWS_S3_BUCKET_NAME environment variable is not set'
      console.error('[S3 Upload] ' + errorMsg)
      throw new Error(errorMsg)
    }
    
    console.log(`[S3 Upload] Target bucket: ${bucketName}`)

    // Read the file
    console.log(`[S3 Upload] Reading file from disk: ${filePath}`)
    const fileBuffer = await fs.readFile(filePath)
    console.log(`[S3 Upload] File read successfully: ${fileBuffer.length} bytes`)
    
    const filename = path.basename(filePath)
    const ext = path.extname(filename)
    
    // Generate a unique key for the file
    // Format: {folder}/{timestamp}-{random}.{ext}
    // S3 automatically creates "folders" when you use / in the key
    const key = `${folder}/${Date.now()}-${nanoid()}${ext}`
    console.log(`[S3 Upload] Generated S3 key: ${key}`)
    
    // Determine content type
    const contentType = getContentType(filename)
    console.log(`[S3 Upload] Content type: ${contentType}`)
    
    // Upload to S3
    console.log('[S3 Upload] Getting S3 client...')
    const client = getS3Client()
    
    // Don't use ACL - modern S3 buckets often have ACLs disabled
    // Instead, rely on bucket policies for public access
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      // Note: ACL removed - use bucket policy for public access instead
    })

    console.log(`[S3 Upload] Sending PutObject command to S3...`)
    const uploadResponse = await client.send(command)
    console.log(`[S3 Upload] PutObject response:`, {
      $metadata: uploadResponse.$metadata,
      ETag: uploadResponse.ETag,
    })
    
    // Always use presigned URLs (bucket doesn't allow ACLs and may not have public policy)
    // This ensures files are accessible without requiring bucket policy configuration
    // Presigned URLs work with private buckets and don't require any bucket policy changes
    console.log('[S3 Upload] Upload successful! Generating presigned URL (works with private buckets)')
    
    // Generate presigned URL (valid for 7 days - Replicate may take time to process)
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
    
    // 7 days = 604800 seconds
    console.log('[S3 Upload] Generating presigned URL (valid for 7 days)...')
    const presignedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 })
    console.log(`[S3 Upload] ✓ File uploaded to S3: ${bucketName}/${folder}/`)
    console.log('[S3 Upload] ✓ Presigned URL generated:', presignedUrl.substring(0, 100) + '...')
    return presignedUrl
  } catch (error: any) {
    console.error('[S3 Upload] ✗ Failed to upload file:', {
      filePath,
      folder,
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      stack: error.stack,
    })
    throw new Error(`Failed to upload file to S3: ${error.message}`)
  }
}

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
  }
  return contentTypes[ext || ''] || 'application/octet-stream'
}

