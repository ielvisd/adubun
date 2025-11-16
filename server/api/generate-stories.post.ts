import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { trackCost } from '../utils/cost-tracker'
import { uploadFileToS3 } from '../utils/s3-upload'
import { saveAsset, deleteFile } from '../utils/storage'

const generateStoriesSchema = z.object({
  prompt: z.string().min(1),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).max(10).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  model: z.string().optional(),
  generateVoiceover: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    let body: any = {}

    // Parse form data
    if (formData) {
      for (const item of formData) {
        if (item.name === 'prompt') {
          body.prompt = item.data.toString()
        } else if (item.name === 'aspectRatio') {
          body.aspectRatio = item.data.toString()
        } else if (item.name === 'model') {
          body.model = item.data.toString()
        } else if (item.name === 'generateVoiceover') {
          body.generateVoiceover = item.data.toString() === 'true'
        } else if (item.name === 'productImages' && item.filename && item.data) {
          if (!body.productImages) {
            body.productImages = []
          }
          // Save file temporarily and upload to S3
          const extension = item.filename.split('.').pop() || 'jpg'
          const tempPath = await saveAsset(Buffer.from(item.data), extension)
          const s3Url = await uploadFileToS3(tempPath)
          body.productImages.push(s3Url)
          // Clean up temp file
          await deleteFile(tempPath)
        }
      }
    } else {
      // Try reading as JSON body
      body = await readBody(event)
    }

    const { prompt, productImages = [], aspectRatio, model, generateVoiceover } = generateStoriesSchema.parse(body)

    // Convert product images to URLs (they should already be URLs if from formData, or File objects)
    const imageUrls: string[] = []
    for (const img of productImages) {
      if (typeof img === 'string') {
        imageUrls.push(img)
      } else if (img instanceof File) {
        // This shouldn't happen if we processed formData correctly, but handle it
        const buffer = Buffer.from(await img.arrayBuffer())
        const extension = img.name.split('.').pop() || 'jpg'
        const tempPath = await saveAsset(buffer, extension)
        const s3Url = await uploadFileToS3(tempPath)
        imageUrls.push(s3Url)
        await deleteFile(tempPath)
      }
    }

    // Track cost
    await trackCost('generate-stories', 0.003, { prompt, imageCount: imageUrls.length })

    // Calculate duration based on aspect ratio (PRD mentions ~16 seconds for typical ad)
    // For now, use 16 seconds as default
    const duration = 16

    // Generate 3 story options using OpenAI MCP with gpt-4o
    const storiesData = await callOpenAIMCP('generate_ad_stories', {
      prompt,
      imageUrls,
      duration,
      clipCount: 4, // Hook, Body1, Body2, CTA
      clipDuration: 4, // ~4 seconds per scene for 16s total
    })

    // callOpenAIMCP already parses JSON, so storiesData should be an object
    // Handle both direct object and content array formats
    let data = storiesData
    if (storiesData.content && Array.isArray(storiesData.content) && storiesData.content[0]?.text) {
      data = JSON.parse(storiesData.content[0].text)
    } else if (typeof storiesData === 'string') {
      data = JSON.parse(storiesData)
    }

    // Validate and format stories
    const stories = Array.isArray(data.stories) ? data.stories : (Array.isArray(data) ? data : [])

    // Ensure we have exactly 3 stories with the correct structure
    const formattedStories = stories.slice(0, 3).map((story: any, index: number) => {
      return {
        id: story.id || `story-${index + 1}`,
        description: story.description || `${story.hook || ''} ${story.bodyOne || ''} ${story.bodyTwo || ''} ${story.callToAction || ''}`.trim(),
        emoji: story.emoji || '',
        hook: story.hook || story.hookText || '',
        bodyOne: story.bodyOne || story.body1 || story.body_one || '',
        bodyTwo: story.bodyTwo || story.body2 || story.body_two || '',
        callToAction: story.callToAction || story.cta || story.call_to_action || '',
      }
    })

    // If we don't have 3 stories, throw error (don't generate placeholders)
    if (formattedStories.length < 3) {
      throw new Error(`Expected 3 stories, but only received ${formattedStories.length}`)
    }

    return {
      stories: formattedStories.slice(0, 3),
      promptData: {
        prompt,
        productImages: imageUrls,
        aspectRatio,
        model: model || 'google/veo-3-fast',
        generateVoiceover: generateVoiceover || false,
      },
    }
  } catch (error: any) {
    console.error('[Generate Stories] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate stories',
    })
  }
})
