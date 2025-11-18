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
            <div class="flex items-center gap-3">
              <UButton
                v-if="hasGeneratedVideos"
                color="secondary"
                variant="solid"
                @click="handleEditComposedVideo"
                :loading="composingVideo"
                class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-h-[44px]"
              >
                <UIcon name="i-heroicons-pencil-square" class="mr-2" />
                Edit Composed Video
              </UButton>
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
            <!-- View Mode Toggle -->
            <UFormField label="View Mode" name="viewMode" class="mb-0">
              <USelect
                v-model="viewMode"
                :items="[
                  { label: '👤 User', value: 'user' },
                  { label: '⚙️ Admin', value: 'admin' }
                ]"
              />
            </UFormField>
            
            <!-- Only show in Admin mode -->
            <template v-if="viewMode === 'admin'">
              <UFormField label="Style" name="style" class="mb-0">
                <USelect
                  :model-value="currentStyle"
                  :items="availableStyles.map(s => ({ label: s, value: s }))"
                  @update:model-value="regenerateStoryboard"
                  :disabled="loading"
                />
              </UFormField>
              <UFormField label="Video Model" name="model" class="mb-0">
                <USelect
                  :model-value="currentModel"
                  :items="videoModelOptions"
                  @update:model-value="handleModelChange"
                  :disabled="loading"
                />
              </UFormField>
            </template>
          </div>
        </div>

        <!-- Progress Indicator -->
        <div class="mb-6 flex items-center justify-center">
          <div class="flex items-center gap-2 text-sm">
            <UBadge color="green" variant="solid" size="sm">✓</UBadge>
            <span class="text-gray-600 dark:text-gray-400">Stories</span>
            <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400" />
            
            <UBadge color="blue" variant="solid" size="sm">2</UBadge>
            <span class="font-semibold text-gray-900 dark:text-white">Review Storyboard</span>
            <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400" />
            
            <UBadge color="gray" variant="soft" size="sm">3</UBadge>
            <span class="text-gray-400">Generate Video</span>
          </div>
        </div>

        <!-- Manual Frame Generation Button -->
        <UCard v-if="selectedStoryboard" class="mb-6">
          <template #header>
            <h3 class="text-lg font-semibold">Generate Frame Images</h3>
          </template>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="font-medium">All Scenes</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  <span v-if="allFramesReady">✓ All frames generated</span>
                  <span v-else-if="generatingFrames">Generating frames...</span>
                  <span v-else>Frames not generated</span>
                </div>
              </div>
              <UButton
                :loading="generatingFrames"
                :disabled="generatingFrames"
                @click="generateFrames"
                color="primary"
                size="sm"
              >
                <UIcon name="i-heroicons-photo" class="mr-2" />
                <span v-if="allFramesReady">Regenerate All Frames</span>
                <span v-else>Generate All Frames</span>
              </UButton>
            </div>
            
            <!-- Enhance All Frames Button (Admin Only) -->
            <div v-if="viewMode === 'admin' && allFramesReady" class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex-1">
                <div class="font-medium">Enhance with Seedream-4</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  <span v-if="allFramesEnhanced">✓ All frames enhanced</span>
                  <span v-else-if="enhancingFrames">Enhancing frames...</span>
                  <span v-else>Apply AI enhancement to improve quality</span>
                </div>
              </div>
              <UButton
                :loading="enhancingFrames"
                :disabled="enhancingFrames || !allFramesReady"
                @click="enhanceFrames"
                color="blue"
                size="sm"
              >
                <UIcon name="i-heroicons-sparkles" class="mr-2" />
                <span v-if="allFramesEnhanced">Re-enhance All Frames</span>
                <span v-else>Enhance All Frames</span>
              </UButton>
            </div>
          </div>
        </UCard>

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

        <!-- Frame Enhancement Status -->
        <UAlert
          v-if="enhancingFrames"
          color="blue"
          variant="soft"
          class="mb-6"
        >
          <template #title>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5 animate-pulse" />
              Enhancing Frames with Seedream-4
            </div>
          </template>
          <template #description>
            Applying AI enhancement to improve lighting, color, and quality. This may take a few minutes...
          </template>
        </UAlert>

        <UAlert
          v-else-if="enhancementError"
          color="red"
          variant="soft"
          class="mb-6"
        >
          <template #title>Frame Enhancement Failed</template>
          <template #description>
            {{ enhancementError }}
          </template>
          <template #actions>
            <UButton
              variant="ghost"
              color="red"
              size="sm"
              @click="enhanceFrames"
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
              <button 
                v-if="viewMode === 'user'"
                @click="toggleSegment(index)"
                class="w-full flex items-center justify-between cursor-pointer"
                type="button"
              >
                <div class="flex items-center gap-3">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ getSegmentLabel(segment.type) }}
                  </h3>
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    {{ segment.startTime }}s - {{ segment.endTime }}s
                  </span>
                  
                  <!-- Status Badge -->
                  <UBadge 
                    v-if="getSegmentStatus(index) === 'ready'"
                    color="green"
                    variant="soft"
                    size="xs"
                  >
                    ✓ Ready
                  </UBadge>
                  <UBadge 
                    v-else-if="getSegmentStatus(index) === 'generating'"
                    color="blue"
                    variant="soft"
                    size="xs"
                  >
                    ⏳ Generating...
                  </UBadge>
                  <UBadge
                    v-else-if="isDemoMode && index > 0"
                    color="yellow"
                    variant="soft"
                    size="xs"
                  >
                    Demo: Skipped
                  </UBadge>
                </div>
                
                <!-- Expand/Collapse Icon -->
                <UIcon 
                  :name="expandedSegments.includes(index) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-5 h-5 text-gray-500"
                />
              </button>
              
              <!-- Admin Mode: Non-collapsible -->
              <div v-else class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ getSegmentLabel(segment.type) }}
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

            <!-- Content (show/hide based on mode and expanded state) -->
            <div 
              v-show="viewMode === 'admin' || expandedSegments.includes(index)"
              class="space-y-4"
            >
              <!-- Scene Description -->
              <UFormField 
                :label="viewMode === 'user' ? 'What happens?' : 'Scene Description'" 
                :name="`segment-${index}-description`"
              >
                <UTextarea
                  v-model="segment.description"
                  :rows="2"
                  placeholder="Describe what happens in this scene"
                  class="w-full"
                  @input="debouncedSave"
                />
              </UFormField>

              <!-- Visual Prompt (Admin only) -->
              <UFormField 
                v-if="viewMode === 'admin'"
                label="Visual Prompt" 
                :name="`segment-${index}-visual`"
              >
                <UTextarea
                  v-model="segment.visualPrompt"
                  :rows="3"
                  placeholder="Describe the visual style and composition for this scene"
                  class="w-full"
                  @input="debouncedSave"
                />
                <template #description>
                  This prompt will be used to generate the frame image for this scene
                </template>
              </UFormField>

              <!-- USER MODE: Side-by-Side Frames -->
              <div v-if="viewMode === 'user'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Opening Shot (First Frame) -->
                <UFormField label="Opening Shot">
                  <div v-if="segment.firstFrameImage" class="space-y-2">
                    <div class="relative w-full">
                      <NuxtImg
                        :src="segment.firstFrameImage"
                        alt="Opening shot"
                        class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                        loading="lazy"
                      />
                    </div>
                    <ImageUpload
                      v-model="segment.firstFrameImage"
                      @upload="(file) => handleFrameImageUpload(index, 'firstFrameImage', file)"
                      button-text="Replace"
                    />
                  </div>
                  <div v-else class="aspect-video bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center p-6">
                    <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mb-2" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">Frame will appear here</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">~30 seconds</p>
                  </div>
                </UFormField>

                <!-- Closing Shot (Last Frame) -->
                <UFormField 
                  v-if="segment.type !== 'cta'"
                  label="Closing Shot"
                >
                  <div v-if="segment.lastFrameImage" class="space-y-2">
                    <div class="relative w-full">
                      <NuxtImg
                        :src="segment.lastFrameImage"
                        alt="Closing shot"
                        class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                        loading="lazy"
                      />
                    </div>
                    <ImageUpload
                      v-model="segment.lastFrameImage"
                      @upload="(file) => handleFrameImageUpload(index, 'lastFrameImage', file)"
                      button-text="Replace"
                    />
                  </div>
                  <div v-else class="aspect-video bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center p-6">
                    <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mb-2" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">Frame will appear here</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">~30 seconds</p>
                  </div>
                </UFormField>

                <!-- CTA: Only show first frame as "Final Frame" -->
                <UFormField 
                  v-else
                  label="Final Frame"
                >
                  <div v-if="segment.lastFrameImage" class="space-y-2">
                    <div class="relative w-full">
                      <NuxtImg
                        :src="segment.lastFrameImage"
                        alt="Final frame"
                        class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                        loading="lazy"
                      />
                    </div>
                    <ImageUpload
                      v-model="segment.lastFrameImage"
                      @upload="(file) => handleFrameImageUpload(index, 'lastFrameImage', file)"
                      button-text="Replace"
                    />
                  </div>
                  <div v-else class="aspect-video bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center p-6">
                    <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mb-2" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">Frame will appear here</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">~30 seconds</p>
                  </div>
                </UFormField>
              </div>

              <!-- ADMIN MODE: Stacked Frames (existing layout) -->
              <template v-else>
              <!-- First Frame Image -->
              <UFormField label="First Frame Image" :name="`segment-${index}-first-frame`">
                <div v-if="segment.firstFrameImage || (generatingFrames && !segment.firstFrameImage)" class="space-y-2">
                  <!-- Skeleton while generating -->
                  <div v-if="generatingFrames && !segment.firstFrameImage" class="relative w-full max-w-md">
                    <USkeleton class="w-full aspect-video rounded-lg" />
                  </div>
                  <!-- Actual image when available -->
                  <div v-else-if="segment.firstFrameImage" class="relative w-full max-w-md">
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
                <div v-if="segment.lastFrameImage || (generatingFrames && !segment.lastFrameImage)" class="space-y-2">
                  <!-- Skeleton while generating -->
                  <div v-if="generatingFrames && !segment.lastFrameImage" class="relative w-full max-w-md">
                    <USkeleton class="w-full aspect-video rounded-lg" />
                  </div>
                  <!-- Actual image when available -->
                  <div v-else-if="segment.lastFrameImage" class="relative w-full max-w-md">
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
              </template>
              <!-- End Admin Mode -->
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
            v-if="hasGeneratedVideos"
            color="secondary"
            variant="solid"
            @click="handleEditComposedVideo"
            :loading="composingVideo"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-h-[44px]"
          >
            <UIcon name="i-heroicons-pencil-square" class="mr-2" />
            Edit Composed Video
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
const enhancingFrames = ref(false)
const enhancementError = ref<string | null>(null)
const currentStyle = ref<string>('Cinematic')
const composingVideo = ref(false)

// View mode toggle: 'user' (simplified) or 'admin' (full control)
const viewMode = ref<'user' | 'admin'>('user')

// Expanded segments for accordion behavior
const expandedSegments = ref<number[]>([])

// Toggle segment expansion
const toggleSegment = (index: number) => {
  if (viewMode.value === 'user') {
    // Accordion behavior: only one open at a time
    expandedSegments.value = expandedSegments.value.includes(index) ? [] : [index]
  } else {
    // Admin: allow multiple open
    const idx = expandedSegments.value.indexOf(index)
    if (idx > -1) {
      expandedSegments.value.splice(idx, 1)
    } else {
      expandedSegments.value.push(index)
    }
  }
}

// Get friendly segment label based on mode
const getSegmentLabel = (type: string) => {
  if (viewMode.value === 'admin') {
    return type === 'hook' ? 'Hook' : 
           type === 'cta' ? 'Call to Action' : 
           type === 'body1' ? 'Body 1' : 'Body 2'
  }
  // User mode - friendlier labels
  return type === 'hook' ? 'Intro' : 
         type === 'cta' ? 'Final Message' : 
         type === 'body1' ? 'Scene 1' : 'Scene 2'
}

// Get segment status for badges
const getSegmentStatus = (index: number): 'ready' | 'generating' | 'pending' | 'error' => {
  const segment = selectedStoryboard.value?.segments[index]
  if (!segment) return 'pending'
  
  if (generatingFrames.value) return 'generating'
  if (segment.firstFrameImage && (segment.type === 'cta' ? true : segment.lastFrameImage)) return 'ready'
  if (frameGenerationError.value) return 'error'
  return 'pending'
}

// Check if videos have been generated (exist in sessionStorage)
const hasGeneratedVideos = computed(() => {
  if (!process.client) return false
  const clipsData = sessionStorage.getItem('editorClips')
  return !!clipsData
})

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | null = null

// Save storyboard state to localStorage
const saveStoryboardState = () => {
  if (!process.client || !selectedStoryboard.value) return
  
  try {
    // Convert frameGenerationStatus Map to plain object for storage
    const frameStatusObj: Record<string, any> = {}
    frameGenerationStatus.value.forEach((value, key) => {
      frameStatusObj[String(key)] = value
    })
    
    const stateToSave = {
      segments: selectedStoryboard.value.segments.map(seg => ({
        description: seg.description,
        visualPrompt: seg.visualPrompt,
        firstFrameImage: seg.firstFrameImage,
        lastFrameImage: seg.lastFrameImage,
        type: seg.type,
        startTime: seg.startTime,
        endTime: seg.endTime,
      })),
      meta: {
        style: selectedStoryboard.value.meta.style,
        mode: selectedStoryboard.value.meta.mode,
        aspectRatio: selectedStoryboard.value.meta.aspectRatio,
        model: selectedStoryboard.value.meta.model,
      },
      frameGenerationStatus: frameStatusObj,
      timestamp: Date.now(),
    }
    
    const storageKey = `storyboard-state-${selectedStoryboard.value.id}`
    localStorage.setItem(storageKey, JSON.stringify(stateToSave))
    console.log('[Storyboards] Saved storyboard state to localStorage:', storageKey)
  } catch (error) {
    console.error('[Storyboards] Failed to save storyboard state:', error)
  }
}

// Debounced save function
const debouncedSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveStoryboardState()
  }, 500)
}

// Load storyboard state from localStorage
const loadStoryboardState = (storyboardId: string): any | null => {
  if (!process.client) return null
  
  try {
    const storageKey = `storyboard-state-${storyboardId}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved)
      console.log('[Storyboards] Loaded storyboard state from localStorage:', storageKey)
      return parsed
    }
  } catch (error) {
    console.error('[Storyboards] Failed to load storyboard state:', error)
  }
  return null
}
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

// Video model options
const videoModelOptions = [
  { label: 'Veo 3.1', value: 'google/veo-3.1' },
  { label: 'Veo 3 Fast', value: 'google/veo-3-fast' },
]

const currentModel = computed(() => {
  return selectedStoryboard.value?.meta?.model || 'google/veo-3.1'
})

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
    // Production mode: frames are now generated manually per segment
    // No automatic generation
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
    
    // Try to load from localStorage if sessionStorage is empty (user navigated away and came back)
    if (!storedStory || !storedPromptData) {
      // Check if there's a saved storyboard state in localStorage
      const savedStoryboards = Object.keys(localStorage)
        .filter(key => key.startsWith('storyboard-state-'))
        .map(key => {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}')
            return { key, data, timestamp: data.timestamp || 0 }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0))
      
      if (savedStoryboards.length > 0 && savedStoryboards[0]) {
        const latest = savedStoryboards[0]
        console.log('[Storyboards] Found saved storyboard state, attempting to restore...')
        // We can't fully restore without story/prompt data, but we can show a message
        error.value = 'Session expired. Please start a new generation from the home page.'
        loading.value = false
        return
      } else {
        error.value = 'No story or prompt data found. Please start from the home page.'
        loading.value = false
        return
      }
    }

    try {
      selectedStory.value = JSON.parse(storedStory)
      promptData.value = JSON.parse(storedPromptData)
      
      // Parse mode BEFORE generating storyboards
      const mode = storedMode === 'demo' ? 'demo' : 'production'
      
      // Pass mode to generateStoryboards so it's set correctly before frame generation
      await generateStoryboards(undefined, mode)
      
    } catch (err: any) {
      error.value = err.message || 'Failed to load story data'
      loading.value = false
    }
  }
})

// Cleanup timer on unmount
onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  // Final save before unmount
  if (selectedStoryboard.value) {
    saveStoryboardState()
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
      // Set mode from parameter, or default to production
      if (!selectedStoryboard.value.meta) {
        selectedStoryboard.value.meta = {}
      }
      selectedStoryboard.value.meta.mode = mode || 'production'
      // Set model if not already set, default to veo-3.1
      if (!selectedStoryboard.value.meta.model) {
        selectedStoryboard.value.meta.model = 'google/veo-3.1'
      }
      console.log('[Storyboards] Mode set to:', selectedStoryboard.value.meta.mode)
      console.log('[Storyboards] Model set to:', selectedStoryboard.value.meta.model)
      
      // Try to load saved state from localStorage
      const savedState = loadStoryboardState(selectedStoryboard.value.id)
      if (savedState && savedState.segments) {
        // Restore segment edits if they exist
        savedState.segments.forEach((savedSeg: any, index: number) => {
          if (selectedStoryboard.value && selectedStoryboard.value.segments[index]) {
            const currentSeg = selectedStoryboard.value.segments[index]
            // Only restore if saved state is newer or if current is empty
            if (savedSeg.description) {
              currentSeg.description = savedSeg.description
            }
            if (savedSeg.visualPrompt) {
              currentSeg.visualPrompt = savedSeg.visualPrompt
            }
            if (savedSeg.firstFrameImage) {
              currentSeg.firstFrameImage = savedSeg.firstFrameImage
            }
            if (savedSeg.lastFrameImage) {
              currentSeg.lastFrameImage = savedSeg.lastFrameImage
            }
          }
        })
        // Restore model if saved
        if (savedState.meta?.model && selectedStoryboard.value.meta) {
          selectedStoryboard.value.meta.model = savedState.meta.model
          console.log('[Storyboards] Restored model from localStorage:', savedState.meta.model)
        }
        // Restore frameGenerationStatus if saved
        if (savedState.frameGenerationStatus) {
          const restoredMap = new Map<number, any>()
          Object.entries(savedState.frameGenerationStatus).forEach(([key, value]) => {
            restoredMap.set(Number(key), value)
          })
          frameGenerationStatus.value = restoredMap
          console.log('[Storyboards] Restored frameGenerationStatus from localStorage:', restoredMap.size, 'entries')
        }
        console.log('[Storyboards] Restored storyboard state from localStorage')
      }
    }
    loading.value = false
    
    // Frame generation is now manual - user clicks buttons to generate per segment
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

const handleModelChange = async (newModel: string) => {
  if (!selectedStoryboard.value) return
  
  if (newModel === currentModel.value) return
  
  // Update model in storyboard meta
  if (!selectedStoryboard.value.meta) {
    selectedStoryboard.value.meta = {}
  }
  selectedStoryboard.value.meta.model = newModel
  
  // Save to localStorage
  debouncedSave()
  
  toast.add({
    title: 'Model Updated',
    description: `Video generation will use ${newModel === 'google/veo-3.1' ? 'Veo 3.1' : 'Veo 3 Fast'}`,
    color: 'blue',
  })
}

const generateFrames = async () => {
  if (!selectedStoryboard.value || !selectedStory.value) {
    return
  }

  // Prevent multiple simultaneous calls
  if (generatingFrames.value) {
    console.warn('[Storyboards] Frame generation already in progress, ignoring duplicate call')
    return
  }

  generatingFrames.value = true
  frameGenerationError.value = null

  try {
    console.log('[Storyboards] Starting frame generation...')
    console.log('[Storyboards] Product images from promptData:', promptData.value.productImages)
    console.log('[Storyboards] Product images count:', promptData.value.productImages?.length || 0)
    console.log('[Storyboards] Product images array:', Array.isArray(promptData.value.productImages) ? promptData.value.productImages : 'NOT AN ARRAY')
    
    // Clear existing frame generation status to ensure fresh regeneration
    // This ensures that if frames are regenerated, the comparison URLs are also refreshed
    frameGenerationStatus.value.clear()
    console.log('[Storyboards] Cleared existing frame generation status for fresh regeneration')
    
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
    
    console.log('[Storyboards] ========================================')
    console.log('[Storyboards] Frame Generation API Response')
    console.log('[Storyboards] ========================================')
    console.log('[Storyboards] API response:', result)

    // Map frames to segments
    // Frames structure: [{ segmentIndex: 0, frameType: 'first', imageUrl: '...' }, ...]
    const frames = result.frames || []
    
    console.log('[Storyboards] Received frames:', frames.length, 'frames')
    
    // Log each frame received
    frames.forEach((frame: any, index: number) => {
      console.log(`  Frame ${index + 1}: segmentIndex=${frame.segmentIndex}, frameType=${frame.frameType}, url=${frame.imageUrl?.substring(0, 50)}...`)
    })
    
    if (!frames || frames.length === 0) {
      console.warn('[Storyboards] ⚠️ No frames returned from API')
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
    
    console.log('[Storyboards] Frame map created:')
    frameMap.forEach((value, key) => {
      console.log(`  Segment ${key}: first=${!!value.first}, last=${!!value.last}`)
    })

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
      
      console.log('[Storyboards] ========================================')
      console.log('[Storyboards] Assigning CTA Frames')
      console.log('[Storyboards] ========================================')
      console.log('[Storyboards] CTA frames from map:', ctaFrames)
      console.log('[Storyboards] CTA has first in map:', !!ctaFrames?.first)
      console.log('[Storyboards] CTA has last in map:', !!ctaFrames?.last)
      console.log('[Storyboards] Body2 last frame (for CTA first):', body2LastFrame?.substring(0, 60))
      
      if (body2LastFrame) {
        selectedStoryboard.value.segments[3].firstFrameImage = body2LastFrame
        frameGenerationStatus.value.set(3, { 
          ...frameGenerationStatus.value.get(3), 
          first: true,
          firstModelSource: body2LastModelSource,
          firstNanoImageUrl: body2LastNanoImageUrl,
          firstSeedreamImageUrl: body2LastSeedreamImageUrl
        })
        console.log('[Storyboards] ✓ Assigned CTA first frame (from body2 last):', body2LastFrame.substring(0, 60))
      } else {
        console.error('[Storyboards] ✗ Could not assign CTA first frame - body2LastFrame is missing')
      }
      
      if (ctaFrames?.last) {
        // CTA's last frame is the final frame of the video
        selectedStoryboard.value.segments[3].lastFrameImage = ctaFrames.last
        frameGenerationStatus.value.set(3, { 
          ...frameGenerationStatus.value.get(3), 
          last: true,
          lastModelSource: ctaFrames.lastModelSource,
          lastNanoImageUrl: ctaFrames.lastNanoImageUrl,
          lastSeedreamImageUrl: ctaFrames.lastSeedreamImageUrl
        })
        console.log('[Storyboards] ✓ Assigned CTA last frame:', ctaFrames.last.substring(0, 60))
      } else {
        console.error('[Storyboards] ✗✗✗ CTA last frame is MISSING from frameMap!')
        console.error('[Storyboards] This is the root cause - API did not generate CTA last frame')
        console.error('[Storyboards] frameMap.get("3"):', ctaFrames)
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
    
    // Save storyboard state including frameGenerationStatus
    saveStoryboardState()
    
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

const enhanceFrames = async () => {
  if (!selectedStoryboard.value || !selectedStory.value) {
    return
  }

  // Prevent multiple simultaneous calls
  if (enhancingFrames.value) {
    console.warn('[Storyboards] Frame enhancement already in progress, ignoring duplicate call')
    return
  }

  enhancingFrames.value = true
  enhancementError.value = null

  try {
    console.log('[Storyboards] Starting frame enhancement with seedream-4...')
    
    const requestBody = {
      storyboard: selectedStoryboard.value,
    }

    const result = await $fetch('/api/enhance-frames', {
      method: 'POST',
      body: requestBody,
    })
    
    console.log('[Storyboards] Enhancement API response:', result)

    if (!result.success) {
      throw new Error(result.error || 'Enhancement failed')
    }

    const enhancedFrames = result.enhancedFrames || []
    
    console.log('[Storyboards] Received enhanced frames:', enhancedFrames.length)
    
    // Update segments with enhanced frames
    enhancedFrames.forEach((frame: {
      segmentIndex: number
      frameType: 'first' | 'last'
      imageUrl: string
      modelSource: 'seedream-4' | 'nano-banana'
      nanoImageUrl: string
      seedreamImageUrl?: string
      error?: string
    }) => {
      if (selectedStoryboard.value && selectedStoryboard.value.segments[frame.segmentIndex]) {
        const segment = selectedStoryboard.value.segments[frame.segmentIndex]
        
        // Update the frame URL with seedream version
        if (frame.frameType === 'first') {
          segment.firstFrameImage = frame.imageUrl
        } else {
          segment.lastFrameImage = frame.imageUrl
        }
        
        // Update frameGenerationStatus with seedream URLs
        const status = frameGenerationStatus.value.get(frame.segmentIndex) || {}
        if (frame.frameType === 'first') {
          status.firstModelSource = frame.modelSource
          status.firstSeedreamImageUrl = frame.seedreamImageUrl
          status.firstNanoImageUrl = frame.nanoImageUrl
        } else {
          status.lastModelSource = frame.modelSource
          status.lastSeedreamImageUrl = frame.seedreamImageUrl
          status.lastNanoImageUrl = frame.nanoImageUrl
        }
        frameGenerationStatus.value.set(frame.segmentIndex, status)
      }
    })
    
    // Trigger reactivity
    await nextTick()
    triggerRef(selectedStoryboard)
    
    // Save state
    saveStoryboardState()
    
    const summary = result.summary || { total: 0, enhanced: 0, failed: 0 }
    
    toast.add({
      title: 'Frames Enhanced',
      description: `Successfully enhanced ${summary.enhanced} of ${summary.total} frames${summary.failed > 0 ? ` (${summary.failed} failed)` : ''}`,
      color: 'green',
    })
    console.log('[Storyboards] Frame enhancement completed successfully')
  } catch (err: any) {
    console.error('[Storyboards] Error enhancing frames:', err)
    enhancementError.value = err.data?.message || err.message || 'Failed to enhance frames'
    toast.add({
      title: 'Frame Enhancement Error',
      description: enhancementError.value,
      color: 'red',
    })
  } finally {
    enhancingFrames.value = false
    console.log('[Storyboards] Frame enhancement spinner cleared')
  }
}

const allFramesEnhanced = computed(() => {
  if (!selectedStoryboard.value || !allFramesReady.value) {
    return false
  }
  
  // Check if all frames have been enhanced (modelSource is 'seedream-4')
  const segments = selectedStoryboard.value.segments
  
  for (let i = 0; i < segments.length; i++) {
    const status = frameGenerationStatus.value.get(i)
    if (!status) return false
    
    // Check first frame
    if (status.firstModelSource !== 'seedream-4') return false
    
    // Check last frame (except for CTA which may not have a separate last frame)
    if (segments[i].type !== 'cta' && status.lastModelSource !== 'seedream-4') return false
    if (segments[i].type === 'cta' && segments[i].lastFrameImage && status.lastModelSource !== 'seedream-4') return false
  }
  
  return true
})

const allFramesReady = computed(() => {
  if (!selectedStoryboard.value) {
    console.log('[allFramesReady] No storyboard')
    return false
  }
  
  // Check if all required data exists for video generation
  // This is reactive and will update whenever segment data changes
  
  const segments = selectedStoryboard.value.segments
  if (!segments || segments.length === 0) {
    console.log('[allFramesReady] No segments')
    return false
  }
  
  // In demo mode, only check hook segment (first scene)
  if (isDemoMode.value) {
    const hookSegment = segments[0]
    if (!hookSegment) {
      console.log('[allFramesReady] Demo mode: No hook segment')
      return false
    }
    
    // Check if hook has all required data
    const hasRequiredData = !!(
      hookSegment.firstFrameImage && 
      hookSegment.lastFrameImage &&
      hookSegment.visualPrompt &&
      hookSegment.description
    )
    
    if (!hasRequiredData) {
      console.log('[allFramesReady] Demo mode: Hook segment missing data:', {
        firstFrameImage: !!hookSegment.firstFrameImage,
        lastFrameImage: !!hookSegment.lastFrameImage,
        visualPrompt: !!hookSegment.visualPrompt,
        description: !!hookSegment.description,
      })
    }
    
    return hasRequiredData
  }
  
  // Production mode: Check that all segments have required data
  // We check actual data existence, not generation status
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    
    // Each segment needs:
    // 1. Frame images (first and last)
    // 2. Visual prompt (for video generation)
    // 3. Description (for context)
    // 4. Timing (startTime, endTime)
    const hasFrames = !!(segment.firstFrameImage && segment.lastFrameImage)
    const hasPrompt = !!segment.visualPrompt
    const hasDescription = !!segment.description
    const hasTiming = segment.startTime !== undefined && segment.endTime !== undefined
    
    if (!hasFrames || !hasPrompt || !hasDescription || !hasTiming) {
      console.log(`[allFramesReady] Segment ${i} (${segment.type}) missing requirements:`, {
        firstFrameImage: !!segment.firstFrameImage,
        lastFrameImage: !!segment.lastFrameImage,
        visualPrompt: !!segment.visualPrompt,
        description: !!segment.description,
        startTime: segment.startTime,
        endTime: segment.endTime,
      })
      return false
    }
  }
  
  console.log('[allFramesReady] All requirements met! Ready for video generation.')
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

  // Clear old generation data before navigating to start fresh
  if (process.client) {
    sessionStorage.removeItem('generateJobState')
    sessionStorage.removeItem('editorClips')
    sessionStorage.removeItem('editorComposedVideo')
    
    // Save selected storyboard for generation
    sessionStorage.setItem('generateStoryboard', JSON.stringify(selectedStoryboard.value))
    sessionStorage.setItem('promptData', JSON.stringify(promptData.value))
  }

  // Navigate to generation page
  router.push('/generate')
}

const handleEditComposedVideo = async () => {
  if (!selectedStoryboard.value) {
    toast.add({
      title: 'No Storyboard',
      description: 'Storyboard is not available',
      color: 'yellow',
    })
    return
  }

  composingVideo.value = true

  try {
    // Check if there are generated clips in sessionStorage from the generate page
    if (process.client) {
      const clipsData = sessionStorage.getItem('editorClips')
      if (clipsData) {
        const clips = JSON.parse(clipsData)
        console.log('[Storyboards] Found clips in sessionStorage, composing video:', clips)
        
        // Format clips for composition API
        // Calculate cumulative start/end times for proper sequencing
        let currentStartTime = 0
        const formattedClips = clips.map((clip: any) => {
          const clipStart = currentStartTime
          const clipEnd = currentStartTime + clip.duration
          currentStartTime = clipEnd
          
          return {
            videoUrl: clip.videoUrl,
            voiceUrl: clip.voiceUrl || undefined,
            startTime: clipStart,
            endTime: clipEnd,
            type: clip.type || 'scene',
          }
        })
        
        // Compose the clips into one video
        const result = await $fetch('/api/compose-video', {
          method: 'POST',
          body: {
            clips: formattedClips,
            options: {
              transition: 'fade',
              musicVolume: 70,
              aspectRatio: selectedStoryboard.value.meta.aspectRatio || '16:9',
            },
          },
        })

        console.log('[Storyboards] Composed video result:', result)

        // Store composed video in sessionStorage for editor
        const composedVideoData = {
          videoUrl: result.videoUrl,
          videoId: result.videoId,
          name: 'Composed Video',
        }
        sessionStorage.setItem('editorComposedVideo', JSON.stringify(composedVideoData))
        
        // Clear the separate clips since we're using composed video
        sessionStorage.removeItem('editorClips')

        toast.add({
          title: 'Video Composed',
          description: 'Composed video ready for editing',
          color: 'success',
        })

        // Navigate to editor
        await router.push('/editor')
        return
      }
    }

    // If no clips found, check if we can get them from the storyboard segments
    // (This would require segments to have video URLs, which they don't at this stage)
    toast.add({
      title: 'No Videos Found',
      description: 'Please generate videos first by continuing to the generation page',
      color: 'yellow',
    })
  } catch (error: any) {
    console.error('[Storyboards] Error composing video:', error)
    toast.add({
      title: 'Composition Failed',
      description: error.message || 'Failed to compose video',
      color: 'error',
    })
  } finally {
    composingVideo.value = false
  }
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
        // Save state after image upload
        debouncedSave()
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
    // Save state after image change
    debouncedSave()
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
    // Save state after image removal
    debouncedSave()
  }
}
</script>


