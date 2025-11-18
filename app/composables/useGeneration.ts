import type { Segment, GenerationJob } from '~/app/types/generation'

export const useGeneration = () => {
  const segments = ref<Array<Segment & { status: string; progress?: number; error?: string }>>([])
  const overallProgress = ref(0)
  const status = ref<'idle' | 'processing' | 'completed' | 'failed'>('idle')
  const jobId = ref<string | null>(null)
  const overallError = ref<string | undefined>(undefined)

  const startGeneration = async (storyboard: any) => {
    status.value = 'processing'
    segments.value = storyboard.segments.map((seg: Segment, idx: number) => ({
      ...seg,
      status: 'pending',
      segmentId: idx,
    }))

    try {
      // Start generation
      const response = await $fetch('/api/generate-assets', {
        method: 'POST',
        body: { storyboard },
      })

      jobId.value = response.jobId

      // Poll for progress
      await pollProgress()
    } catch (error) {
      status.value = 'failed'
      console.error('Generation start failed:', error)
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Stack trace:', error.stack)
      }
      throw error
    }
  }

  const pollProgress = async () => {
    if (!jobId.value) return

    const interval = setInterval(async () => {
      try {
        const progress = await $fetch(`/api/generation-status/${jobId.value}`)
        
        segments.value = progress.segments.map((seg: any) => {
          const existing = segments.value.find(s => s.segmentId === seg.segmentId)
          
          // Extract videoUrl from multiple possible locations
          const videoUrl = seg.videoUrl || 
                          seg.metadata?.videoUrl || 
                          seg.metadata?.replicateVideoUrl ||
                          existing?.videoUrl ||
                          existing?.metadata?.videoUrl ||
                          existing?.metadata?.replicateVideoUrl ||
                          null
          
          // Extract voiceUrl from multiple possible locations
          const voiceUrl = seg.voiceUrl ||
                          seg.metadata?.voiceUrl ||
                          existing?.voiceUrl ||
                          existing?.metadata?.voiceUrl ||
                          null
          
          const merged = {
            ...existing,
            ...seg,
            // Ensure videoUrl and voiceUrl are at top level for easier access
            videoUrl,
            voiceUrl,
            // Preserve metadata if present
            metadata: seg.metadata || existing?.metadata,
          }
          
          // Log videoUrl extraction for debugging
          if (seg.status === 'completed') {
            console.log(`[Generation] Segment ${seg.segmentId} videoUrl extraction:`, {
              segmentId: seg.segmentId,
              hasTopLevelVideoUrl: !!seg.videoUrl,
              hasMetadataVideoUrl: !!seg.metadata?.videoUrl,
              hasMetadataReplicateVideoUrl: !!seg.metadata?.replicateVideoUrl,
              extractedVideoUrl: videoUrl ? 'found' : 'missing',
              videoUrlSource: seg.videoUrl ? 'top-level' : 
                             seg.metadata?.videoUrl ? 'metadata.videoUrl' :
                             seg.metadata?.replicateVideoUrl ? 'metadata.replicateVideoUrl' :
                             existing?.videoUrl ? 'existing-top-level' :
                             existing?.metadata?.videoUrl ? 'existing-metadata.videoUrl' :
                             existing?.metadata?.replicateVideoUrl ? 'existing-metadata.replicateVideoUrl' :
                             'none'
            })
          }
          
          // Log metadata when available
          if (seg.metadata) {
            console.log(`[Generation] Segment ${seg.segmentId} metadata:`, seg.metadata)
          }
          
          return merged
        })
        overallProgress.value = progress.overallProgress
        overallError.value = progress.error
        
        // Log errors for failed segments
        progress.segments.forEach((seg: any) => {
          if (seg.status === 'failed' && seg.error) {
            console.error(`[Segment ${seg.segmentId}] Generation failed:`, seg.error)
          }
        })
        
        // Log overall job error if present
        if (progress.status === 'failed' && progress.error) {
          console.error('[Generation Job] Overall failure:', progress.error)
        }
        
        if (progress.status === 'completed' || progress.status === 'failed') {
          status.value = progress.status
          clearInterval(interval)
        }
      } catch (error) {
        console.error('Error polling progress:', error)
        if (error instanceof Error) {
          console.error('Polling error details:', error.message)
          console.error('Stack trace:', error.stack)
        }
        clearInterval(interval)
        status.value = 'failed'
      }
    }, 2000)

    // Cleanup on unmount
    onUnmounted(() => {
      clearInterval(interval)
    })
  }

  const retrySegment = async (segmentId: number, storyboard?: any) => {
    if (!jobId.value) return

    try {
      await $fetch(`/api/retry-segment/${segmentId}`, {
        method: 'POST',
        body: { 
          jobId: jobId.value,
          storyboard: storyboard, // Pass latest storyboard data if provided
        },
      })

      // Restart polling
      await pollProgress()
    } catch (error) {
      console.error('Error retrying segment:', error)
      throw error
    }
  }

  const reset = () => {
    segments.value = []
    overallProgress.value = 0
    status.value = 'idle'
    jobId.value = null
    overallError.value = undefined
  }

  return {
    segments,
    overallProgress,
    status,
    jobId,
    overallError,
    startGeneration,
    retrySegment,
    reset,
    pollProgress,
  }
}

