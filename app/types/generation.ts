export interface VideoModel {
  id: string // Replicate model path (e.g., 'google/veo-3.1')
  name: string // Display name
  description?: string
  supportsTextToVideo: boolean
  supportsImageToVideo: boolean
  supportsCharacterReference: boolean
  supportsFirstFrame: boolean
  supportsCustomDuration: boolean
  defaultDuration?: number
  durationOptions?: number[] // Valid duration values
  aspectRatioOptions: ('16:9' | '9:16')[]
  requiredInputs: string[] // e.g., ['prompt', 'image']
  optionalInputs: string[] // e.g., ['first_frame_image', 'subject_reference']
}

export interface Character {
  id: string // Unique identifier for the character
  name?: string // Character name if mentioned (e.g., "John", "the teen", "the elderly man")
  description: string // Full character description
  gender: 'male' | 'female' | 'non-binary' | 'unspecified'
  age?: string // Age description (e.g., "teenage", "elderly", "middle-aged", "young adult")
  physicalFeatures?: string // Physical appearance details (hair color/style, build, distinctive features)
  clothing?: string // Clothing style description
  role: string // Role in the story (e.g., "main character", "supporting character", "the person who cheers up")
}

export interface Segment {
  type: 'hook' | 'body' | 'cta'
  description: string
  startTime: number
  endTime: number
  visualPrompt: string
  visualPromptAlternatives?: string[] // Array of alternative visual prompts for user selection
  selectedPromptIndex?: number // Index of selected prompt (0 = visualPrompt, 1+ = alternatives)
  audioNotes?: string
  firstFrameImage?: string // File path or URL for first frame image
  lastFrameImage?: string // File path or URL for last frame image
  subjectReference?: string // File path or URL for subject reference image
  status?: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface Storyboard {
  id: string
  segments: Segment[]
  characters?: Character[] // Character descriptions extracted from the story
  meta: {
    duration: number // Default: 16 for new format, 24 for legacy format
    aspectRatio: '16:9' | '9:16'
    mood?: string // Video tone/mood from homepage (e.g., 'professional', 'playful', 'inspirational')
    adType?: string // Ad Type from homepage
    mode?: 'demo' | 'production'
    model?: string // Video model ID (e.g., 'google/veo-3.1')
    firstFrameImage?: string // Global default first frame image path/URL
    subjectReference?: string // Global default subject reference image path/URL
    resolution?: '720p' | '1080p' // Output resolution
    format?: '16s' | '24s' // Video format: '16s' for 16-second format (default), '24s' for legacy 24-second format
    seamlessTransition?: boolean // Seamless transition: true (default) generates first+last frames for continuity, false generates only first frames
  }
  promptJourney?: {
    userInput: {
      prompt: string
      adType?: string
      mood?: string
      aspectRatio: string
      model?: string
      productImages?: string[]
      subjectReference?: string
    }
    storyGeneration?: {
      systemPrompt: string
      userPrompt: string
      output: {
        hook: string
        bodyOne: string
        bodyTwo: string
        callToAction: string
        description: string
      }
    }
    storyboardGeneration?: {
      systemPrompt: string
      userPrompt: string
      output: Segment[]
    }
    frameGeneration?: {
      frames: Array<{
        label: string
        type: string
        prompt: string
        imageUrl?: string
      }>
    }
    videoGeneration?: {
      segments: Array<{
        type: string
        prompt: string
        duration?: number
        firstFrame?: string
        lastFrame?: string
        subjectReference?: string
      }>
    }
  }
  createdAt: number
  updatedAt?: number
}

export interface Asset {
  segmentId: number
  videoUrl?: string
  voiceUrl?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  metadata?: {
    predictionId?: string
    replicateVideoUrl?: string
    voiceUrl?: string
    segmentIndex?: number
    segmentType?: string
    startTime?: number
    endTime?: number
    duration?: number
    timestamp?: number
    [key: string]: any // Allow additional metadata fields
  }
}

export interface GenerationJob {
  id: string
  status: 'processing' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  assets?: Asset[]
  error?: string
  storyboardId: string
  musicUrl?: string // Background music URL for the entire video
}

export interface ParsedPrompt {
  product: string
  targetAudience: string
  mood: string
  keyMessages: string[]
  visualStyle: string
  callToAction: string
  meta: {
    duration: number
    aspectRatio: '16:9' | '9:16'
    style: string
    mode?: 'demo' | 'production'
    model?: string // Video model ID
    firstFrameImage?: string
    subjectReference?: string
    adType?: string // New field for ad type
    seamlessTransition?: boolean // Seamless transition toggle
  }
}

export interface Video {
  id: string
  url: string
  duration: number
  resolution: string
  aspectRatio: '16:9' | '9:16'
  generationCost: number
  createdAt: number
  storyboardId: string
  jobId: string
}

export interface CostEntry {
  operation: string
  amount: number
  timestamp: number
  metadata?: Record<string, any>
}

export interface CostSummary {
  total: number
  byOperation: Record<string, number>
  count: number
}

export interface Story {
  id: string
  title?: string // Descriptive title (e.g., "The Busy Professional's Journey")
  hook: string
  bodyOne: string
  bodyTwo: string
  callToAction: string
  description: string // Full paragraph description of the story
  emoji?: string // Emoji that best represents the story
  previewImageUrl?: string // Preview image generated from hook
}
