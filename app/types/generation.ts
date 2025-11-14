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
  aspectRatioOptions: ('16:9' | '9:16' | '1:1')[]
  requiredInputs: string[] // e.g., ['prompt', 'image']
  optionalInputs: string[] // e.g., ['first_frame_image', 'subject_reference']
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
  subjectReference?: string // File path or URL for subject reference image
  status?: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface Storyboard {
  id: string
  segments: Segment[]
  meta: {
    duration: number
    aspectRatio: '16:9' | '9:16' | '1:1'
    style: string
    mode?: 'demo' | 'production'
    model?: string // Video model ID (e.g., 'google/veo-3.1')
    firstFrameImage?: string // Global default first frame image path/URL
    subjectReference?: string // Global default subject reference image path/URL
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
    aspectRatio: '16:9' | '9:16' | '1:1'
    style: string
    mode?: 'demo' | 'production'
    model?: string // Video model ID
    firstFrameImage?: string
    subjectReference?: string
  }
}

export interface Video {
  id: string
  url: string
  duration: number
  resolution: string
  aspectRatio: '16:9' | '9:16' | '1:1'
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

