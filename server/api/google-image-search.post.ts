// Extract product name from ad description
// Generate mock images for development/demo when API credentials are not available
function generateMockImages(productQuery: string, count: number): any[] {
  // Use Unsplash Source API for placeholder images (free, no API key required)
  // These are high-quality placeholder images that can be used for development
  const baseUrl = 'https://source.unsplash.com/featured'
  const keywords = productQuery.toLowerCase().replace(/\s+/g, ',')
  
  const mockImages: any[] = []
  for (let i = 0; i < count; i++) {
    // Use Unsplash Source API with different seeds to get varied images
    // Format: https://source.unsplash.com/featured/{width}x{height}/?{keywords}
    // Using 9:16 aspect ratio (1080x1920 for high quality)
    const width = 1080
    const height = 1920
    const seed = i + Date.now() // Add seed for variety
    
    mockImages.push({
      url: `https://source.unsplash.com/featured/${width}x${height}/?${encodeURIComponent(keywords)}&sig=${seed}`,
      thumbnailUrl: `https://source.unsplash.com/featured/400x711/?${encodeURIComponent(keywords)}&sig=${seed}`,
      title: `${productQuery} - Image ${i + 1}`,
      width: width,
      height: height,
      contextUrl: `https://unsplash.com/s/photos/${encodeURIComponent(keywords)}`,
    })
  }
  
  return mockImages
}

function extractProductFromDescription(description: string): string {
  // Common patterns to extract product names
  const patterns = [
    // "make me an ad for [product]"
    /(?:make|create|generate).*?(?:ad|commercial|video).*?(?:for|about|of)\s+([^.!?]+?)(?:\s|$|\.|!|\?)/i,
    // "ad for [product]"
    /(?:ad|commercial|video).*?(?:for|about|of)\s+([^.!?]+?)(?:\s|$|\.|!|\?)/i,
    // "[product] ad"
    /^([^.!?]+?)\s+(?:ad|commercial|video)/i,
    // "promote [product]"
    /(?:promote|advertise|showcase).*?([^.!?]+?)(?:\s|$|\.|!|\?)/i,
  ]

  for (const pattern of patterns) {
    const match = description.match(pattern)
    if (match && match[1]) {
      let product = match[1].trim()
      // Clean up common words
      product = product.replace(/\b(a|an|the|for|about|of|with|and|or)\b/gi, '').trim()
      // Remove extra whitespace
      product = product.replace(/\s+/g, ' ')
      if (product.length > 2) {
        return product
      }
    }
  }

  // Fallback: try to find brand/product names (capitalized words)
  const capitalizedWords = description.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)
  if (capitalizedWords && capitalizedWords.length > 0) {
    // Return the first significant capitalized phrase (likely a brand/product)
    for (const word of capitalizedWords) {
      if (word.length > 3 && !['The', 'This', 'That', 'These', 'Those'].includes(word)) {
        return word
      }
    }
  }

  // Last resort: return first few words of description
  const words = description.trim().split(/\s+/).slice(0, 5).join(' ')
  return words
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { query } = body

    if (!query || typeof query !== 'string') {
      throw createError({
        statusCode: 400,
        message: 'Search query is required',
      })
    }

    // Extract product name from the ad description
    const productQuery = extractProductFromDescription(query)

    // Use Google Custom Search API
    const apiKey = process.env.GOOGLE_IMAGE_KEY
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

    // Development mode: Return mock images if API credentials are not configured
    if (!apiKey || !searchEngineId) {
      // Generate mock images based on the product query for development/demo purposes
      const mockImages = generateMockImages(productQuery, 24)
      return {
        images: mockImages,
        count: mockImages.length,
        source: 'mock',
      }
    }

    // Verify API key and search engine ID are not empty strings
    if (apiKey.trim() === '' || searchEngineId.trim() === '') {
      const mockImages = generateMockImages(productQuery, 24)
      return {
        images: mockImages,
        count: mockImages.length,
        source: 'mock',
      }
    }

    // Google Custom Search API endpoint with advanced search settings
    // Using imageSize=large for high-quality images and aspectRatio=tall for 9:16 aspect ratio
    // Note: Google Custom Search API doesn't directly support aspect ratio filtering,
    // but we can filter results by size and then filter by aspect ratio in our code
    // Use the extracted product name for the search query
    // URL encode all parameters to ensure special characters are handled correctly
    // Note: Google Custom Search API limits num to 1-10 per request
    // To get 24 images, we need to make multiple paginated requests (3 requests: start=1, start=11, start=21)
    
    const targetImageCount = 24
    const resultsPerRequest = 10
    const numberOfRequests = Math.ceil(targetImageCount / resultsPerRequest) // 3 requests for 24 images
    
    let allImages: any[] = []
    
    // Make multiple paginated requests to get more than 10 images
    for (let i = 0; i < numberOfRequests; i++) {
      const startIndex = i * resultsPerRequest + 1 // start=1, start=11, start=21
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(searchEngineId)}&q=${encodeURIComponent(productQuery)}&searchType=image&num=${resultsPerRequest}&start=${startIndex}&imgSize=large&imgType=photo&safe=active`

      const response = await fetch(url)
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Google API error: ${response.statusText}`
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error) {
            // Google API error format: { error: { message: "...", code: ..., errors: [...] } }
            const googleError = errorData.error
            if (googleError.message) {
              errorMessage = `Google API error: ${googleError.message}`
            }
            if (googleError.errors && googleError.errors.length > 0) {
              const errorDetails = googleError.errors.map((e: any) => e.message || e.reason).join(', ')
              errorMessage += ` (${errorDetails})`
            }
          }
        } catch {
          // If parsing fails, use the raw error text
          if (errorText) {
            errorMessage = `Google API error: ${errorText.substring(0, 300)}`
          }
        }
        throw createError({
          statusCode: response.status,
          message: errorMessage,
        })
      }

      const data = await response.json()
      
      // If no items in this response, break early (no more results available)
      if (!data.items || data.items.length === 0) {
        break
      }
      
      // Check for search information - Google API sometimes returns empty items array
      // even when there are results available (due to pagination limits)
      if (data.searchInformation && data.searchInformation.totalResults === '0') {
        break
      }

      // Extract image URLs and metadata
      // Use the full-size image URL (item.link) for both url and thumbnailUrl
      // Google provides different sizes: thumbnailLink (small), thumbnailLink (medium), link (full size)
      // We want high-quality images, so use the full-size link for both
      const pageImages = (data.items || []).map((item: any) => ({
        url: item.link, // Full-size image URL
        thumbnailUrl: item.link, // Use full-size URL for thumbnail too (we'll let Nuxt Image optimize)
        title: item.title,
        width: item.image?.width,
        height: item.image?.height,
        contextUrl: item.image?.contextLink,
      }))
      
      allImages = [...allImages, ...pageImages]
      
      // If we got fewer results than requested, we've reached the end
      if (data.items.length < resultsPerRequest) {
        break
      }
    }

    // Filter for 9:16 aspect ratio (approximately 0.5625, with some tolerance)
    // Also ensure images are high quality (minimum dimensions)
    const filteredImages = allImages.filter((img: any) => {
      if (!img.width || !img.height) return true // Include if dimensions unknown
      
      const aspectRatio = img.width / img.height
      const targetAspectRatio = 9 / 16 // 0.5625
      const tolerance = 0.25 // Allow 25% variance (increased from 15% for more results)
      
      // Check if aspect ratio is close to 9:16 (portrait/vertical)
      const isPortrait = aspectRatio >= (targetAspectRatio - tolerance) && 
                        aspectRatio <= (targetAspectRatio + tolerance)
      
      // Also check minimum quality (at least 720p height for 9:16)
      const minHeight = 720
      const isHighQuality = img.height >= minHeight
      
      return isPortrait && isHighQuality
    })

    // If we don't have enough filtered images, include more with relaxed criteria
    let images = filteredImages
    if (images.length < targetImageCount) {
      // Add images that are at least portrait-oriented (height > width) and high quality
      const additionalImages = allImages
        .filter((img: any) => {
          if (!img.width || !img.height) return false
          return img.height > img.width && img.height >= 720
        })
        .slice(0, targetImageCount - images.length)
      
      images = [...images, ...additionalImages]
    }
    
    // If still not enough, include any portrait images (height > width) regardless of quality
    if (images.length < targetImageCount) {
      const moreImages = allImages
        .filter((img: any) => {
          if (!img.width || !img.height) return false
          return img.height > img.width
        })
        .filter((img: any) => !images.some((existing: any) => existing.url === img.url))
        .slice(0, targetImageCount - images.length)
      
      images = [...images, ...moreImages]
    }
    
    // If still not enough, include any images with unknown dimensions or any remaining images
    if (images.length < targetImageCount) {
      const remainingImages = allImages
        .filter((img: any) => !images.some((existing: any) => existing.url === img.url))
        .slice(0, targetImageCount - images.length)
      
      images = [...images, ...remainingImages]
    }

    // Limit to target image count
    images = images.slice(0, targetImageCount)

    // If we have no images after all filtering, return at least some results
    // This ensures users always see something, even if it doesn't match the ideal criteria
    if (images.length === 0 && allImages.length > 0) {
      // Return the first images we got, even if they don't match our criteria
      images = allImages.slice(0, Math.min(targetImageCount, allImages.length))
    }

    return {
      images,
      count: images.length,
      source: 'google',
    }
  } catch (error: any) {
    console.error('[Google Image Search] Error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to search images',
    })
  }
})

