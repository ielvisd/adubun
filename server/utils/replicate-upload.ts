import { promises as fs } from 'fs'
import path from 'path'
import { uploadFileToS3 } from './s3-upload'

/**
 * Get a public URL for a local file to use with Replicate
 * Uploads the file to S3 and returns a public URL
 */
export async function uploadFileToReplicate(filePath: string): Promise<string> {
  // If it's already a URL, return as-is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath
  }

  // Validate file path - check for binary data corruption
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`Invalid file path: path is ${typeof filePath}`)
  }

  // Check for binary data corruption (null bytes, non-printable characters at start)
  const hasNullBytes = filePath.includes('\x00')
  const startsWithNonPrintable = filePath.length > 0 && filePath.charCodeAt(0) < 32 && filePath.charCodeAt(0) !== 9 && filePath.charCodeAt(0) !== 10 && filePath.charCodeAt(0) !== 13
  const containsJpegMarkers = filePath.includes('JFIF') || filePath.includes('Exif') || filePath.includes('JPEG')
  
  // If it looks like binary data, it's corrupted
  if (hasNullBytes || (startsWithNonPrintable && !filePath.startsWith('/')) || containsJpegMarkers) {
    console.error('[Replicate Upload] ERROR: File path appears to be corrupted binary data:', filePath.substring(0, 100))
    throw new Error(`Invalid file path: path appears to contain binary data instead of a valid file path`)
  }

  // Validate it looks like a valid path
  if (filePath.length < 3) {
    throw new Error(`Invalid file path: path too short (${filePath.length} chars)`)
  }

  // Check if path contains valid path characters (basic validation)
  if (!filePath.match(/^[\/\\]|^[a-zA-Z]:[\\\/]/) && !path.isAbsolute(filePath)) {
    // If it doesn't start with a path separator and isn't absolute, it might be corrupted
    console.warn('[Replicate Upload] WARNING: File path does not look like a valid path:', filePath.substring(0, 100))
  }

  try {
    // Verify file exists
    await fs.access(filePath)

    // Check if S3 is configured
    if (process.env.AWS_S3_BUCKET_NAME) {
      // Upload to S3 and get public URL
      return await uploadFileToS3(filePath)
    }

    // Fallback: Use local asset serving endpoint (only works if server is publicly accessible)
    const filename = path.basename(filePath)
    const config = useRuntimeConfig()
    const baseUrl = config.public.appUrl || 'http://localhost:3000'
    
    // Check if baseUrl is localhost - if so, Replicate won't be able to access it
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      console.warn('[Replicate Upload] WARNING: Using localhost URL - Replicate may not be able to access it')
      console.warn('[Replicate Upload] Configure AWS S3 by setting AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY')
    }
    
    // Use our own asset serving endpoint
    // Format: http://your-domain.com/api/assets/filename
    const publicUrl = `${baseUrl}/api/assets/${filename}`
    
    console.log('[Replicate Upload] Using asset URL (fallback):', publicUrl)
    return publicUrl
    
  } catch (error: any) {
    console.error('[Replicate Upload] Failed to get file URL:', filePath, error)
    throw new Error(`Failed to get file URL: ${error.message}`)
  }
}
