import { z } from 'zod'

export const parsePromptSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.string().optional(), // Video model ID
  duration: z.number().min(1).max(180).optional(), // Allow shorter durations for models like Veo 3.1 (4, 6, 8s) and Hailuo (3, 5, 10s)
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  style: z.string().min(1),
  mode: z.enum(['demo', 'production']).optional(),
  // Veo 3.1 fields
  image: z.string().optional().nullable(),
  lastFrame: z.string().optional().nullable(),
  referenceImages: z.array(z.string()).max(3).optional(),
  negativePrompt: z.string().optional().nullable(),
  resolution: z.string().optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional().nullable(),
  // Legacy fields for other models
  firstFrameImage: z.string().optional().nullable(),
  subjectReference: z.string().optional().nullable(),
  inputImage: z.string().optional().nullable(), // Generic image input for some models
})

export const planStoryboardSchema = z.object({
  parsed: z.object({
    product: z.string(),
    targetAudience: z.string(),
    mood: z.string(),
    keyMessages: z.array(z.string()),
    visualStyle: z.string(),
    callToAction: z.string(),
    meta: z.object({
      duration: z.number(),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      style: z.string(),
      mood: z.string().optional(), // Video tone/mood
      mode: z.enum(['demo', 'production']).optional(),
      // Veo 3.1 fields
      image: z.string().optional().nullable(),
      lastFrame: z.string().optional().nullable(),
      referenceImages: z.array(z.string()).max(3).optional(),
      negativePrompt: z.string().optional().nullable(),
      resolution: z.string().optional(),
      generateAudio: z.boolean().optional(),
      seed: z.number().int().optional().nullable(),
      // Legacy fields for other models
      firstFrameImage: z.string().optional().nullable(),
      subjectReference: z.string().optional().nullable(),
      model: z.string().optional(), // Video model ID
    }),
  }),
})

export const generateAssetsSchema = z.object({
  storyboard: z.object({
    id: z.string(),
    segments: z.array(
      z.object({
        type: z.enum(['hook', 'body', 'cta']),
        description: z.string(),
        startTime: z.number(),
        endTime: z.number(),
        visualPrompt: z.string(),
        audioNotes: z.string().optional(),
        firstFrameImage: z.string().optional(),
        subjectReference: z.string().optional(),
        // Veo 3.1 segment-specific fields
        image: z.string().optional().nullable(),
        lastFrame: z.string().optional().nullable(),
        referenceImages: z.array(z.string()).max(3).optional().nullable(),
        negativePrompt: z.string().optional().nullable(),
        resolution: z.string().optional().nullable(),
        generateAudio: z.boolean().optional().nullable(),
        seed: z.number().int().optional().nullable(),
        duration: z.number().int().optional().nullable(),
        aspectRatio: z.string().optional().nullable(),
        selectedPromptIndex: z.number().optional(),
        visualPromptAlternatives: z.array(z.string()).optional(),
      }).passthrough() // Allow additional fields to pass through
    ),
    meta: z.object({
      duration: z.number(),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      style: z.string().optional(), // Legacy field, use mood instead
      mood: z.string().optional(), // Video tone/mood
      mode: z.enum(['demo', 'production']).optional(),
      // Veo 3.1 fields
      image: z.string().optional().nullable(),
      lastFrame: z.string().optional().nullable(),
      referenceImages: z.array(z.string()).max(3).optional(),
      negativePrompt: z.string().optional().nullable(),
      resolution: z.string().optional(),
      generateAudio: z.boolean().optional(),
      seed: z.number().int().optional().nullable(),
      // Legacy fields for other models
      firstFrameImage: z.string().optional().nullable(),
      subjectReference: z.string().optional().nullable(),
      model: z.string().optional(), // Video model ID
    }),
  }),
  frames: z.array(z.object({
    segmentIndex: z.number(),
    frameType: z.enum(['first', 'last']),
    imageUrl: z.string(),
  })).optional(),
})

export const composeVideoSchema = z.object({
  clips: z.array(
    z.object({
      videoUrl: z.string().url(),
      voiceUrl: z.string().url().optional(),
      startTime: z.number(),
      endTime: z.number(),
      type: z.string(),
    })
  ),
  options: z.object({
    transition: z.enum(['fade', 'dissolve', 'wipe', 'none']),
    musicVolume: z.number().min(0).max(100),
    backgroundMusicUrl: z.string().url().optional(),
    aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional(),
  }),
})

export const exportFormatSchema = z.object({
  videoUrl: z.string().url(),
  format: z.enum(['webm', 'gif', 'hls']),
})

