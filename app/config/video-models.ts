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
    durationOptions: [4, 6, 8], // Veo 3.1 only supports 4, 6, or 8 seconds
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['first_frame_image', 'subject_reference', 'duration', 'aspect_ratio'],
  },
  {
    id: 'runway/gen-3-alpha-turbo',
    name: 'Runway Gen-3 Alpha Turbo',
    description: 'Fast text-to-video generation with optional image input for image-to-video',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: false,
    supportsCustomDuration: false,
    defaultDuration: 5,
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['image', 'aspect_ratio'],
  },
  {
    id: 'stability-ai/stable-video-diffusion',
    name: 'Stable Video Diffusion',
    description: 'Image-to-video generation only - requires an input image',
    supportsTextToVideo: false,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: false,
    supportsCustomDuration: false,
    defaultDuration: 4,
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['image'],
    optionalInputs: ['motion_bucket_id', 'cond_aug'],
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
    durationOptions: [3, 5, 10], // Common durations for Hailuo
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['duration', 'aspect_ratio'],
  },
  {
    id: 'anotherbyte/seedance-1.0',
    name: 'Seedance 1.0',
    description: 'High-quality text-to-video with optional image input, multi-shot sequences',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: false,
    supportsCustomDuration: false,
    defaultDuration: 5,
    aspectRatioOptions: ['16:9', '9:16', '1:1'],
    requiredInputs: ['prompt'],
    optionalInputs: ['image', 'aspect_ratio'],
  },
]

export const DEFAULT_MODEL_ID = 'google/veo-3.1'

export function getModelById(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find(model => model.id === id)
}

export function getDefaultModel(): VideoModel {
  return VIDEO_MODELS.find(model => model.id === DEFAULT_MODEL_ID) || VIDEO_MODELS[0]
}

