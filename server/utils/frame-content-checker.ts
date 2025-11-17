/**
 * Utility to check if frame images contain children/minors
 * Uses OpenAI Vision API to analyze images for content moderation
 */

/**
 * Checks if an image contains children, kids, toddlers, or minors
 * @param imageUrl - URL or path to the image to analyze
 * @returns Promise<boolean> - true if children detected, false otherwise
 */
export async function checkFrameForChildren(imageUrl: string): Promise<boolean> {
  if (!imageUrl) {
    console.warn('[Frame Content Checker] No image URL provided')
    return false
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Frame Content Checker] OPENAI_API_KEY not set, skipping content check')
    return false
  }

  try {
    // Convert image URL to base64 if needed
    let imageBase64: string
    let imageMimeType: string = 'image/jpeg'

    // If it's already a data URL, extract the base64 part
    if (imageUrl.startsWith('data:image/')) {
      const match = imageUrl.match(/data:image\/([^;]+);base64,(.+)/)
      if (match) {
        imageMimeType = `image/${match[1]}`
        imageBase64 = match[2]
      } else {
        console.error('[Frame Content Checker] Invalid data URL format')
        return false
      }
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // Fetch image from URL and convert to base64
      const response = await fetch(imageUrl)
      if (!response.ok) {
        console.error(`[Frame Content Checker] Failed to fetch image: ${response.status} ${response.statusText}`)
        return false
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      imageBase64 = buffer.toString('base64')
      
      // Try to determine MIME type from response headers
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.startsWith('image/')) {
        imageMimeType = contentType
      }
    } else {
      // Assume it's a file path - read from filesystem
      const fs = await import('fs/promises')
      const path = await import('path')
      
      // Check if file exists
      try {
        await fs.access(imageUrl)
      } catch {
        // Try relative to data directory
        const dataDir = process.env.MCP_FILESYSTEM_ROOT || './data'
        const fullPath = path.join(dataDir, imageUrl)
        try {
          await fs.access(fullPath)
          imageUrl = fullPath
        } catch {
          console.error(`[Frame Content Checker] Image file not found: ${imageUrl}`)
          return false
        }
      }
      
      const fileBuffer = await fs.readFile(imageUrl)
      imageBase64 = fileBuffer.toString('base64')
      
      // Determine MIME type from file extension
      const ext = path.extname(imageUrl).toLowerCase()
      if (ext === '.png') imageMimeType = 'image/png'
      else if (ext === '.gif') imageMimeType = 'image/gif'
      else if (ext === '.webp') imageMimeType = 'image/webp'
    }

    // Call OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use mini for cost efficiency
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Does this image contain any children, kids, toddlers, or minors? Respond with only "yes" or "no".',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 10,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Frame Content Checker] OpenAI API error: ${response.status} ${response.statusText}`, errorText)
      return false
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim()

    if (!answer) {
      console.warn('[Frame Content Checker] No answer from OpenAI API')
      return false
    }

    const containsChildren = answer === 'yes' || answer.startsWith('yes')
    
    if (containsChildren) {
      console.warn(`[Frame Content Checker] Children detected in image: ${imageUrl}`)
    } else {
      console.log(`[Frame Content Checker] No children detected in image: ${imageUrl}`)
    }

    return containsChildren
  } catch (error: any) {
    console.error('[Frame Content Checker] Error checking image:', error.message)
    // On error, assume no children (fail open) to avoid blocking generation
    return false
  }
}

/**
 * Checks multiple frame images for children
 * @param frameImages - Array of image URLs to check
 * @returns Promise<{ imageUrl: string; containsChildren: boolean }[]> - Results for each image
 */
export async function checkFramesForChildren(
  frameImages: string[]
): Promise<Array<{ imageUrl: string; containsChildren: boolean }>> {
  if (!frameImages || frameImages.length === 0) {
    return []
  }

  // Check all images in parallel for efficiency
  const results = await Promise.all(
    frameImages.map(async (imageUrl) => ({
      imageUrl,
      containsChildren: await checkFrameForChildren(imageUrl),
    }))
  )

  return results
}

