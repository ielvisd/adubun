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

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.')
    }

    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }

  return s3Client
}

/**
 * Upload a file to S3 and return a public URL
 */
export async function uploadFileToS3(filePath: string): Promise<string> {
  try {
    const bucketName = process.env.AWS_S3_BUCKET_NAME
    if (!bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not set')
    }

    // Read the file
    const fileBuffer = await fs.readFile(filePath)
    const filename = path.basename(filePath)
    const ext = path.extname(filename)
    
    // Generate a unique key for the file
    // Format: assets/{timestamp}-{random}.{ext}
    const key = `assets/${Date.now()}-${nanoid()}${ext}`
    
    // Determine content type
    const contentType = getContentType(filename)
    
    // Upload to S3
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

    await client.send(command)
    
    // Always use presigned URLs (bucket doesn't allow ACLs and may not have public policy)
    // This ensures files are accessible without requiring bucket policy configuration
    // Presigned URLs work with private buckets and don't require any bucket policy changes
    console.log('[S3 Upload] Generating presigned URL (works with private buckets)')
    
    // Generate presigned URL (valid for 7 days - Replicate may take time to process)
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
    
    // 7 days = 604800 seconds
    const presignedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 })
    console.log('[S3 Upload] File uploaded to S3 (presigned URL, valid for 7 days)')
    console.log('[S3 Upload] URL starts with:', presignedUrl.substring(0, 80) + '...')
    return presignedUrl
  } catch (error: any) {
    console.error('[S3 Upload] Failed to upload file:', filePath, error)
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

