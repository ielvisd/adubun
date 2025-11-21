import type { VideoModel } from '~/app/types/generation'

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'google/veo-3.1',
    name: 'Veo 3.1',
    description: 'High-quality video generation with synchronized audio, reference image and character consistency support',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: true,
    supportsFirstFrame: true,
    supportsCustomDuration: true,
    defaultDuration: 6,
    durationOptions: [4, 6, 8],
    aspectRatioOptions: ['16:9', '9:16'],
    requiredInputs: ['prompt'],
    optionalInputs: ['first_frame_image', 'subject_reference', 'duration', 'aspect_ratio'],
  },
  {
    id: 'google/veo-3-fast',
    name: 'Veo 3 Fast',
    description: 'Faster and cheaper version of Veo 3 with native audio generation, maintaining high quality and prompt adherence',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: true,
    supportsCustomDuration: true,
    defaultDuration: 8,
    durationOptions: [4, 6, 8],
    aspectRatioOptions: ['16:9', '9:16'],
    requiredInputs: ['prompt'],
    optionalInputs: ['image', 'duration', 'aspect_ratio', 'negative_prompt', 'resolution', 'generate_audio', 'seed'],
  },
  {
    id: 'google/veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    description: 'New and improved version of Veo 3 Fast, with higher-fidelity video, context-aware audio and last frame support',
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsCharacterReference: false,
    supportsFirstFrame: true,
    supportsCustomDuration: true,
    defaultDuration: 8,
    durationOptions: [4, 6, 8],
    aspectRatioOptions: ['16:9', '9:16'],
    requiredInputs: ['prompt'],
    optionalInputs: ['image', 'duration', 'aspect_ratio', 'negative_prompt', 'resolution', 'generate_audio', 'seed', 'last_frame'],
  },
]

export const DEFAULT_MODEL_ID = 'google/veo-3.1-fast'

export function getModelById(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find(model => model.id === id)
}

export function getDefaultModel(): VideoModel {
  return VIDEO_MODELS.find(model => model.id === DEFAULT_MODEL_ID) || VIDEO_MODELS[0]
}

