import type { ParsedPrompt, Storyboard, GenerationJob, Video, CostSummary } from './generation'

export interface ParsePromptRequest {
  prompt: string
  duration: number
  aspectRatio: '16:9' | '9:16'
  style: string
}

export interface ParsePromptResponse extends ParsedPrompt {}

export interface PlanStoryboardRequest {
  parsed: ParsedPrompt
}

export interface PlanStoryboardResponse extends Storyboard {}

export interface GenerateAssetsRequest {
  storyboard: Storyboard
}

export interface GenerateAssetsResponse {
  jobId: string
  assets: Array<{
    segmentId: number
    videoUrl?: string
    voiceUrl?: string
    status: string
  }>
}

export interface GenerationStatusResponse {
  status: 'processing' | 'completed' | 'failed'
  overallProgress: number
  segments: Array<{
    segmentId: number
    status: string
    progress?: number
  }>
}

export interface ComposeVideoRequest {
  clips: Array<{
    videoUrl: string
    voiceUrl?: string
    startTime: number
    endTime: number
    type: string
  }>
  options: {
    transition: 'fade' | 'dissolve' | 'wipe' | 'none'
    musicVolume: number
  }
}

export interface ComposeVideoResponse {
  videoUrl: string
  videoId: string
}

export interface DownloadVideoResponse {
  url: string
  metadata: {
    duration: number
    resolution: string
    aspectRatio: string
    cost: number
    createdAt: number
  }
}

export interface CostSummaryResponse extends CostSummary {}

export interface HistoryResponse {
  videos: Video[]
  total: number
}

