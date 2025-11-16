import type { Segment, GenerationJob, Story } from '~/app/types/generation'

export const useGeneration = () => {
  const segments = ref<Array<Segment & { status: string; progress?: number; error?: string }>>([])
  const overallProgress = ref(0)
  const status = ref<'idle' | 'story_selection' | 'keyframe_generation' | 'processing' | 'completed' | 'failed'>('idle')
  const jobId = ref<string | null>(null)
  const overallError = ref<string | undefined>(undefined)
  
  // New pipeline state
  const stories = ref<Story[]>([])
  const selectedStory = ref<Story | null>(null)
  const keyframeProgress = ref(0)
  const currentPhase = ref<'stories' | 'keyframes' | 'video' | 'complete'>('stories')

  /**
   * Generate story options (Phase 1 of new pipeline)
   */
  const generateStories = async (parsed: any, productImages: string[] = []) => {
    status.value = 'story_selection'
    currentPhase.value = 'stories'
    
    try {
      console.log('[useGeneration] Generating story options...')
      const response = await $fetch<{ stories: Story[] }>('/api/generate-stories', {
        method: 'POST',
        body: {
          parsed,
          productImages,
        },
      })
      
      stories.value = response.stories || []
      console.log('[useGeneration] Stories generated:', stories.value.length)
      
      return stories.value
    } catch (error) {
      status.value = 'failed'
      console.error('Story generation failed:', error)
      throw error
    }
  }

  /**
   * Select a story and continue to storyboard planning
   */
  const selectStory = (story: Story) => {
    selectedStory.value = story
    console.log('[useGeneration] Story selected:', story.title)
  }

  /**
   * Generate keyframes for all segments (Phase 2 of new pipeline)
   * This happens after story selection and before video generation
   */
  const generateKeyframes = async (storyboard: any) => {
    status.value = 'keyframe_generation'
    currentPhase.value = 'keyframes'
    keyframeProgress.value = 0
    
    try {
      console.log('[useGeneration] Generating keyframes for all segments...')
      
      // Initialize segments with pending status
      segments.value = storyboard.segments.map((seg: Segment, idx: number) => ({
        ...seg,
        status: 'pending',
        segmentId: idx,
        keyframeStatus: 'pending',
      }))
      
      // Call the keyframe generation endpoint
      const response = await $fetch('/api/generate-keyframes', {
        method: 'POST',
        body: {
          storyboard,
          segmentsToGenerate: storyboard.segments.map((_: any, idx: number) => idx),
        },
      })
      
      console.log('[useGeneration] Keyframe generation initiated:', response)
      
      // Poll for keyframe completion
      const pollInterval = setInterval(async () => {
        try {
          // Fetch updated storyboard data
          const updatedStoryboard = await $fetch(`/api/storyboard/${storyboard.id}`)
          
          // Update segments with keyframe data
          segments.value = updatedStoryboard.segments.map((seg: any, idx: number) => ({
            ...seg,
            status: seg.keyframeStatus === 'completed' ? 'completed' : 'processing',
            segmentId: idx,
          }))
          
          // Calculate progress
          const completedCount = updatedStoryboard.segments.filter(
            (seg: any) => seg.keyframeStatus === 'completed'
          ).length
          keyframeProgress.value = Math.round((completedCount / updatedStoryboard.segments.length) * 100)
          
          // Check if all keyframes are completed
          const allCompleted = updatedStoryboard.segments.every(
            (seg: any) => seg.keyframeStatus === 'completed'
          )
          
          if (allCompleted) {
            console.log('[useGeneration] All keyframes generated successfully')
            clearInterval(pollInterval)
            // Don't change status - let user review keyframes
            return updatedStoryboard
          }
          
          // Check for failures
          const anyFailed = updatedStoryboard.segments.some(
            (seg: any) => seg.keyframeStatus === 'failed'
          )
          
          if (anyFailed) {
            console.error('[useGeneration] Some keyframes failed to generate')
            clearInterval(pollInterval)
            status.value = 'failed'
            throw new Error('Keyframe generation failed for some segments')
          }
        } catch (error) {
          console.error('[useGeneration] Error polling keyframe progress:', error)
          clearInterval(pollInterval)
          status.value = 'failed'
          throw error
        }
      }, 2000)
      
      return response
    } catch (error) {
      status.value = 'failed'
      console.error('Keyframe generation failed:', error)
      throw error
    }
  }

  /**
   * Start the full generation flow (backward compatible)
   */
  const startGeneration = async (storyboard: any, generateKeyframesFirst: boolean = false) => {
    segments.value = storyboard.segments.map((seg: Segment, idx: number) => ({
      ...seg,
      status: 'pending',
      segmentId: idx,
    }))

    try {
      // Optional: Generate keyframes before video generation (new pipeline)
      if (generateKeyframesFirst && storyboard.meta.productImages && storyboard.meta.productName) {
        status.value = 'keyframe_generation'
        currentPhase.value = 'keyframes'
        console.log('[useGeneration] Generating keyframes first...')
        
        // Keyframes will be generated by generate-assets endpoint automatically
        // This is just to update the UI state
      }

      // Start video generation
      status.value = 'processing'
      currentPhase.value = 'video'
      
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

  const retrySegment = async (segmentId: number) => {
    if (!jobId.value) return

    try {
      await $fetch(`/api/retry-segment/${segmentId}`, {
        method: 'POST',
        body: { jobId: jobId.value },
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
    // Existing state
    segments,
    overallProgress,
    status,
    jobId,
    overallError,
    
    // New pipeline state
    stories,
    selectedStory,
    keyframeProgress,
    currentPhase,
    
    // Existing methods
    startGeneration,
    retrySegment,
    reset,
    pollProgress,
    
    // New pipeline methods
    generateStories,
    selectStory,
    generateKeyframes,
  }
}

