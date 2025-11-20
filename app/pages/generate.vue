<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <UContainer class="max-w-5xl">
      <!-- Loading state while planning storyboard -->
      <div v-if="planningStoryboard" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 mb-2">Planning Your Storyboard</h2>
        <p class="text-gray-600 text-center">We're analyzing your prompt and creating a detailed storyboard...</p>
      </div>

      <!-- Storyboard content -->
      <div v-else>
        <div v-if="storyboard" class="mb-6">
          <!-- Header with Back Button and Mode Display -->
          <div class="flex items-center justify-between mb-4 flex-wrap gap-4">
            <UButton
              v-if="status === 'processing' || status === 'pending' || generationStarted"
              variant="ghost"
              color="gray"
              @click="handleBackToStoryboard"
              class="flex items-center gap-2"
            >
              <UIcon name="i-heroicons-arrow-left" />
              Back to Storyboard
            </UButton>
            <div class="flex-1"></div>
            <!-- Mode Display -->
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white py-3 px-5 rounded-lg shadow-sm">
            <div class="flex items-center gap-4">
                <UBadge :color="storyboard.meta.mode === 'demo' ? 'yellow' : 'blue'" size="lg" variant="subtle" class="uppercase">
                {{ storyboard.meta.mode === 'demo' ? 'Demo Mode' : 'Production Mode' }}
                </UBadge>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                <span v-if="storyboard.meta.mode === 'demo'">
                    Only the first scene will be generated
                </span>
                <span v-else>
                  All scenes will be generated
                </span>
              </div>
            </div>
          </div>
          </div>
        </div>

        <GenerationProgress
          v-if="storyboard"
          :segments="segments"
          :overall-progress="overallProgress"
          :status="status"
          :current-cost="currentCost"
          :estimated-total="estimatedTotal"
          :overall-error="overallError"
          :retry-segment="retrySegmentGen"
          :storyboard="storyboard"
        />

        <VideoPreview
          v-if="assetsReady"
          :clips="clips"
          :status="status"
          :current-cost="currentCost"
          :estimated-total="estimatedTotal"
          :music-url="musicUrl"
          @version-selected="handleVersionSelected"
        />

        <!-- Prompt Journey Viewer -->
        <PromptJourneyViewer
          v-if="storyboard && assetsReady"
          :storyboard="storyboard"
        />
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import GenerationProgress from '~/components/ui/GenerationProgress.vue'
import VideoPreview from '~/components/generation/VideoPreview.vue'
import PromptJourneyViewer from '~/components/prompt-journey/PromptJourneyViewer.vue'
import type { Segment, Storyboard } from '~/app/types/generation'

const route = useRoute()
const router = useRouter()
// Get storyboard from sessionStorage (passed via navigateTo)
const storyboard = ref<Storyboard | null>(null)
const generationStarted = ref(false)
const assetsReady = ref(false)
const planningStoryboard = ref(false)

const { segments, overallProgress, status, overallError, jobId, musicUrl, startGeneration: startGen, pollProgress: pollGenProgress, reset, retrySegment: retrySegmentGen } = useGeneration()
const { currentCost, estimatedTotal, startPolling } = useCostTracking()
const toast = useToast()

// Poll for storyboard status
const pollStoryboardStatus = async (jobId: string, meta: any) => {
  const maxAttempts = 60 // 2 minutes max (60 * 2 seconds)
  let attempts = 0
  
  while (attempts < maxAttempts) {
    try {
      const statusResult = await $fetch('/api/plan-storyboard-status', {
        method: 'POST',
        body: {
          id: jobId,
          meta: meta,
        },
      })
      
      if (statusResult.status === 'completed' && statusResult.storyboard) {
        storyboard.value = statusResult.storyboard
        // Save storyboard to sessionStorage
        saveStoryboardToStorage(storyboard.value)
        return
      } else if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Storyboard generation failed')
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

// Mode is set on stories page and displayed prominently - no toggle needed here


// Helper function to save storyboard to sessionStorage
const saveStoryboardToStorage = (sb: Storyboard | null) => {
  if (process.client && sb) {
    try {
      sessionStorage.setItem('generateStoryboard', JSON.stringify(sb))
      console.log('[Generate] Storyboard saved to sessionStorage')
    } catch (error) {
      console.error('[Generate] Failed to save storyboard to sessionStorage:', error)
    }
  }
}

// Helper function to restore generation state
const restoreGenerationState = async () => {
  if (!process.client) return false
  
  try {
    const jobStateData = sessionStorage.getItem('generateJobState')
    if (jobStateData) {
      const jobState = JSON.parse(jobStateData)
      console.log('[Generate] Restoring generation state:', jobState)
      
      if (jobState.jobId) {
        // Restore jobId and segments
        jobId.value = jobState.jobId
        if (jobState.segments && Array.isArray(jobState.segments)) {
          segments.value = jobState.segments
          console.log(`[Generate] Restored ${segments.value.length} segments`)
        }
        
        // Restore status, progress, and error for immediate UI update
        if (jobState.status) {
          status.value = jobState.status
        }
        if (jobState.overallProgress !== undefined) {
          overallProgress.value = jobState.overallProgress
        }
        if (jobState.overallError !== undefined) {
          overallError.value = jobState.overallError
        }
        
        // Resume polling if job is still active
        if (jobState.status === 'processing' || jobState.status === 'pending') {
          console.log('[Generate] Resuming generation status polling...')
          // Start polling - this will be handled by the composable
          if (pollGenProgress) {
            pollGenProgress()
          }
          return true
        }
      }
    }
  } catch (error) {
    console.error('[Generate] Failed to restore generation state:', error)
  }
  
  return false
}

// Start cost polling and load storyboard
onMounted(async () => {
  startPolling()
  // Access state from sessionStorage
  if (process.client) {
    try {
      // First, check for persisted storyboard (from previous session)
      const persistedStoryboard = sessionStorage.getItem('generateStoryboard')
      
      if (persistedStoryboard) {
        console.log('[Generate] Found persisted storyboard, restoring...')
        storyboard.value = JSON.parse(persistedStoryboard)
        
        // Try to restore generation state and resume polling
        const stateRestored = await restoreGenerationState()
        if (stateRestored) {
          console.log('[Generate] Generation state restored and polling resumed')
          // If state was restored (job is active), don't auto-start
          return
        }
        // If state was NOT restored, continue to auto-start check below
      }
      
      // Check if we have parsed prompt data (new flow)
      const parsedPromptData = sessionStorage.getItem('parsedPrompt')
      
      if (parsedPromptData) {
        // New flow: plan storyboard on generate page
        planningStoryboard.value = true
        
        try {
          const parsed = JSON.parse(parsedPromptData)
          
          // Check if we have a selected story from demo-stories page
          if (parsed.selectedStory) {
            // Convert selected story to storyboard format
            const selectedStory = parsed.selectedStory
            const segments = selectedStory.clips.map((clip: any, index: number) => {
              const startTime = index * clip.duration
              const endTime = startTime + clip.duration
              
              // Determine segment type based on index
              let type = 'body'
              if (index === 0) type = 'hook'
              else if (index === selectedStory.clips.length - 1) type = 'cta'
              
              return {
                type,
                description: clip.description,
                startTime,
                endTime,
                visualPrompt: clip.description,
                visualPromptAlternatives: [],
                audioNotes: index === 0 ? selectedStory.hook : 
                           index === 1 ? selectedStory.bodyOne :
                           index === 2 ? selectedStory.bodyTwo :
                           selectedStory.callToAction,
              }
            })
            
            // Create storyboard from selected story
            storyboard.value = {
              id: `storyboard-${Date.now()}`,
              segments,
              meta: {
                ...parsed.meta,
                duration: 24,
                mode: 'production',
              },
              createdAt: Date.now(),
            }
            
            // Save storyboard to sessionStorage
            if (storyboard.value) {
              saveStoryboardToStorage(storyboard.value)
            }
          } else {
            // Regular flow: call plan-storyboard API
            const storyboardResult = await $fetch('/api/plan-storyboard', {
              method: 'POST',
              body: { parsed },
            })
            
            // Check if this is an async response with jobId
            if (storyboardResult.jobId && storyboardResult.status === 'pending') {
              // Poll for status (use meta from response if available, otherwise from parsed)
              await pollStoryboardStatus(storyboardResult.jobId, storyboardResult.meta || parsed.meta)
            } else {
              // Synchronous response (backward compatibility)
              storyboard.value = storyboardResult
            }
            
            // Save storyboard to sessionStorage
            if (storyboard.value) {
              saveStoryboardToStorage(storyboard.value)
            }
          }
          
          // Clear parsedPrompt after successful planning
          sessionStorage.removeItem('parsedPrompt')
          sessionStorage.removeItem('selectedStory')
        } catch (error: any) {
          console.error('[Generate] Storyboard planning error:', error)
          const toast = useToast()
          toast.add({
            title: 'Error',
            description: error.message || 'Failed to plan storyboard. Please try again.',
            color: 'error',
          })
          // Don't navigate away - let user stay on page to see error
          // navigateTo('/')
        } finally {
          planningStoryboard.value = false
        }
      } else {
        // Legacy flow: check for existing storyboard (temporary storage)
        const stored = sessionStorage.getItem('storyboard')
        if (stored) {
          storyboard.value = JSON.parse(stored)
          // Save to persistent storage
          saveStoryboardToStorage(storyboard.value)
          // Clear temporary storage
          sessionStorage.removeItem('storyboard')
        } else {
          // If no storyboard found, show error but don't redirect
          console.error('[Generate] No storyboard found in sessionStorage')
          const toast = useToast()
          toast.add({
            title: 'No storyboard found',
            description: 'Please start a new generation from the home page',
            color: 'warning',
          })
          // Don't navigate away immediately - let user see the error
          // navigateTo('/')
        }
      }
    } catch (error) {
      console.error('[Generate] Failed to load storyboard:', error)
      const toast = useToast()
      toast.add({
        title: 'Error',
        description: 'Failed to load storyboard. Please try again.',
        color: 'error',
      })
      // Don't navigate away - let user retry or see what went wrong
      // navigateTo('/')
    }
    
    // Auto-start generation if storyboard is loaded and no state was restored
    if (storyboard.value && status.value === 'idle' && !generationStarted.value) {
      // Small delay to ensure UI is ready and segments are initialized
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('[Generate] Auto-starting video generation...')
      startGeneration()
    }
  }
})

// Reload storyboard from sessionStorage when page becomes visible (user navigated back)
onActivated(() => {
  if (process.client) {
    const persistedStoryboard = sessionStorage.getItem('generateStoryboard')
    if (persistedStoryboard) {
      try {
        const updatedStoryboard = JSON.parse(persistedStoryboard)
        // Only update if it's different (user modified on storyboard page)
        if (updatedStoryboard.id === storyboard.value?.id && 
            JSON.stringify(updatedStoryboard) !== JSON.stringify(storyboard.value)) {
          console.log('[Generate] Storyboard updated from storyboard page, reloading...')
          storyboard.value = updatedStoryboard
        }
      } catch (error) {
        console.error('[Generate] Failed to reload storyboard:', error)
      }
    }
  }
})

// Also check on visibility change (when tab becomes active)
if (process.client) {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && storyboard.value) {
      const persistedStoryboard = sessionStorage.getItem('generateStoryboard')
      if (persistedStoryboard) {
        try {
          const updatedStoryboard = JSON.parse(persistedStoryboard)
          if (updatedStoryboard.id === storyboard.value?.id && 
              JSON.stringify(updatedStoryboard) !== JSON.stringify(storyboard.value)) {
            console.log('[Generate] Storyboard updated, reloading...')
            storyboard.value = updatedStoryboard
          }
        } catch (error) {
          console.error('[Generate] Failed to reload storyboard:', error)
        }
      }
    }
  })
}

// Initialize segments from storyboard when it loads
watch(storyboard, (newStoryboard) => {
  if (newStoryboard) {
    saveStoryboardToStorage(newStoryboard)
    // Initialize segments from storyboard so they show up immediately
    if (segments.value.length === 0 && newStoryboard.segments) {
      segments.value = newStoryboard.segments.map((seg: Segment, idx: number) => ({
        ...seg,
        status: 'pending',
        segmentId: idx,
      }))
      console.log('[Generate] Initialized segments from storyboard:', segments.value.length)
    }
  }
}, { deep: true, immediate: true })

// Watch for status changes (set up once, not inside startGeneration)
const statusWatcher = watch(status, (newStatus) => {
  if (newStatus === 'completed') {
    assetsReady.value = true
  }
  // Save generation state when status changes
  saveGenerationState()
})

// Helper function to save generation state to sessionStorage
const saveGenerationState = () => {
  if (process.client) {
    try {
      const state = {
        jobId: jobId.value,
        segments: segments.value,
        status: status.value,
        overallProgress: overallProgress.value,
        overallError: overallError.value,
        timestamp: Date.now(),
      }
      sessionStorage.setItem('generateJobState', JSON.stringify(state))
      console.log('[Generate] Generation state saved to sessionStorage')
    } catch (error) {
      console.error('[Generate] Failed to save generation state:', error)
    }
  }
}

// Watch for segments changes and save state
watch(segments, () => {
  saveGenerationState()
}, { deep: true })

// Watch for jobId changes and save state
watch(jobId, () => {
  saveGenerationState()
})

// Clean up watcher on unmount
onUnmounted(() => {
  statusWatcher()
})

const startGeneration = async () => {
  // Save generation state when starting
  saveGenerationState()
  
  if (!storyboard.value) {
    console.warn('[Generate] Cannot start generation: no storyboard')
    return
  }
  
  // Prevent multiple simultaneous calls
  if (generationStarted.value) {
    console.warn('[Generate] Generation already started, ignoring duplicate call')
    console.warn('[Generate] Current status:', status.value, 'Job ID:', jobId.value)
    return
  }

  // Log mode and warn if in demo mode with multiple segments
  const mode = storyboard.value.meta.mode || 'production'
  const segmentCount = storyboard.value.segments.length
  console.log(`[Generate] Starting generation in ${mode} mode with ${segmentCount} segments`)
  console.log(`[Generate] Storyboard ID: ${storyboard.value.id}`)
  console.log(`[Generate] Current generation status: ${status.value}`)
  
  if (mode === 'demo' && segmentCount > 1) {
    console.warn(`[Generate] WARNING: Demo mode selected - only the first segment will be generated!`)
    console.warn(`[Generate] Switch to Production mode to generate all ${segmentCount} segments`)
  }

  generationStarted.value = true
  try {
    await startGen(storyboard.value)
    console.log('[Generate] Generation started successfully')
  } catch (error) {
    console.error('Generation failed:', error)
    generationStarted.value = false // Reset on error so user can retry
  }
}

const clips = computed(() => {
  console.log('[Generate] Computing clips...')
  console.log('[Generate] Segments value:', segments.value)
  console.log('[Generate] Segments length:', segments.value?.length || 0)
  
  if (!segments.value || segments.value.length === 0) {
    console.log('[Generate] No segments available for clips')
    return []
  }
  
  // Log all segments with their status and videoUrl
  segments.value.forEach((s: any, idx: number) => {
    console.log(`[Generate] Segment ${idx}:`, {
      segmentId: s.segmentId,
      status: s.status,
      hasVideoUrl: !!s.videoUrl,
      hasMetadataVideoUrl: !!s.metadata?.videoUrl,
      hasMetadataReplicateUrl: !!s.metadata?.replicateVideoUrl,
      videoUrl: s.videoUrl?.substring(0, 50) || 'none',
    })
  })
  
  const filtered = segments.value.filter((s: any) => s.status === 'completed' && s.videoUrl)
  console.log('[Generate] Segments filtered for clips:', filtered.length, 'out of', segments.value.length)
  console.log('[Generate] Filtered segment IDs:', filtered.map((s: any) => s.segmentId))
  
  // Sort clips to ensure proper order: Hook -> body -> body -> CTA
  // Sort by segmentId (which corresponds to order in storyboard) to maintain original sequence
  const sorted = filtered.sort((a: any, b: any) => {
    // First, sort by segmentId if available (maintains storyboard order)
    if (a.segmentId !== undefined && b.segmentId !== undefined) {
      return a.segmentId - b.segmentId
    }
    // Fallback: sort by type (hook first, then body, then cta)
    const typeOrder: Record<string, number> = { hook: 0, body: 1, cta: 2 }
    const aOrder = typeOrder[a.type] ?? 999
    const bOrder = typeOrder[b.type] ?? 999
    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }
    // If same type, sort by startTime
    return (a.startTime || 0) - (b.startTime || 0)
  })
  
  const result = sorted.map((s: any) => ({
    videoUrl: s.videoUrl!,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  }))
  
  console.log('[Generate] Final clips count:', result.length)
  console.log('[Generate] Final clips (ordered):', result.map((c: any, idx: number) => ({
    index: idx,
    type: c.type,
    hasVideo: !!c.videoUrl,
    hasAudio: !!c.voiceUrl,
  })))
  
  return result
})

const selectedCompositionVersion = ref<'original' | 'smart' | null>(null)
const selectedCompositionVideoUrl = ref<string | null>(null)
const selectedCompositionVideoId = ref<string | null>(null)

const handleBackToStoryboard = () => {
  // Save current storyboard to sessionStorage before navigating
  if (storyboard.value) {
    saveStoryboardToStorage(storyboard.value)
  }
  router.push('/storyboards')
}

const handleVersionSelected = (version: 'original' | 'smart', videoUrl: string, videoId: string) => {
  console.log('[Generate] Video version selected:', version, videoUrl, videoId)
  selectedCompositionVersion.value = version
  selectedCompositionVideoUrl.value = videoUrl
  selectedCompositionVideoId.value = videoId
  
  // Save to sessionStorage for editor
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('editorComposedVideo', JSON.stringify({
      version,
      videoUrl,
      videoId,
    }))
  }
  
  toast.add({
    title: `${version === 'original' ? 'Original' : 'Smart Stitched'} Version Selected`,
    description: 'This version will be used for editing and export.',
    color: 'success',
  })
}

</script>

