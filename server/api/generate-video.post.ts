import { z } from 'zod'
import { nanoid } from 'nanoid'
import { saveJob, getJob } from './generate-assets.post'
import type { GenerationJob, Storyboard } from '../../app/types/generation'
import { promises as fs } from 'fs'
import path from 'path'

const generateVideoSchema = z.object({
  storyboard: z.any(), // Storyboard type
  frames: z.array(z.object({
    segmentIndex: z.number(),
    frameType: z.string(),
    imageUrl: z.string(),
  })),
})

const VIDEO_JOBS_FILE = path.join(process.env.MCP_FILESYSTEM_ROOT || './data', 'video-jobs.json')

interface VideoGenerationJob {
  id: string
  status: 'processing' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  assetJobId: string // Job ID from generate-assets
  storyboardId: string
  videoUrl?: string
  videoId?: string
  error?: string
  progress: number // 0-100
  step: 'generating-assets' | 'composing-video' | 'completed'
  storyboard: Storyboard
  frames: Array<{ segmentIndex: number; frameType: string; imageUrl: string }>
}

export async function saveVideoJob(job: VideoGenerationJob) {
  let jobs: VideoGenerationJob[] = []
  try {
    const content = await fs.readFile(VIDEO_JOBS_FILE, 'utf-8')
    jobs = JSON.parse(content)
  } catch {
    // File doesn't exist, start fresh
  }

  const index = jobs.findIndex(j => j.id === job.id)
  if (index >= 0) {
    jobs[index] = job
  } else {
    jobs.push(job)
  }

  await fs.mkdir(path.dirname(VIDEO_JOBS_FILE), { recursive: true })
  await fs.writeFile(VIDEO_JOBS_FILE, JSON.stringify(jobs, null, 2))
}

export async function getVideoJob(jobId: string): Promise<VideoGenerationJob | null> {
  try {
    const content = await fs.readFile(VIDEO_JOBS_FILE, 'utf-8')
    const jobs: VideoGenerationJob[] = JSON.parse(content)
    return jobs.find(j => j.id === jobId) || null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { storyboard, frames } = generateVideoSchema.parse(body)
    
    console.log('[Generate Video] Starting video generation')
    console.log('[Generate Video] Storyboard ID:', storyboard.id)
    console.log('[Generate Video] Frames count:', frames.length)
    
    // Ensure storyboard has required meta fields
    if (!storyboard.meta) {
      storyboard.meta = {}
    }
    
    // Set default duration if missing (16 for new format, 24 for legacy)
    if (!storyboard.meta.duration) {
      // Calculate duration from segments if available
      if (storyboard.segments && storyboard.segments.length > 0) {
        const lastSegment = storyboard.segments[storyboard.segments.length - 1]
        storyboard.meta.duration = lastSegment.endTime || 16
      } else {
        storyboard.meta.duration = 16 // Default to 16 seconds
      }
    }
    
    // Ensure aspectRatio is set
    if (!storyboard.meta.aspectRatio) {
      storyboard.meta.aspectRatio = '9:16' // Default to 9:16 for ads
    }
    
    // Ensure mode is set
    if (!storyboard.meta.mode) {
      storyboard.meta.mode = 'production'
    }
    
    console.log('[Generate Video] Storyboard meta:', {
      duration: storyboard.meta.duration,
      aspectRatio: storyboard.meta.aspectRatio,
      mode: storyboard.meta.mode,
    })
    
    // Step 1: Start asset generation
    // Note: generate-assets creates the job immediately but processes synchronously
    // The job can be polled even while processing
    const assetGenerationResult = await $fetch('/api/generate-assets', {
      method: 'POST',
      body: {
        storyboard,
        frames,
      },
    }) as { jobId: string; assets?: any[]; musicUrl?: string }
    
    console.log('[Generate Video] Asset generation jobId:', assetGenerationResult.jobId)
    
    // Step 2: Create video generation job
    const videoJobId = nanoid()
    const videoJob: VideoGenerationJob = {
      id: videoJobId,
      status: 'processing',
      startTime: Date.now(),
      assetJobId: assetGenerationResult.jobId,
      storyboardId: storyboard.id,
      progress: 0,
      step: 'generating-assets',
      storyboard,
      frames,
    }
    
    await saveVideoJob(videoJob)
    
    console.log('[Generate Video] Video generation job created:', videoJobId)
    
    return {
      jobId: videoJobId,
    }
  } catch (error: any) {
    console.error('[Generate Video] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to start video generation',
    })
  }
})

