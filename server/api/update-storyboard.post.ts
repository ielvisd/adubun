import { z } from 'zod'
import { readStoryboard, saveStoryboard } from '../utils/storage'

const updateStoryboardSchema = z.object({
  storyboardId: z.string().min(1),
  segments: z.array(z.object({
    type: z.enum(['hook', 'body', 'cta']),
    description: z.string().optional(),
    visualPrompt: z.string().optional(),
    audioNotes: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
  })).optional(),
  voiceoverScript: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const validated = updateStoryboardSchema.parse(body)

    // Read existing storyboard
    const storyboard = await readStoryboard(validated.storyboardId)

    if (!storyboard) {
      throw createError({
        statusCode: 404,
        message: 'Storyboard not found',
      })
    }

    // Update segments if provided
    if (validated.segments && Array.isArray(validated.segments)) {
      validated.segments.forEach((updatedSegment, index) => {
        if (storyboard.segments[index]) {
          // Update only provided fields
          if (updatedSegment.description !== undefined) {
            storyboard.segments[index].description = updatedSegment.description
          }
          if (updatedSegment.visualPrompt !== undefined) {
            storyboard.segments[index].visualPrompt = updatedSegment.visualPrompt
          }
          if (updatedSegment.audioNotes !== undefined) {
            storyboard.segments[index].audioNotes = updatedSegment.audioNotes
          }
          if (updatedSegment.startTime !== undefined) {
            storyboard.segments[index].startTime = updatedSegment.startTime
          }
          if (updatedSegment.endTime !== undefined) {
            storyboard.segments[index].endTime = updatedSegment.endTime
          }
        }
      })
    }

    // Update voiceover script if provided (store in meta or as separate field)
    if (validated.voiceoverScript !== undefined) {
      if (!storyboard.meta) {
        storyboard.meta = {}
      }
      storyboard.meta.voiceoverScript = validated.voiceoverScript
    }

    // Update timestamp
    storyboard.updatedAt = Date.now()

    // Save updated storyboard
    await saveStoryboard(storyboard)

    return {
      success: true,
      storyboard,
    }
  } catch (error: any) {
    console.error('Update storyboard error:', error)
    
    if (error.name === 'ZodError') {
      throw createError({
        statusCode: 400,
        message: 'Invalid request data',
        data: {
          errors: error.errors,
        },
      })
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update storyboard',
    })
  }
})
