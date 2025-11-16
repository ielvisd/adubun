<template>
  <div class="py-12">
    <UContainer class="max-w-5xl">
      <!-- Loading state while planning storyboard -->
      <div v-if="planningStoryboard" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 mb-2">Planning Your Storyboard</h2>
        <p class="text-gray-600 text-center">We're analyzing your prompt and creating a detailed storyboard...</p>
      </div>

        <!-- Storyboard content -->
      <template v-else>
        <!-- Story Selection (New Pipeline) -->
        <div v-if="stories.length > 0 && !storyboard" class="mb-8">
          <StorySelector
            :stories="stories"
            :selected-story-id="selectedStory?.id"
            :is-loading="false"
            @select="handleStorySelect"
            @confirm="handleStoryConfirm"
          />
          
          <StoryComparison
            v-if="stories.length > 1"
            :stories="stories"
            :selected-story-id="selectedStory?.id"
            class="mt-6"
          />
        </div>

        <!-- Keyframe Approval (New Pipeline - Before Video Generation) -->
        <div v-if="showKeyframeApproval && storyboard" class="mb-8">
          <KeyframeApproval
            :segments="segments"
            @approve="handleKeyframeApproval"
            @regenerate="handleKeyframeRegeneration"
          />
        </div>

        <div v-if="storyboard && !showKeyframeApproval" class="mb-6">
          <div class="flex items-center gap-4 mb-2">
            <UBadge 
              :color="storyboard.meta.mode === 'demo' ? 'yellow' : 'green'"
              variant="subtle"
              size="lg"
            >
              {{ storyboard.meta.mode === 'demo' ? 'Demo Mode' : 'Production Mode' }}
            </UBadge>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-700">Demo</span>
              <USwitch
                v-model="isProductionMode"
                :disabled="generationStarted"
                @update:model-value="handleModeChange"
              />
              <span class="text-sm font-medium text-gray-700">Production</span>
            </div>
          </div>
          <p v-if="storyboard.meta.mode === 'demo'" class="text-sm text-gray-600">
            All scenes are shown in the storyboard, but only the first scene will be generated.
          </p>
          <p v-else class="text-sm text-gray-600">
            All scenes in the storyboard will be generated.
          </p>
          <div v-if="storyboard.meta.firstFrameImage || storyboard.meta.subjectReference" class="mt-4 text-sm text-gray-600">
            <p v-if="storyboard.meta.firstFrameImage" class="mb-1">
              <strong>Global First Frame:</strong> {{ storyboard.meta.firstFrameImage }}
            </p>
            <p v-if="storyboard.meta.subjectReference">
              <strong>Global Subject Reference:</strong> {{ storyboard.meta.subjectReference }}
            </p>
          </div>
        </div>

        <StoryboardView
          v-if="storyboard"
          :storyboard="storyboard"
          :assets="completedAssets"
          @edit="handleEditSegment"
          @prompt-selected="handlePromptSelected"
        />

        <AudioScriptView
          v-if="storyboard"
          :segments="storyboard.segments"
          class="mt-6"
        />

        <!-- Keyframe Preview (New Pipeline) -->
        <KeyframeGrid
          v-if="storyboard && storyboard.segments.some(s => s.firstFrameUrl || s.keyframeStatus)"
          :segments="storyboard.segments"
          :resolution="storyboard.meta.aspectRatio === '1:1' ? '2K' : '2K'"
          :show-progress="generationStarted"
          class="mt-6"
        />

        <GenerationProgress
          v-if="generationStarted"
          :segments="segments"
          :overall-progress="overallProgress"
          :status="status"
          :current-cost="currentCost"
          :estimated-total="estimatedTotal"
          :overall-error="overallError"
        />

        <CompositionTimeline
          v-if="assetsReady"
          :clips="clips"
          :total-duration="totalDuration"
          @compose="handleCompose"
        />

        <UButton
          v-if="!generationStarted && storyboard && !showKeyframeApproval"
          size="xl"
          color="secondary"
          variant="solid"
          class="w-full mt-8 bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg"
          @click="startGeneration"
        >
          Start Generation
        </UButton>
      </template>
    </UContainer>

    <SegmentEditModal
      v-model="editModalOpen"
      :segment="selectedSegment"
      :segment-index="selectedSegmentIndex"
      :total-duration="storyboard?.meta?.duration || 30"
      :all-segments="storyboard?.segments || []"
      @saved="handleSegmentSaved"
    />
  </div>
</template>

<script setup lang="ts">
import StoryboardView from '~/components/generation/StoryboardView.vue'
import AudioScriptView from '~/components/generation/AudioScriptView.vue'
import GenerationProgress from '~/components/ui/GenerationProgress.vue'
import CompositionTimeline from '~/components/generation/CompositionTimeline.vue'
import SegmentEditModal from '~/components/generation/SegmentEditModal.vue'
import StorySelector from '~/components/generation/StorySelector.vue'
import StoryComparison from '~/components/generation/StoryComparison.vue'
import KeyframeGrid from '~/components/generation/KeyframeGrid.vue'
import KeyframeApproval from '~/components/generation/KeyframeApproval.vue'
import type { Segment, Storyboard, Story } from '~/app/types/generation'

const route = useRoute()
// Get storyboard from sessionStorage (passed via navigateTo)
const storyboard = ref<Storyboard | null>(null)
const generationStarted = ref(false)
const assetsReady = ref(false)
const planningStoryboard = ref(false)

// Edit modal state
const editModalOpen = ref(false)
const selectedSegment = ref<Segment | null>(null)
const selectedSegmentIndex = ref<number | null>(null)

// Keyframe approval state
const showKeyframeApproval = ref(false)
const keyframesGenerated = ref(false)

const { 
  segments, 
  overallProgress, 
  status, 
  overallError, 
  jobId, 
  startGeneration: startGen, 
  pollProgress: pollGenProgress,
  // New pipeline state
  stories,
  selectedStory,
  keyframeProgress,
  currentPhase,
  generateStories,
  selectStory,
  generateKeyframes,
} = useGeneration()
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

// Mode toggle state
const isProductionMode = computed({
  get: () => storyboard.value?.meta.mode === 'production',
  set: (value) => {
    // This will be handled by handleModeChange
  }
})

// Handle mode change
const handleModeChange = async (value: boolean) => {
  if (!storyboard.value) return
  
  const newMode = value ? 'production' : 'demo'
  const oldMode = storyboard.value.meta.mode
  
    // Optimistically update local state
    storyboard.value.meta.mode = newMode
    // Storyboard watcher will automatically save to sessionStorage
    
    try {
      // Update backend
      await $fetch(`/api/storyboard/${storyboard.value.id}`, {
        method: 'PUT',
        body: {
          meta: {
            ...storyboard.value.meta,
            mode: newMode,
          },
        },
      })
      
      toast.add({
        title: 'Mode updated',
        description: `Switched to ${newMode} mode`,
        color: 'success',
      })
    } catch (error: any) {
      // Revert on error
      storyboard.value.meta.mode = oldMode
    
    toast.add({
      title: 'Failed to update mode',
      description: error.message || 'Could not update mode. Please try again.',
      color: 'error',
    })
  }
}

// Map completed segments to assets format for StoryboardView
const completedAssets = computed(() => {
  if (!segments.value || segments.value.length === 0) {
    return []
  }
  
  const completed = segments.value.filter((s: any) => s.status === 'completed')
  
  const assets = completed.map((s: any) => {
    // Extract videoUrl from all possible locations
    const videoUrl = s.videoUrl || 
                    s.metadata?.videoUrl || 
                    s.metadata?.replicateVideoUrl ||
                    null
    
    // Extract voiceUrl from all possible locations
    const voiceUrl = s.voiceUrl || 
                    s.metadata?.voiceUrl ||
                    null
    
    // Debug logging for videoUrl extraction
    if (!videoUrl) {
      console.warn(`[CompletedAssets] Segment ${s.segmentId} has no videoUrl:`, {
        segmentId: s.segmentId,
        hasTopLevelVideoUrl: !!s.videoUrl,
        hasMetadataVideoUrl: !!s.metadata?.videoUrl,
        hasMetadataReplicateVideoUrl: !!s.metadata?.replicateVideoUrl,
        segmentType: s.type,
        status: s.status,
        metadataKeys: s.metadata ? Object.keys(s.metadata) : [],
      })
    } else {
      console.log(`[CompletedAssets] Segment ${s.segmentId} videoUrl found:`, {
        segmentId: s.segmentId,
        segmentType: s.type,
        videoUrlSource: s.videoUrl ? 'top-level' : 
                       s.metadata?.videoUrl ? 'metadata.videoUrl' :
                       s.metadata?.replicateVideoUrl ? 'metadata.replicateVideoUrl' :
                       'unknown',
        videoUrlPreview: videoUrl.substring(0, 50) + '...',
      })
    }
    
    return {
      segmentId: s.segmentId,
      videoUrl,
      voiceUrl,
      metadata: s.metadata,
    }
  })
  
  console.log(`[CompletedAssets] Mapped ${assets.length} completed segments to assets (${assets.filter(a => a.videoUrl).length} with videoUrl)`)
  
  return assets
})

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
        }
        return
      }
      
      // Check if we have parsed prompt data (new flow)
      const parsedPromptData = sessionStorage.getItem('parsedPrompt')
      
      if (parsedPromptData) {
        // New flow: plan storyboard on generate page
        planningStoryboard.value = true
        
        try {
          const parsed = JSON.parse(parsedPromptData)
          
          // Call plan-storyboard API
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
          
          // Clear parsedPrompt after successful planning
          sessionStorage.removeItem('parsedPrompt')
        } catch (error: any) {
          console.error('Failed to plan storyboard:', error)
          const toast = useToast()
          toast.add({
            title: 'Error',
            description: error.message || 'Failed to plan storyboard. Please try again.',
            color: 'error',
          })
          navigateTo('/')
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
          // If no storyboard found, redirect back to home
          const toast = useToast()
          toast.add({
            title: 'No storyboard found',
            description: 'Please start a new generation from the home page',
            color: 'warning',
          })
          navigateTo('/')
        }
      }
    } catch (error) {
      console.error('Failed to load storyboard:', error)
      const toast = useToast()
      toast.add({
        title: 'Error',
        description: 'Failed to load storyboard. Please try again.',
        color: 'error',
      })
      navigateTo('/')
    }
  }
})

// Watch for storyboard changes and save to sessionStorage
watch(storyboard, (newStoryboard) => {
  if (newStoryboard) {
    saveStoryboardToStorage(newStoryboard)
  }
}, { deep: true })

// Watch for new storyboard and trigger keyframe generation if product images exist
watch(storyboard, async (newStoryboard, oldStoryboard) => {
  // Only trigger once when storyboard is first created
  if (newStoryboard && !oldStoryboard && !keyframesGenerated.value) {
    const hasProductImages = newStoryboard.meta.productImages && 
                             newStoryboard.meta.productImages.length > 0 &&
                             newStoryboard.meta.productName
    
    if (hasProductImages) {
      console.log('[Generate] Storyboard created with product images, generating keyframes...')
      
      try {
        await generateKeyframes(newStoryboard)
        
        // Show keyframe approval UI
        showKeyframeApproval.value = true
        
        toast.add({
          title: 'Keyframes generated',
          description: 'Review the scene images before proceeding',
          color: 'green',
        })
      } catch (error: any) {
        console.error('[Generate] Failed to generate keyframes:', error)
        toast.add({
          title: 'Keyframe generation failed',
          description: error.message || 'Failed to generate keyframes',
          color: 'red',
        })
      }
    }
  }
})

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
  const mode = storyboard.value.meta.mode || 'demo'
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
  if (!segments.value || segments.value.length === 0) {
    console.log('[Generate] No segments available for clips')
    return []
  }
  
  const filtered = segments.value.filter((s: any) => s.status === 'completed' && s.videoUrl)
  console.log('[Generate] Segments filtered for clips:', filtered.length, 'out of', segments.value.length)
  console.log('[Generate] Segment details:', JSON.stringify(filtered.map((s: any) => ({
    segmentId: s.segmentId,
    hasVideo: !!s.videoUrl,
    hasAudio: !!s.voiceUrl,
    videoUrl: s.videoUrl,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  })), null, 2))
  
  const result = filtered.map((s: any) => ({
    videoUrl: s.videoUrl!,
    voiceUrl: s.voiceUrl,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  }))
  
  const clipsWithAudio = result.filter(c => c.voiceUrl).length
  console.log('[Generate] Clips with audio:', clipsWithAudio, 'out of', result.length)
  
  return result
})

const totalDuration = computed(() => {
  return Math.max(...clips.value.map((c: any) => c.endTime), 0)
})

const handleCompose = async (options: any) => {
  try {
    console.log('[Generate] Starting video composition')
    console.log('[Generate] Clips to compose:', JSON.stringify(clips.value, null, 2))
    console.log('[Generate] Composition options:', JSON.stringify(options, null, 2))
    
    const result = await $fetch('/api/compose-video', {
      method: 'POST',
      body: {
        clips: clips.value,
        options,
      },
    })

    console.log('[Generate] Compose video API response:', JSON.stringify(result, null, 2))
    console.log('[Generate] Video URL from API:', result.videoUrl)
    console.log('[Generate] Video ID from API:', result.videoId)

    // Store video data in sessionStorage for preview page
    if (process.client) {
      // Merge generation segments with storyboard segments to preserve audioNotes
      const mergedSegments = segments.value.map((genSeg: any) => {
        // Find corresponding storyboard segment to get audioNotes
        const storyboardSeg = storyboard.value?.segments?.[genSeg.segmentId]
        return {
          ...genSeg,
          // Preserve audioNotes from storyboard if not in generation segment
          audioNotes: genSeg.audioNotes || storyboardSeg?.audioNotes,
          // Get voiceUrl from generation segment (either direct or from metadata)
          voiceUrl: genSeg.voiceUrl || genSeg.metadata?.voiceUrl,
          // Preserve type and timing from generation segment
          type: genSeg.type || storyboardSeg?.type,
          startTime: genSeg.startTime || storyboardSeg?.startTime,
          endTime: genSeg.endTime || storyboardSeg?.endTime,
        }
      })
      
      // Collect segments with audio data (audioNotes and voiceUrl)
      const segmentsWithAudio = mergedSegments
        .filter((s: any) => s.audioNotes && s.voiceUrl)
        .map((s: any) => ({
          segmentId: s.segmentId,
          type: s.type,
          audioNotes: s.audioNotes,
          voiceUrl: s.voiceUrl,
          startTime: s.startTime,
          endTime: s.endTime,
        }))
      
      console.log('[Generate] Total segments:', segments.value.length)
      console.log('[Generate] Merged segments:', mergedSegments.length)
      console.log('[Generate] Segments with audio:', segmentsWithAudio.length)
      console.log('[Generate] Segments with audio details:', JSON.stringify(segmentsWithAudio, null, 2))
      
      const videoData = {
        videoUrl: result.videoUrl,
        videoId: result.videoId,
        duration: totalDuration.value,
        cost: currentCost.value,
        segments: segmentsWithAudio,
      }
      sessionStorage.setItem('videoPreview', JSON.stringify(videoData))
      console.log('[Generate] Video data stored in sessionStorage:', JSON.stringify(videoData, null, 2))
    }

    // Navigate to preview page
    await navigateTo('/preview')
    console.log('[Generate] Navigation to preview completed')
  } catch (error: any) {
    console.error('[Generate] Composition error:', error.message)
    console.error('[Generate] Error stack:', error.stack)
    console.error('[Generate] Error details:', JSON.stringify(error, null, 2))
    
    const toast = useToast()
    toast.add({
      title: 'Composition failed',
      description: error.message,
      color: 'error',
    })
  }
}

const handleEditSegment = (index: number) => {
  if (!storyboard.value || !storyboard.value.segments[index]) {
    toast.add({
      title: 'Error',
      description: 'Segment not found',
      color: 'error',
    })
    return
  }

  selectedSegment.value = { ...storyboard.value.segments[index] }
  selectedSegmentIndex.value = index
  editModalOpen.value = true
}

const handlePromptSelected = async (segmentIdx: number, promptIndex: number) => {
  if (!storyboard.value || !storyboard.value.segments[segmentIdx]) {
    return
  }

  // Update local state
  storyboard.value.segments[segmentIdx].selectedPromptIndex = promptIndex

  try {
    // Update backend
    await $fetch(`/api/storyboard/${storyboard.value.id}`, {
      method: 'PUT',
      body: {
        segments: storyboard.value.segments,
      },
    })
  } catch (error: any) {
    // Revert on error
    storyboard.value.segments[segmentIdx].selectedPromptIndex = undefined
    
    toast.add({
      title: 'Failed to update prompt',
      description: error.message || 'Could not update prompt selection. Please try again.',
      color: 'error',
    })
  }
}

// New Pipeline Handlers
const handleStorySelect = (story: Story) => {
  selectStory(story)
  console.log('[Generate] Story selected:', story.title)
}

const handleStoryConfirm = async () => {
  if (!selectedStory.value) {
    toast.add({
      title: 'No story selected',
      description: 'Please select a story first',
      color: 'red',
    })
    return
  }
  
  console.log('[Generate] Story confirmed, planning storyboard...')
  toast.add({
    title: 'Story confirmed',
    description: `Proceeding with: ${selectedStory.value.title}`,
    color: 'green',
  })
  
  // After story selection, trigger keyframe generation if product images exist
  // The storyboard planning will happen, then keyframes will be generated
  // User will review keyframes before proceeding to video generation
}

// Handle keyframe approval - proceed to video generation
const handleKeyframeApproval = async () => {
  console.log('[Generate] Keyframes approved, proceeding to video generation...')
  showKeyframeApproval.value = false
  keyframesGenerated.value = true
  
  toast.add({
    title: 'Keyframes approved',
    description: 'Starting video generation...',
    color: 'green',
  })
  
  // Proceed to video generation
  await startGeneration()
}

// Handle keyframe regeneration
const handleKeyframeRegeneration = async () => {
  if (!storyboard.value) return
  
  console.log('[Generate] Regenerating keyframes...')
  toast.add({
    title: 'Regenerating keyframes',
    description: 'This may take a few moments...',
    color: 'blue',
  })
  
  try {
    await generateKeyframes(storyboard.value)
    
    toast.add({
      title: 'Keyframes regenerated',
      description: 'Review the new keyframes',
      color: 'green',
    })
  } catch (error: any) {
    console.error('[Generate] Keyframe regeneration failed:', error)
    toast.add({
      title: 'Regeneration failed',
      description: error.message || 'Failed to regenerate keyframes',
      color: 'red',
    })
  }
}

const handleSegmentSaved = async (updatedSegment: Segment, index: number) => {
  console.log('[Handle Segment Saved] Called with:', { index, segment: updatedSegment })
  
  if (!storyboard.value || index < 0) {
    console.error('[Handle Segment Saved] Invalid storyboard or index:', { storyboard: storyboard.value, index })
    return
  }

  const toast = useToast()

  try {
    // Handle file uploads if needed
    let segmentToSave = { ...updatedSegment }
    
    // Helper function to upload a file
    const uploadFile = async (file: File): Promise<string | null> => {
      const formData = new FormData()
      formData.append('file', file)
      const uploadResult = await $fetch('/api/upload-brand-assets', {
        method: 'POST',
        body: formData,
      })
      if (uploadResult.files && uploadResult.files.length > 0) {
        return uploadResult.files[0]
      }
      return null
    }
    
    // Upload firstFrameImage if it's a File
    if (updatedSegment.firstFrameImage instanceof File) {
      console.log('[Handle Segment Saved] Uploading firstFrameImage...')
      const uploadedPath = await uploadFile(updatedSegment.firstFrameImage)
      if (uploadedPath) {
        segmentToSave.firstFrameImage = uploadedPath
      }
    }
    
    // Upload subjectReference if it's a File
    if (updatedSegment.subjectReference instanceof File) {
      console.log('[Handle Segment Saved] Uploading subjectReference...')
      const uploadedPath = await uploadFile(updatedSegment.subjectReference)
      if (uploadedPath) {
        segmentToSave.subjectReference = uploadedPath
      }
    }
    
    // Upload image (Veo parameter) if it's a File
    if ((updatedSegment as any).image instanceof File) {
      console.log('[Handle Segment Saved] Uploading image (Veo parameter)...')
      const uploadedPath = await uploadFile((updatedSegment as any).image)
      if (uploadedPath) {
        (segmentToSave as any).image = uploadedPath
      }
    }
    
    // Upload lastFrame if it's a File
    if ((updatedSegment as any).lastFrame instanceof File) {
      console.log('[Handle Segment Saved] Uploading lastFrame...')
      const uploadedPath = await uploadFile((updatedSegment as any).lastFrame)
      if (uploadedPath) {
        (segmentToSave as any).lastFrame = uploadedPath
      }
    }
    
    // Upload referenceImages if any are Files
    const referenceImages = (updatedSegment as any).referenceImages
    if (referenceImages && Array.isArray(referenceImages)) {
      console.log('[Handle Segment Saved] Uploading referenceImages...')
      const imagePromises = referenceImages.map(async (img: File | string | null) => {
        if (img instanceof File) {
          return await uploadFile(img)
        }
        return img
      })
      const uploadedImages = await Promise.all(imagePromises)
      const filteredImages = uploadedImages.filter((img: any) => img !== null)
      Object.assign(segmentToSave, { referenceImages: filteredImages })
    }

    console.log('[Handle Segment Saved] Segment to save:', segmentToSave)

    // Update local state optimistically
    const updatedSegments = [...storyboard.value.segments]
    updatedSegments[index] = segmentToSave as Segment

    console.log('[Handle Segment Saved] Updated segments:', updatedSegments)

    // Update storyboard with new segments
    const updatedStoryboard = {
      ...storyboard.value,
      segments: updatedSegments,
      updatedAt: Date.now(),
    }

    console.log('[Handle Segment Saved] Saving to backend...', {
      storyboardId: storyboard.value.id,
      segmentsCount: updatedSegments.length,
    })

    // Save to backend
    const savedStoryboard = await $fetch(`/api/storyboard/${storyboard.value.id}`, {
      method: 'PUT',
      body: {
        segments: updatedSegments,
      },
    })

    console.log('[Handle Segment Saved] Backend save successful:', savedStoryboard)

    // Update local state
    storyboard.value = savedStoryboard as Storyboard
    // Storyboard watcher will automatically save to sessionStorage

    toast.add({
      title: 'Success',
      description: 'Segment updated successfully',
      color: 'success',
    })
  } catch (error: any) {
    console.error('[Handle Segment Saved] Failed to save segment:', error)
    console.error('[Handle Segment Saved] Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      data: error.data,
      stack: error.stack,
    })
    
    toast.add({
      title: 'Save Failed',
      description: error.message || 'Failed to save segment. Please try again.',
      color: 'error',
    })

    // Revert optimistic update by reloading from sessionStorage or refetching
    // For now, we'll just show the error - the user can try again
  }
}
</script>

