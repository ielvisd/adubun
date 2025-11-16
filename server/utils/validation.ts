import { z } from 'zod'

// NEW: Story validation schema
export const storySchema = z.object({
  id: z.number().int().min(1).max(3),
  title: z.string().min(5).max(100),
  narrative: z.string().min(20).max(500),
  emotionalArc: z.string().min(10).max(100),
  keyBeats: z.array(z.string()).min(3).max(5),
  targetAudience: z.string().min(5).max(200),
  rationale: z.string().min(20).max(300),
})

// NEW: Brand info validation schema
export const brandInfoSchema = z.object({
  colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).optional(),
  logoUrl: z.string().url().optional(),
  tagline: z.string().max(100).optional(),
})

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
  // NEW: Product images (1-10 images required)
  productImages: z.array(z.string().url()).min(1).max(10).optional(),
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
      // NEW: Story and product fields
      story: storySchema.optional(),
      originalPrompt: z.string().optional(),
      productImages: z.array(z.string().url()).min(1).max(10).optional(),
      productName: z.string().optional(),
      brandInfo: brandInfoSchema.optional(),
    }),
  }),
  // NEW: Selected story can be passed separately
  selectedStory: storySchema.optional(),
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
        // NEW: Keyframe fields
        firstFrameUrl: z.string().url().optional(),
        lastFrameUrl: z.string().url().optional(),
        enhancedPrompt: z.string().optional(),
        keyframesGeneratedAt: z.number().optional(),
        keyframeStatus: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
        keyframeError: z.string().optional(),
      }).passthrough() // Allow additional fields to pass through
    ),
    meta: z.object({
      duration: z.number(),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']),
      style: z.string(),
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
      // NEW: Story and product fields
      story: storySchema.optional(),
      originalPrompt: z.string().optional(),
      productImages: z.array(z.string().url()).min(1).max(10).optional(),
      productName: z.string().optional(),
      brandInfo: brandInfoSchema.optional(),
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

// NEW: Generate stories validation schema
export const generateStoriesSchema = z.object({
  parsed: z.object({
    product: z.string().min(1),
    targetAudience: z.string().min(1),
    mood: z.string().min(1),
    keyMessages: z.array(z.string()).min(1),
    visualStyle: z.string().min(1),
    callToAction: z.string().min(1),
  }),
  productImages: z.array(z.string()).min(0).max(10).optional(),
})

