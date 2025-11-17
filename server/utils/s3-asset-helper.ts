/**
 * Helper functions for downloading assets from external sources (Replicate)
 * and uploading them to S3 with proper folder organization
 */

import { uploadFileToS3 } from './s3-upload'
import { saveAsset } from './storage'
import { nanoid } from 'nanoid'

/**
 * Download an image from a URL and upload to S3
 * @param imageUrl - Source image URL (e.g., from Replicate)
 * @param folder - S3 folder (e.g., 'scene_images', 'product_images')
 * @returns S3 presigned URL
 */
export async function downloadAndUploadImageToS3(
  imageUrl: string,
  folder: string = 'scene_images'
): Promise<string> {
  try {
    console.log(`[S3 Asset Helper] Downloading image from: ${imageUrl}`)
    
    // Download from source
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer())
    const fileSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2)
    console.log(`[S3 Asset Helper] Downloaded ${fileSizeMB} MB`)
    
    // Determine file extension from URL or content-type
    const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg'
    
    // Save temporarily
    const tempPath = await saveAsset(imageBuffer, ext)
    
    // Upload to S3 in specified folder
    const s3Url = await uploadFileToS3(tempPath, folder)
    console.log(`[S3 Asset Helper] Uploaded to S3 (${folder}/):`, s3Url)
    
    return s3Url
  } catch (error: any) {
    console.error(`[S3 Asset Helper] Failed to download/upload image:`, error.message)
    // Return original URL as fallback
    return imageUrl
  }
}

/**
 * Download a video from a URL and upload to S3
 * @param videoUrl - Source video URL (e.g., from Replicate)
 * @param folder - S3 folder (default: 'ai_videos')
 * @param filename - Optional custom filename
 * @returns S3 presigned URL
 */
export async function downloadAndUploadVideoToS3(
  videoUrl: string,
  folder: string = 'ai_videos',
  filename?: string
): Promise<string> {
  try {
    console.log(`[S3 Asset Helper] Downloading video from: ${videoUrl}`)
    
    // Download from source
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`)
    }
    
    const videoBuffer = Buffer.from(await response.arrayBuffer())
    const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2)
    console.log(`[S3 Asset Helper] Downloaded ${fileSizeMB} MB`)
    
    // Save temporarily
    const ext = 'mp4'
    const tempFilename = filename || `${nanoid()}.${ext}`
    const tempPath = await saveAsset(videoBuffer, ext)
    
    // Upload to S3 in specified folder
    const s3Url = await uploadFileToS3(tempPath, folder)
    console.log(`[S3 Asset Helper] Uploaded to S3 (${folder}/):`, s3Url)
    
    return s3Url
  } catch (error: any) {
    console.error(`[S3 Asset Helper] Failed to download/upload video:`, error.message)
    // Return original URL as fallback
    return videoUrl
  }
}

/**
 * Batch download and upload multiple images to S3
 * @param imageUrls - Array of source image URLs
 * @param folder - S3 folder
 * @returns Array of S3 URLs (or original URLs if upload failed)
 */
export async function batchDownloadAndUploadImagesToS3(
  imageUrls: string[],
  folder: string = 'scene_images'
): Promise<string[]> {
  console.log(`[S3 Asset Helper] Batch uploading ${imageUrls.length} images to ${folder}/`)
  
  const results = await Promise.allSettled(
    imageUrls.map(url => downloadAndUploadImageToS3(url, folder))
  )
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      console.error(`[S3 Asset Helper] Failed to upload image ${index}:`, result.reason)
      return imageUrls[index] // Fallback to original URL
    }
  })
}

