<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-7xl px-4 sm:px-6">
      <!-- Loading Overlay -->
      <div v-if="loading" class="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center">
        <UCard class="bg-white dark:bg-gray-800 p-8 max-w-md mx-4">
          <div class="flex flex-col items-center justify-center text-center">
            <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
            <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Generating Storyboard</h2>
            <p class="text-gray-600 dark:text-gray-400">We're creating your storyboard with a {{ currentStyle }} style...</p>
          </div>
        </UCard>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="red"
        variant="soft"
        :title="error"
        class="mb-6"
      >
        <template #actions>
          <UButton
            variant="ghost"
            color="red"
            @click="$router.push('/stories')"
          >
            Go Back
          </UButton>
        </template>
      </UAlert>

      <!-- Storyboard Editing -->
      <div v-else-if="selectedStoryboard" class="space-y-6">
        <!-- Prominent Mode Display - Mendo Style -->
        <div class="bg-black dark:bg-gray-800 text-white py-4 px-6 mb-6">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
              <div class="text-lg sm:text-xl font-bold uppercase tracking-wide">
                {{ isDemoMode ? 'Demo Mode' : 'Production Mode' }}
              </div>
              <div class="text-sm sm:text-base text-gray-300">
                <span v-if="isDemoMode">
                  Only the first scene will be generated for faster testing
                </span>
                <span v-else>
                  All scenes will be generated
                </span>
              </div>
            </div>
            <UButton
              variant="ghost"
              color="gray"
              @click="$router.push('/stories')"
              class="text-white hover:bg-gray-700 min-h-[44px]"
            >
              Back to Stories
            </UButton>
          </div>
        </div>
        
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Edit Storyboard
            </h1>
            <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              Edit the scenes for your storyboard. You can modify descriptions, visual prompts, and change the style.
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UFormField label="Style" name="style" class="mb-0">
              <USelect
                :model-value="currentStyle"
                :items="availableStyles.map(s => ({ label: s, value: s }))"
                @update:model-value="regenerateStoryboard"
                :disabled="loading"
              />
            </UFormField>
          </div>
        </div>

        <!-- Frame Generation Status -->
        <UAlert
          v-if="generatingFrames"
          color="blue"
          variant="soft"
          class="mb-6"
        >
          <template #title>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin" />
              Generating Frame Images
            </div>
          </template>
          <template #description>
            Creating first and last frame images for each scene. This may take a minute...
          </template>
        </UAlert>

        <UAlert
          v-else-if="frameGenerationError"
          color="red"
          variant="soft"
          class="mb-6"
        >
          <template #title>Frame Generation Failed</template>
          <template #description>
            {{ frameGenerationError }}
          </template>
          <template #actions>
            <UButton
              variant="ghost"
              color="red"
              size="sm"
              @click="generateFrames"
            >
              Retry
            </UButton>
          </template>
        </UAlert>

        <div class="space-y-4">
          <UCard
            v-for="(segment, index) in selectedStoryboard.segments"
            :key="index"
            :class="[
              'bg-white dark:bg-gray-800',
              { 'opacity-60': isDemoMode && index > 0 }
            ]"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ segment.type === 'hook' ? 'Hook' : segment.type === 'cta' ? 'Call to Action' : `Body ${index === 1 ? '1' : '2'}` }}
                    </h3>
                    <UBadge
                      v-if="isDemoMode && index > 0"
                      color="yellow"
                      variant="soft"
                      size="xs"
                    >
                      Demo: Skipped
                    </UBadge>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ segment.startTime }}s - {{ segment.endTime }}s
                  </p>
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <UFormField label="Scene Description" :name="`segment-${index}-description`">
                <UTextarea
                  v-model="segment.description"
                  :rows="2"
                  placeholder="Describe what happens in this scene"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Visual Prompt" :name="`segment-${index}-visual`">
                <UTextarea
                  v-model="segment.visualPrompt"
                  :rows="3"
                  placeholder="Describe the visual style and composition for this scene"
                  class="w-full"
                />
                <template #description>
                  This prompt will be used to generate the frame image for this scene
                </template>
              </UFormField>

              <!-- First Frame Image -->
              <UFormField label="First Frame Image" :name="`segment-${index}-first-frame`">
                <div v-if="segment.firstFrameImage" class="space-y-2">
                  <div class="relative w-full max-w-md">
                    <NuxtImg
                      :src="segment.firstFrameImage"
                      alt="First frame preview"
                      class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                      loading="lazy"
                    />
                    <!-- Dev Mode: Model Source Indicator -->
                    <UBadge
                      v-if="frameGenerationStatus.get(index)?.firstModelSource"
                      :color="frameGenerationStatus.get(index)?.firstModelSource === 'seedream-4' ? 'blue' : 'yellow'"
                      variant="solid"
                      class="absolute top-2 right-2"
                      size="sm"
                    >
                      {{ frameGenerationStatus.get(index)?.firstModelSource === 'seedream-4' ? 'seedream-4' : 'nano-banana' }}
                    </UBadge>
                  </div>
                  <div class="flex gap-2">
                    <ImageUpload
                      v-model="segment.firstFrameImage"
                      @upload="(file) => handleFrameImageUpload(index, 'firstFrameImage', file)"
                    />
                  </div>
                  <!-- Frame Comparison -->
                  <FrameComparison
                    :nano-image-url="frameGenerationStatus.get(index)?.firstNanoImageUrl"
                    :seedream-image-url="frameGenerationStatus.get(index)?.firstSeedreamImageUrl"
                    :show-comparison="showComparison.get(`${index}-first`) || false"
                    :frame-label="`${segment.type === 'hook' ? 'Hook' : segment.type === 'body1' ? 'Body 1' : segment.type === 'body2' ? 'Body 2' : 'CTA'} First Frame`"
                    @show="showComparison.set(`${index}-first`, true)"
                    @close="showComparison.set(`${index}-first`, false)"
                  />
                </div>
                <div v-else class="space-y-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Frame image will be generated automatically
                  </p>
                  <ImageUpload
                    v-model="segment.firstFrameImage"
                    @upload="(file) => handleFrameImageUpload(index, 'firstFrameImage', file)"
                  />
                </div>
              </UFormField>

              <!-- Last Frame Image (not for CTA, or show as final frame) -->
              <UFormField 
                v-if="segment.type !== 'cta' || segment.lastFrameImage"
                :label="segment.type === 'cta' ? 'Final Frame Image' : 'Last Frame Image'" 
                :name="`segment-${index}-last-frame`"
              >
                <div v-if="segment.lastFrameImage" class="space-y-2">
                  <div class="relative w-full max-w-md">
                    <NuxtImg
                      :src="segment.lastFrameImage"
                      alt="Last frame preview"
                      class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                      loading="lazy"
                    />
                    <!-- Dev Mode: Model Source Indicator -->
                    <UBadge
                      v-if="frameGenerationStatus.get(index)?.lastModelSource"
                      :color="frameGenerationStatus.get(index)?.lastModelSource === 'seedream-4' ? 'blue' : 'yellow'"
                      variant="solid"
                      class="absolute top-2 right-2"
                      size="sm"
                    >
                      {{ frameGenerationStatus.get(index)?.lastModelSource === 'seedream-4' ? 'seedream-4' : 'nano-banana' }}
                    </UBadge>
                  </div>
                  <div class="flex gap-2">
                    <ImageUpload
                      v-model="segment.lastFrameImage"
                      @upload="(file) => handleFrameImageUpload(index, 'lastFrameImage', file)"
                    />
                  </div>
                  <!-- Frame Comparison -->
                  <FrameComparison
                    :nano-image-url="frameGenerationStatus.get(index)?.lastNanoImageUrl"
                    :seedream-image-url="frameGenerationStatus.get(index)?.lastSeedreamImageUrl"
                    :show-comparison="showComparison.get(`${index}-last`) || false"
                    :frame-label="`${segment.type === 'hook' ? 'Hook' : segment.type === 'body1' ? 'Body 1' : segment.type === 'body2' ? 'Body 2' : 'CTA'} Last Frame`"
                    @show="showComparison.set(`${index}-last`, true)"
                    @close="showComparison.set(`${index}-last`, false)"
                  />
                </div>
                <div v-else-if="segment.type === 'cta'" class="space-y-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Final frame image will be generated automatically
                  </p>
                  <ImageUpload
                    v-model="segment.lastFrameImage"
                    @upload="(file) => handleFrameImageUpload(index, 'lastFrameImage', file)"
                  />
                </div>
                <div v-else class="space-y-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Last frame image will be generated automatically
                  </p>
                  <ImageUpload
                    v-model="segment.lastFrameImage"
                    @upload="(file) => handleFrameImageUpload(index, 'lastFrameImage', file)"
                  />
                </div>
              </UFormField>
            </div>
          </UCard>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center pt-6 border-t border-gray-200 dark:border-gray-700">
          <UButton
            variant="ghost"
            color="gray"
            @click="$router.push('/stories')"
            class="min-h-[44px]"
          >
            Back to Stories
          </UButton>
          <UButton
            color="secondary"
            variant="solid"
            :disabled="!allFramesReady"
            @click="proceedToGeneration"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-w-[200px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="allFramesReady">Continue to Generation</span>
            <span v-else class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              Waiting for Frames...
            </span>
          </UButton>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import type { Storyboard, Segment } from '~/types/generation'
import ImageUpload from '~/components/ui/ImageUpload.vue'
import FrameComparison from '~/components/generation/FrameComparison.vue'
import { nextTick, triggerRef } from 'vue'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const toast = useToast()

const loading = ref(true)
const error = ref<string | null>(null)
const selectedStoryboard = ref<Storyboard | null>(null)
const selectedStory = ref<any>(null)
const promptData = ref<any>(null)
const generatingFrames = ref(false)
const frameGenerationError = ref<string | null>(null)
const currentStyle = ref<string>('Cinematic')
const frameGenerationStatus = ref<Map<number, { 
  first?: boolean; 
  last?: boolean; 
  firstModelSource?: string; 
  lastModelSource?: string;
  firstNanoImageUrl?: string;
  firstSeedreamImageUrl?: string;
  lastNanoImageUrl?: string;
  lastSeedreamImageUrl?: string;
}>>(new Map())
const showComparison = ref<Map<string, boolean>>(new Map())
const availableStyles = ['Cinematic', 'Dynamic', 'Elegant', 'Minimal', 'Energetic']

// Demo/Production mode
const isDemoMode = computed(() => {
  return selectedStoryboard.value?.meta.mode === 'demo'
})

const toggleMode = async (newMode: 'demo' | 'production') => {
  if (!selectedStoryboard.value) return
  
  const oldMode = selectedStoryboard.value.meta.mode || 'production'
  if (newMode === oldMode) return
  
  // Update mode in storyboard meta
  if (!selectedStoryboard.value.meta) {
    selectedStoryboard.value.meta = {}
  }
  selectedStoryboard.value.meta.mode = newMode
  
  // Persist to sessionStorage
  if (process.client) {
    const storedStoryboard = sessionStorage.getItem('selectedStoryboard')
    if (storedStoryboard) {
      const parsed = JSON.parse(storedStoryboard)
      parsed.meta = parsed.meta || {}
      parsed.meta.mode = newMode
      sessionStorage.setItem('selectedStoryboard', JSON.stringify(parsed))
    }
  }
  
  // If switching to demo mode and frames are already generated, we need to regenerate
  // If switching to production mode, we need to generate remaining frames
  if (newMode === 'demo') {
    // Clear frame status for body1, body2, CTA
    frameGenerationStatus.value.delete(1)
    frameGenerationStatus.value.delete(2)
    frameGenerationStatus.value.delete(3)
  } else {
    // Production mode: regenerate all frames if needed
    if (!allFramesReady.value) {
      generateFrames()
    }
  }
  
  toast.add({
    title: `Switched to ${newMode === 'demo' ? 'Demo' : 'Production'} Mode`,
    description: newMode === 'demo' 
      ? 'Only first scene will be generated for faster testing'
      : 'All scenes will be generated',
    color: 'blue',
  })
}

onMounted(async () => {
  // Get selected story and prompt data from sessionStorage
  if (process.client) {
    const storedStory = sessionStorage.getItem('selectedStory')
    const storedPromptData = sessionStorage.getItem('promptData')
    const storedMode = sessionStorage.getItem('generationMode')
    
    if (!storedStory || !storedPromptData) {
      error.value = 'No story or prompt data found. Please start from the home page.'
      loading.value = false
      return
    }

    try {
      selectedStory.value = JSON.parse(storedStory)
      promptData.value = JSON.parse(storedPromptData)
      
      // Parse mode BEFORE generating storyboards
      const mode = storedMode === 'production' ? 'production' : 'demo'
      
      // Pass mode to generateStoryboards so it's set correctly before frame generation
      await generateStoryboards(undefined, mode)
      
    } catch (err: any) {
      error.value = err.message || 'Failed to load story data'
      loading.value = false
    }
  }
})

const generateStoryboards = async (style?: string, mode?: 'demo' | 'production') => {
  loading.value = true
  error.value = null
  if (style) {
    currentStyle.value = style
  }

  try {
    const result = await $fetch('/api/generate-storyboards', {
      method: 'POST',
      body: {
        story: selectedStory.value,
        prompt: promptData.value.prompt,
        productImages: promptData.value.productImages || [],
        aspectRatio: promptData.value.aspectRatio,
        model: promptData.value.model,
        style: currentStyle.value,
      },
    })

    selectedStoryboard.value = result.storyboard || result
    if (selectedStoryboard.value) {
      currentStyle.value = selectedStoryboard.value.meta.style || 'Cinematic'
      // Set mode from parameter, or default to demo
      if (!selectedStoryboard.value.meta) {
        selectedStoryboard.value.meta = {}
      }
      selectedStoryboard.value.meta.mode = mode || 'demo'
      console.log('[Storyboards] Mode set to:', selectedStoryboard.value.meta.mode)
    }
    loading.value = false
    
    // Start frame generation in background when storyboard is ready (non-blocking)
    if (selectedStoryboard.value) {
      // Don't await - let it run in background
      generateFrames()
    }
  } catch (err: any) {
    console.error('Error generating storyboards:', err)
    error.value = err.data?.message || err.message || 'Failed to generate storyboards'
    loading.value = false
  }
}

const regenerateStoryboard = async (newStyle: string) => {
  if (newStyle === currentStyle.value) return
  
  // Preserve user edits if possible
  const editedSegments = selectedStoryboard.value?.segments.map(seg => ({
    description: seg.description,
    visualPrompt: seg.visualPrompt,
  })) || []
  
  await generateStoryboards(newStyle)
  
  // Try to preserve edits after regeneration
  if (selectedStoryboard.value && editedSegments.length > 0) {
    selectedStoryboard.value.segments.forEach((seg, idx) => {
      if (editedSegments[idx]) {
        // Only preserve if user made significant changes
        if (editedSegments[idx].description !== seg.description || 
            editedSegments[idx].visualPrompt !== seg.visualPrompt) {
          // Keep user's edits
        }
      }
    })
  }
}

const generateFrames = async () => {
  if (!selectedStoryboard.value || !selectedStory.value) {
    return
  }

  generatingFrames.value = true
  frameGenerationError.value = null

  try {
    console.log('[Storyboards] Starting frame generation...')
    console.log('[Storyboards] Product images from promptData:', promptData.value.productImages)
    console.log('[Storyboards] Product images count:', promptData.value.productImages?.length || 0)
    console.log('[Storyboards] Product images array:', Array.isArray(promptData.value.productImages) ? promptData.value.productImages : 'NOT AN ARRAY')
    
    // Add timeout handling (5 minutes max)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Frame generation timed out after 5 minutes'))
      }, 5 * 60 * 1000)
    })

    const requestBody = {
      storyboard: selectedStoryboard.value,
      productImages: promptData.value.productImages || [],
      story: selectedStory.value,
      mode: selectedStoryboard.value.meta.mode || 'production',
    }
    console.log('[Storyboards] Request body productImages:', requestBody.productImages)
    console.log('[Storyboards] Request body productImages count:', requestBody.productImages.length)

    const apiCall = $fetch('/api/generate-frames', {
      method: 'POST',
      body: requestBody,
    })

    const result = await Promise.race([apiCall, timeoutPromise]) as any
    
    console.log('[Storyboards] Frame generation API response:', result)

    // Map frames to segments
    // Frames structure: [{ segmentIndex: 0, frameType: 'first', imageUrl: '...' }, ...]
    const frames = result.frames || []
    
    console.log('[Storyboards] Received frames:', frames.length, 'frames')
    
    if (!frames || frames.length === 0) {
      console.warn('[Storyboards] No frames returned from API')
      frameGenerationError.value = 'No frames were generated. Please try again.'
      return
    }
    
    // Create a map of frames by segment index and type
    const frameMap = new Map<string, { 
      first?: string; 
      last?: string; 
      firstModelSource?: string; 
      lastModelSource?: string;
      firstNanoImageUrl?: string;
      firstSeedreamImageUrl?: string;
      lastNanoImageUrl?: string;
      lastSeedreamImageUrl?: string;
    }>()
    frames.forEach((frame: { 
      segmentIndex: number; 
      frameType: 'first' | 'last'; 
      imageUrl: string; 
      modelSource?: 'nano-banana' | 'seedream-4';
      nanoImageUrl?: string;
      seedreamImageUrl?: string;
    }) => {
      const key = String(frame.segmentIndex)
      if (!frameMap.has(key)) {
        frameMap.set(key, {})
      }
      const segmentFrames = frameMap.get(key)!
      if (frame.frameType === 'first') {
        segmentFrames.first = frame.imageUrl
        segmentFrames.firstModelSource = frame.modelSource
        segmentFrames.firstNanoImageUrl = frame.nanoImageUrl
        segmentFrames.firstSeedreamImageUrl = frame.seedreamImageUrl
      } else {
        segmentFrames.last = frame.imageUrl
        segmentFrames.lastModelSource = frame.modelSource
        segmentFrames.lastNanoImageUrl = frame.nanoImageUrl
        segmentFrames.lastSeedreamImageUrl = frame.seedreamImageUrl
      }
    })
    
    console.log('[Storyboards] Frame map created:', Array.from(frameMap.entries()))

    // Map frames to segments according to PRD:
    // Hook: firstFrameImage = frames[0] (hook first), lastFrameImage = frames[1] (hook last)
    // Body1: firstFrameImage = frames[1] (hook last), lastFrameImage = frames[2] (body1 last)
    // Body2: firstFrameImage = frames[2] (body1 last), lastFrameImage = frames[3] (body2 last)
    // CTA: firstFrameImage = frames[3] (body2 last), lastFrameImage = frames[4] (CTA)
    
    if (selectedStoryboard.value && selectedStoryboard.value.segments.length >= 4) {
      console.log('[Storyboards] Assigning frames to segments...')
      
      // Hook segment (index 0)
      const hookFrames = frameMap.get('0')
      console.log('[Storyboards] Hook frames:', hookFrames)
      if (hookFrames?.first) {
        selectedStoryboard.value.segments[0].firstFrameImage = hookFrames.first
        frameGenerationStatus.value.set(0, { 
          ...frameGenerationStatus.value.get(0), 
          first: true,
          firstModelSource: hookFrames.firstModelSource,
          firstNanoImageUrl: hookFrames.firstNanoImageUrl,
          firstSeedreamImageUrl: hookFrames.firstSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned hook first frame:', hookFrames.first)
      }
      if (hookFrames?.last) {
        selectedStoryboard.value.segments[0].lastFrameImage = hookFrames.last
        frameGenerationStatus.value.set(0, { 
          ...frameGenerationStatus.value.get(0), 
          last: true,
          lastModelSource: hookFrames.lastModelSource,
          lastNanoImageUrl: hookFrames.lastNanoImageUrl,
          lastSeedreamImageUrl: hookFrames.lastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned hook last frame:', hookFrames.last)
      }

      // Body1 segment (index 1)
      // First frame is same as hook's last frame
      const hookLastFrame = hookFrames?.last
      const hookLastModelSource = hookFrames?.lastModelSource
      const hookLastNanoImageUrl = hookFrames?.lastNanoImageUrl
      const hookLastSeedreamImageUrl = hookFrames?.lastSeedreamImageUrl
      const body1Frames = frameMap.get('1')
      console.log('[Storyboards] Body1 frames:', body1Frames)
      if (hookLastFrame) {
        selectedStoryboard.value.segments[1].firstFrameImage = hookLastFrame
        frameGenerationStatus.value.set(1, { 
          ...frameGenerationStatus.value.get(1), 
          first: true,
          firstModelSource: hookLastModelSource,
          firstNanoImageUrl: hookLastNanoImageUrl,
          firstSeedreamImageUrl: hookLastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned body1 first frame (from hook last):', hookLastFrame)
      }
      if (body1Frames?.last) {
        selectedStoryboard.value.segments[1].lastFrameImage = body1Frames.last
        frameGenerationStatus.value.set(1, { 
          ...frameGenerationStatus.value.get(1), 
          last: true,
          lastModelSource: body1Frames.lastModelSource,
          lastNanoImageUrl: body1Frames.lastNanoImageUrl,
          lastSeedreamImageUrl: body1Frames.lastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned body1 last frame:', body1Frames.last)
      }

      // Body2 segment (index 2)
      // First frame is same as body1's last frame
      const body1LastFrame = body1Frames?.last
      const body1LastModelSource = body1Frames?.lastModelSource
      const body1LastNanoImageUrl = body1Frames?.lastNanoImageUrl
      const body1LastSeedreamImageUrl = body1Frames?.lastSeedreamImageUrl
      const body2Frames = frameMap.get('2')
      console.log('[Storyboards] Body2 frames:', body2Frames)
      if (body1LastFrame) {
        selectedStoryboard.value.segments[2].firstFrameImage = body1LastFrame
        frameGenerationStatus.value.set(2, { 
          ...frameGenerationStatus.value.get(2), 
          first: true,
          firstModelSource: body1LastModelSource,
          firstNanoImageUrl: body1LastNanoImageUrl,
          firstSeedreamImageUrl: body1LastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned body2 first frame (from body1 last):', body1LastFrame)
      }
      if (body2Frames?.last) {
        selectedStoryboard.value.segments[2].lastFrameImage = body2Frames.last
        frameGenerationStatus.value.set(2, { 
          ...frameGenerationStatus.value.get(2), 
          last: true,
          lastModelSource: body2Frames.lastModelSource,
          lastNanoImageUrl: body2Frames.lastNanoImageUrl,
          lastSeedreamImageUrl: body2Frames.lastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned body2 last frame:', body2Frames.last)
      }

      // CTA segment (index 3)
      // First frame is same as body2's last frame
      const body2LastFrame = body2Frames?.last
      const body2LastModelSource = body2Frames?.lastModelSource
      const body2LastNanoImageUrl = body2Frames?.lastNanoImageUrl
      const body2LastSeedreamImageUrl = body2Frames?.lastSeedreamImageUrl
      const ctaFrames = frameMap.get('3')
      console.log('[Storyboards] CTA frames:', ctaFrames)
      if (body2LastFrame) {
        selectedStoryboard.value.segments[3].firstFrameImage = body2LastFrame
        frameGenerationStatus.value.set(3, { 
          ...frameGenerationStatus.value.get(3), 
          first: true,
          firstModelSource: body2LastModelSource,
          firstNanoImageUrl: body2LastNanoImageUrl,
          firstSeedreamImageUrl: body2LastSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned CTA first frame (from body2 last):', body2LastFrame)
      }
      if (ctaFrames?.first) {
        // CTA's "first" frame is actually its last frame (the final frame)
        selectedStoryboard.value.segments[3].lastFrameImage = ctaFrames.first
        frameGenerationStatus.value.set(3, { 
          ...frameGenerationStatus.value.get(3), 
          last: true,
          lastModelSource: ctaFrames.firstModelSource,
          lastNanoImageUrl: ctaFrames.firstNanoImageUrl,
          lastSeedreamImageUrl: ctaFrames.firstSeedreamImageUrl
        })
        console.log('[Storyboards] Assigned CTA last frame:', ctaFrames.first)
      }
      
      // Trigger reactivity to ensure UI updates
      await nextTick()
      triggerRef(selectedStoryboard)
      console.log('[Storyboards] Frame assignments completed, reactivity triggered')
      
      // Log final state for debugging
      console.log('[Storyboards] Final segment states:', selectedStoryboard.value.segments.map((seg, idx) => ({
        index: idx,
        type: seg.type,
        firstFrameImage: seg.firstFrameImage,
        lastFrameImage: seg.lastFrameImage,
      })))
    }

    const frameCount = frames.length
    const mode = selectedStoryboard.value.meta.mode || 'production'
    toast.add({
      title: 'Frames Generated',
      description: mode === 'demo' 
        ? `Generated ${frameCount} frame(s) for first scene (demo mode)`
        : `Frame images have been generated for all scenes`,
      color: 'green',
    })
    console.log('[Storyboards] Frame generation completed successfully')
  } catch (err: any) {
    console.error('[Storyboards] Error generating frames:', err)
    frameGenerationError.value = err.data?.message || err.message || 'Failed to generate frame images'
    toast.add({
      title: 'Frame Generation Error',
      description: frameGenerationError.value,
      color: 'red',
    })
  } finally {
    // Always clear the spinner, even on error or timeout
    generatingFrames.value = false
    console.log('[Storyboards] Frame generation spinner cleared')
  }
}

const allFramesReady = computed(() => {
  if (!selectedStoryboard.value) return false
  
  // In demo mode, only check hook segment (first scene)
  if (isDemoMode.value) {
    const hookSegment = selectedStoryboard.value.segments[0]
    if (!hookSegment) return false
    
    const hookStatus = frameGenerationStatus.value.get(0) || {}
    return !!(hookSegment.firstFrameImage && hookSegment.lastFrameImage && hookStatus.first && hookStatus.last)
  }
  
  // Production mode: Check that all required frames are ready
  for (let i = 0; i < selectedStoryboard.value.segments.length; i++) {
    const segment = selectedStoryboard.value.segments[i]
    const status = frameGenerationStatus.value.get(i)
    
    // Hook needs first and last
    if (i === 0) {
      if (!segment.firstFrameImage || !segment.lastFrameImage) return false
    }
    // Body segments need first (from previous) and last
    else if (i < 3) {
      if (!segment.firstFrameImage || !segment.lastFrameImage) return false
    }
    // CTA needs first (from previous) and last
    else {
      if (!segment.firstFrameImage || !segment.lastFrameImage) return false
    }
  }
  
  return true
})

const proceedToGeneration = () => {
  if (!selectedStoryboard.value) {
    toast.add({
      title: 'No Storyboard',
      description: 'Storyboard is not available',
      color: 'yellow',
    })
    return
  }

  if (!allFramesReady.value) {
    toast.add({
      title: 'Frames Not Ready',
      description: 'Please wait for all frame images to be generated before continuing',
      color: 'yellow',
    })
    return
  }

  // Save selected storyboard for generation
  if (process.client) {
    sessionStorage.setItem('selectedStoryboard', JSON.stringify(selectedStoryboard.value))
    sessionStorage.setItem('promptData', JSON.stringify(promptData.value))
  }

  // Navigate to generation page
  router.push('/generate')
}

const handleFrameImageUpload = async (segmentIndex: number, field: 'firstFrameImage' | 'lastFrameImage', file: File | string | null) => {
  if (!selectedStoryboard.value) return

  const segment = selectedStoryboard.value.segments[segmentIndex]
  if (!segment) return

  // If it's a File, we need to upload it first
  if (file instanceof File) {
    try {
      const formData = new FormData()
      formData.append('image', file)
      
      const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
        method: 'POST',
        body: formData,
      })

      if (uploadResult.urls && uploadResult.urls.length > 0) {
        segment[field] = uploadResult.urls[0]
        // Update frame generation status
        const status = frameGenerationStatus.value.get(segmentIndex) || {}
        if (field === 'firstFrameImage') {
          status.first = true
        } else {
          status.last = true
        }
        frameGenerationStatus.value.set(segmentIndex, status)
        toast.add({
          title: 'Image Uploaded',
          description: 'Frame image has been uploaded successfully',
          color: 'green',
        })
      } else {
        throw new Error('Upload failed: No URL returned')
      }
    } catch (err: any) {
      toast.add({
        title: 'Upload Failed',
        description: err.data?.message || err.message || 'Failed to upload image',
        color: 'red',
      })
    }
  } else if (typeof file === 'string') {
    // It's already a URL
    segment[field] = file
    // Update frame generation status
    const status = frameGenerationStatus.value.get(segmentIndex) || {}
    if (field === 'firstFrameImage') {
      status.first = true
    } else {
      status.last = true
    }
    frameGenerationStatus.value.set(segmentIndex, status)
  } else {
    // Clear the image
    segment[field] = undefined
    // Update frame generation status
    const status = frameGenerationStatus.value.get(segmentIndex) || {}
    if (field === 'firstFrameImage') {
      status.first = false
    } else {
      status.last = false
    }
    frameGenerationStatus.value.set(segmentIndex, status)
  }
}
</script>


