import { z } from 'zod'

export const parsePromptSchema = z.object({
  prompt: z.string().min(10).max(1000),
  duration: z.number().min(15).max(180),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  style: z.string().min(1),
  mode: z.enum(['demo', 'production']).optional(),
  firstFrameImage: z.string().optional().nullable(),
  subjectReference: z.string().optional().nullable(),
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
      mode: z.enum(['demo', 'production']).optional(),
      firstFrameImage: z.string().optional().nullable(),
      subjectReference: z.string().optional().nullable(),
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
      })
    ),
    meta: z.object({
      duration: z.number(),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      style: z.string(),
      mode: z.enum(['demo', 'production']).optional(),
      firstFrameImage: z.string().optional().nullable(),
      subjectReference: z.string().optional().nullable(),
    }),
  }),
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
  }),
})

export const exportFormatSchema = z.object({
  videoUrl: z.string().url(),
  format: z.enum(['webm', 'gif', 'hls']),
})

