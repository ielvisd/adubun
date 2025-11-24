import { z } from 'zod'
import { callOpenAIMCP } from '../utils/mcp-client'
import { saveStoryboard } from '../utils/storage'
import { nanoid } from 'nanoid'
import path from 'path'
import type { Storyboard } from '~/types/generation'

const generateVideoFullSchema = z.object({
  promptData: z.object({
    prompt: z.string(),
    productImages: z.array(z.string()).optional(),
    personReference: z.string().optional(),
    avatarReference: z.array(z.string()).optional(),
    avatarId: z.string().optional(),
    aspectRatio: z.string().optional(),
    model: z.string().optional(),
    mood: z.string().optional(),
    adType: z.string().optional(),
    generateVoiceover: z.boolean().optional(),
    seamlessTransition: z.boolean().optional(),
  }),
  categoryFlow: z.object({
    category: z.string(),
    productName: z.string(),
    magicBenefit: z.string(),
    salePrice: z.number(),
    generatedPrompt: z.string(),
  }).optional(),
})

// Poll for storyboard status
async function pollStoryboardStatus(jobId: string, meta: any, maxAttempts: number = 60): Promise<Storyboard> {
  let attempts = 0
  
  while (attempts < maxAttempts) {
    try {
      const statusData = await callOpenAIMCP('check_storyboard_status', {
        jobId,
      })
      
      const data = typeof statusData === 'string' ? JSON.parse(statusData) : statusData
      
      if (data.status === 'completed' && data.result) {
        const segments = data.result.segments || []
        
        const storyboard: Storyboard = {
          id: nanoid(),
          segments,
          meta: {
            ...meta,
            mode: meta.mode || 'production',
          },
          createdAt: Date.now(),
        }
        
        await saveStoryboard(storyboard)
        return storyboard
      } else if (data.status === 'failed') {
        throw new Error(data.error || 'Storyboard generation failed')
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    } catch (error: any) {
      if (error.message && error.message.includes('failed')) {
        throw error
      }
      // Continue polling on other errors
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }
  }
  
  throw new Error('Storyboard generation timed out')
}

// Poll for generation status
async function pollGenerationStatus(jobId: string, maxAttempts: number = 300): Promise<any> {
  let attempts = 0
  
  while (attempts < maxAttempts) {
    try {
      const progress = await $fetch(`/api/generation-status/${jobId}`)
      
      if (progress.status === 'completed') {
        return progress
      } else if (progress.status === 'failed') {
        throw new Error(progress.error || 'Generation failed')
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    } catch (error: any) {
      if (error.message && error.message.includes('failed')) {
        throw error
      }
      // Continue polling on other errors
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }
  }
  
  throw new Error('Generation timed out')
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { promptData, categoryFlow } = generateVideoFullSchema.parse(body)
    
    console.log('[Generate Video Full] Starting full generation flow')
    console.log('[Generate Video Full] Prompt:', promptData.prompt.substring(0, 100) + '...')
    console.log('[Generate Video Full] Product images:', promptData.productImages?.length || 0)
    
    // Step 1: Parse prompt
    console.log('[Generate Video Full] Step 1: Parsing prompt...')
    const parsedResult = await $fetch('/api/parse-prompt', {
      method: 'POST',
      body: {
        prompt: promptData.prompt,
        aspectRatio: promptData.aspectRatio || '9:16',
        mood: promptData.mood || 'energetic',
        adType: promptData.adType || 'lifestyle',
        model: promptData.model || 'google/veo-3.1-fast',
        seamlessTransition: promptData.seamlessTransition ?? true,
        generateVoiceover: promptData.generateVoiceover ?? true,
        duration: 16, // Fixed 16 seconds for category flow
      },
    })
    
    console.log('[Generate Video Full] Step 1 complete: Prompt parsed')
    
    // Step 2: Plan storyboard
    console.log('[Generate Video Full] Step 2: Planning storyboard...')
    
    // Ensure mode is set to 'production' for category flow
    if (!parsedResult.meta) {
      parsedResult.meta = {}
    }
    if (!parsedResult.meta.mode) {
      parsedResult.meta.mode = 'production'
    }
    
    const storyboardResult = await $fetch('/api/plan-storyboard', {
      method: 'POST',
      body: { parsed: parsedResult },
    }) as Storyboard | { jobId?: string; status?: string; meta?: any }
    
    let storyboard: Storyboard
    
    // Check if this is an async response with jobId
    if ('jobId' in storyboardResult && storyboardResult.jobId && storyboardResult.status === 'pending') {
      console.log('[Generate Video Full] Storyboard planning is async, polling...')
      storyboard = await pollStoryboardStatus(storyboardResult.jobId, storyboardResult.meta || parsedResult.meta)
    } else {
      storyboard = storyboardResult as Storyboard
      // Ensure mode is set on storyboard
      if (!storyboard.meta) {
        storyboard.meta = {}
      }
      if (!storyboard.meta.mode) {
        storyboard.meta.mode = 'production'
      }
    }
    
    console.log('[Generate Video Full] Step 2 complete: Storyboard planned')
    console.log('[Generate Video Full] Storyboard segments:', storyboard.segments.length)
    console.log('[Generate Video Full] Storyboard mode:', storyboard.meta.mode)
    
    // Step 3: Generate frames
    console.log('[Generate Video Full] Step 3: Generating frames...')
    
    const framesResult = await $fetch('/api/generate-frames', {
      method: 'POST',
      body: {
        storyboard,
        productImages: promptData.productImages || [],
        subjectReference: promptData.personReference,
        avatarReference: promptData.avatarReference || [],
        avatarId: promptData.avatarId,
        story: {
          description: categoryFlow?.generatedPrompt || promptData.prompt,
          hook: storyboard.segments.find(s => s.type === 'hook')?.description || '',
          bodyOne: storyboard.segments.find(s => s.type === 'body' && storyboard.segments.indexOf(s) === 1)?.description || '',
          bodyTwo: storyboard.segments.find(s => s.type === 'body' && storyboard.segments.indexOf(s) === 2)?.description || '',
          callToAction: storyboard.segments.find(s => s.type === 'cta')?.description || '',
        },
        mode: storyboard.meta.mode || 'production',
      },
    }) as { frames: Array<{ segmentIndex: number; frameType: string; imageUrl: string }> }
    
    console.log('[Generate Video Full] Step 3 complete: Frames generated')
    console.log('[Generate Video Full] Frames count:', framesResult.frames.length)
    
    // Step 4: Generate assets (videos + voiceover)
    console.log('[Generate Video Full] Step 4: Generating assets...')
    const assetsResult = await $fetch('/api/generate-assets', {
      method: 'POST',
      body: {
        storyboard,
        frames: framesResult.frames,
      },
    }) as { jobId: string }
    
    console.log('[Generate Video Full] Assets generation started, jobId:', assetsResult.jobId)
    console.log('[Generate Video Full] Polling for asset generation completion...')
    
    const generationProgress = await pollGenerationStatus(assetsResult.jobId)
    
    console.log('[Generate Video Full] Step 4 complete: Assets generated')
    console.log('[Generate Video Full] Segments received:', generationProgress.segments?.length || 0)
    console.log('[Generate Video Full] Storyboard segments:', storyboard.segments.length)
    if (generationProgress.segments) {
      console.log('[Generate Video Full] Segment IDs:', generationProgress.segments.map((s: any) => s.segmentId))
    }
    
    // Step 5: Compose final video
    console.log('[Generate Video Full] Step 5: Composing final video...')
    
    // Format clips for composition
    // Get segment timing from storyboard
    const segmentTimings = new Map<number, { startTime: number; endTime: number; type: string }>()
    storyboard.segments.forEach((seg, idx) => {
      segmentTimings.set(idx, {
        startTime: seg.startTime,
        endTime: seg.endTime,
        type: seg.type,
      })
    })
    
    console.log('[Generate Video Full] Segment timings:', Array.from(segmentTimings.entries()).map(([idx, timing]) => ({
      segmentIndex: idx,
      type: timing.type,
      startTime: timing.startTime,
      endTime: timing.endTime,
    })))
    
    let currentStartTime = 0
    const formattedClips = generationProgress.segments
      .map((clip: any) => {
        const timing = segmentTimings.get(clip.segmentId)
        if (!timing) {
          console.warn(`[Generate Video Full] No timing found for segment ${clip.segmentId}`)
          return null
        }
        
        const clipStart = currentStartTime
        const clipDuration = timing.endTime - timing.startTime
        const clipEnd = currentStartTime + clipDuration
        currentStartTime = clipEnd
        
        const videoUrl = clip.videoUrl || clip.metadata?.videoUrl || clip.metadata?.replicateVideoUrl
        if (!videoUrl) {
          console.warn(`[Generate Video Full] No video URL for segment ${clip.segmentId}`)
          return null
        }
        
        return {
          videoUrl,
          voiceUrl: clip.voiceUrl || clip.metadata?.voiceUrl,
          startTime: clipStart,
          endTime: clipEnd,
          type: timing.type || 'scene',
        }
      })
      .filter((clip: any) => clip !== null) // Filter out null clips
    
    console.log('[Generate Video Full] Formatted clips count:', formattedClips.length)
    console.log('[Generate Video Full] Formatted clips:', formattedClips.map(c => ({
      type: c.type,
      startTime: c.startTime,
      endTime: c.endTime,
      hasVideo: !!c.videoUrl,
    })))
    
    if (formattedClips.length === 0) {
      throw new Error('No video clips available for composition')
    }
    
    // Convert music URL from local path to proper URL format
    let backgroundMusicUrl: string | undefined = undefined
    if (generationProgress.musicUrl) {
      const musicUrl = generationProgress.musicUrl
      // If it's already a URL, use as-is
      if (musicUrl.startsWith('http://') || musicUrl.startsWith('https://')) {
        backgroundMusicUrl = musicUrl
      } else {
        // Convert local path to /api/assets/{filename} URL
        const filename = path.basename(musicUrl)
        const config = useRuntimeConfig()
        // Get base URL from environment or construct from request
        let baseUrl = config.public.appUrl || process.env.APP_URL
        if (!baseUrl || baseUrl.includes('localhost')) {
          // Fallback: use request headers to construct URL
          const headers = getRequestHeaders(event)
          const host = headers.host || headers['x-forwarded-host']
          const protocol = headers['x-forwarded-proto'] || (host?.includes('localhost') ? 'http' : 'https')
          baseUrl = host ? `${protocol}://${host}` : 'http://localhost:3000'
        }
        backgroundMusicUrl = `${baseUrl}/api/assets/${filename}`
      }
    }
    
    const composeOptions: {
      transition: string
      musicVolume: number
      aspectRatio: string
      backgroundMusicUrl?: string
    } = {
      transition: 'none',
      musicVolume: 70,
      aspectRatio: promptData.aspectRatio || '9:16',
    }
    
    // Only include backgroundMusicUrl if it's a valid URL
    if (backgroundMusicUrl) {
      composeOptions.backgroundMusicUrl = backgroundMusicUrl
    }
    
    const composeResult = await $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video-smart', {
      method: 'POST',
      body: {
        clips: formattedClips,
        options: composeOptions,
      },
    })
    
    console.log('[Generate Video Full] Step 5 complete: Video composed')
    console.log('[Generate Video Full] Final video URL:', composeResult.videoUrl)
    
    // Extract voiceover script from storyboard segments
    const voiceoverScript = storyboard.segments
      .map(seg => seg.audioNotes || '')
      .filter(Boolean)
      .join(' ')
    
    const voiceoverSegments = storyboard.segments
      .map(seg => ({
        type: seg.type,
        script: seg.audioNotes || '',
      }))
      .filter(seg => seg.script)
    
    // Return final result
    return {
      videoUrl: composeResult.videoUrl,
      videoId: composeResult.videoId,
      storyboard,
      voiceoverScript,
      voiceoverSegments,
      duration: currentStartTime,
      cost: 0, // Cost tracking is handled separately, can be calculated if needed
      musicUrl: generationProgress.musicUrl || null,
    }
  } catch (error: any) {
    console.error('[Generate Video Full] Error:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to generate video',
    })
  }
})

