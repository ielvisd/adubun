import type { VideoModel } from '~/app/types/generation'

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'google/veo-3.1',
    name: 'Google Veo 3.1',
    description: 'High-quality video generation with synchronized audio, reference image and character consistency support',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: true,
    supportsFirstFrame: true,
    supportsCustomDuration: true,
    defaultDuration: 6,
    durationOptions: [4, 6, 8],
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['first_frame_image', 'subject_reference', 'duration', 'aspect_ratio'],
  },
  {
    id: 'minimax/hailuo-ai-v2.3',
    name: 'Hailuo AI v2.3',
    description: 'Text-to-video generation with customizable duration',
    supportsTextToVideo: true,
    supportsImageToVideo: false,
    supportsCharacterReference: false,
    supportsFirstFrame: false,
    supportsCustomDuration: true,
    defaultDuration: 5,
    durationOptions: [3, 5, 10],
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['duration', 'aspect_ratio'],
  },
  {
    id: 'kwaivgi/kling-v2.5-turbo-pro',
    name: 'Kling 2.5 Turbo Pro',
    description: 'Pro-level text-to-video and image-to-video creation with smooth motion, cinematic depth, and remarkable prompt adherence',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: true,
    supportsCustomDuration: true,
    defaultDuration: 5,
    durationOptions: [5, 10],
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['image', 'duration', 'aspect_ratio'],
  },
]

export const DEFAULT_MODEL_ID = 'google/veo-3.1'

export function getModelById(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find(model => model.id === id)
}

export function getDefaultModel(): VideoModel {
  return VIDEO_MODELS.find(model => model.id === DEFAULT_MODEL_ID) || VIDEO_MODELS[0]
}

