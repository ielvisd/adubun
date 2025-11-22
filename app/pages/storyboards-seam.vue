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
        <!-- Prominent Mode Display -->
        <div class="bg-black dark:bg-gray-800 text-white py-4 px-6 rounded-lg">
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
                class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold"
              >
                <UIcon name="i-heroicons-pencil-square" class="mr-2" />
                Edit Composed Video
              </UButton>
              <UButton
                variant="ghost"
                color="gray"
                @click="$router.push('/stories')"
                class="text-white hover:bg-gray-700"
              >
                Back to Stories
              </UButton>
            </div>
          </div>
        </div>
        
        <!-- Header with Controls -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Edit Storyboard (Non-Seamless)
            </h1>
            <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              Non-seamless mode: Each scene starts with an independent frame for creative transitions. No closing shots needed.
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
                <div class="font-medium">All Scenes (First Frames Only)</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  <span v-if="allFramesReady">✓ All first frames generated</span>
                  <span v-else-if="generatingFrames">Generating first frames...</span>
                  <span v-else>First frames not generated</span>
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
            <div class="space-y-2">
              <p>Creating first frame images for each scene (non-seamless mode). This may take a minute...</p>
              <div class="text-xs text-blue-600 dark:text-blue-400 mt-2">
                ⚠️ All inputs are disabled during generation to prevent conflicts.
              </div>
            </div>
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
                <div class="flex items-center gap-2">
                  <UFormField label="Duration" :name="`segment-${index}-duration`" class="mb-0">
                    <USelect
                      :model-value="getSegmentDuration(segment)"
                      :items="durationOptions"
                      @update:model-value="(value: number) => handleDurationChange(index, value)"
                      :disabled="loading || generatingFrames || isFrameRegenerating(index)"
                      size="sm"
                      class="w-24"
                    />
                  </UFormField>
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
                  :rows="4"
                  placeholder="Describe what happens in this scene"
                  class="w-full"
                  :disabled="generatingFrames || isFrameRegenerating(index)"
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
                  :rows="6"
                  placeholder="Describe the visual style and composition"
                  class="w-full"
                  :disabled="generatingFrames || isFrameRegenerating(index)"
                  @input="debouncedSave"
                />
              </UFormField>

              <!-- Audio Notes -->
              <UFormField 
                label="Audio Notes" 
                :name="`segment-${index}-audio`"
              >
                <UTextarea
                  v-model="segment.audioNotes"
                  :rows="3"
                  placeholder="Dialogue: The man says: 'I spent $400 on a microphone so my voice would finally sound professional.'"
                  class="w-full"
                  :disabled="generatingFrames || isFrameRegenerating(index)"
                  @input="debouncedSave"
                />
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

                <!-- Note: Closing shots not needed in non-seamless mode -->
                <!-- Only first frames are generated for creative transitions -->
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
                    v-if="frameGenerationStatus.get(index)?.firstNanoImageUrl || frameGenerationStatus.get(index)?.firstSeedreamImageUrl"
                    :nano-image-url="frameGenerationStatus.get(index)?.firstNanoImageUrl"
                    :seedream-image-url="frameGenerationStatus.get(index)?.firstSeedreamImageUrl"
                    :show-comparison="showComparison.get(`${index}-first`) || false"
                    :frame-label="`${segment.type === 'hook' ? 'Hook' : segment.type === 'body' ? 'Body' : 'CTA'} First Frame`"
                    @show="showComparison.set(`${index}-first`, true)"
                    @close="showComparison.set(`${index}-first`, false)"
                  />
                </div>

                <!-- Last Frame Image: HIDDEN in non-seamless mode -->
                <div v-if="false">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Last Frame (Not used in non-seamless mode)
                  </label>
                  <div
                    class="relative border-2 border-dashed rounded-lg overflow-hidden transition-all"
                    :class="[
                      segment.lastFrameImage ? 'border-gray-300' : 'border-gray-300 bg-gray-50 dark:bg-gray-900',
                      (generatingFrames || isFrameRegenerating(index, 'last')) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary-400'
                    ]"
                    @click="!generatingFrames && !isFrameRegenerating(index, 'last') && triggerImageUpload(index, 'lastFrameImage')"
                    @dragover.prevent.stop="!generatingFrames && !isFrameRegenerating(index, 'last') && handleDragOver"
                    @dragenter.prevent.stop="!generatingFrames && !isFrameRegenerating(index, 'last') && handleDragEnter"
                    @dragleave.prevent.stop="!generatingFrames && !isFrameRegenerating(index, 'last') && handleDragLeave"
                    @drop.prevent.stop="!generatingFrames && !isFrameRegenerating(index, 'last') && handleImageDrop(index, 'lastFrameImage', $event)"
                  >
                    <!-- Skeleton while generating -->
                    <div v-if="generatingFrames && !segment.lastFrameImage" class="aspect-square flex items-center justify-center">
                      <USkeleton class="w-full h-full" />
                    </div>
                    <!-- Actual image when available -->
                    <div v-else-if="segment.lastFrameImage" class="aspect-square relative group bg-gray-200 dark:bg-gray-700">
                      <img
                        :key="`last-${index}-${segment.lastFrameImage}`"
                        :src="resolveImageUrl(segment.lastFrameImage)"
                        alt="Last frame preview"
                        class="absolute inset-0 w-full h-full object-cover z-0"
                        loading="eager"
                        crossorigin="anonymous"
                        referrerpolicy="no-referrer"
                        @error="handleImageError($event, index, 'last')"
                        @load="async () => {
                          console.log('[Storyboards] ✓ Last frame image loaded for segment', index)
                          console.log('[Storyboards] Image URL:', segment.lastFrameImage)
                          console.log('[Storyboards] Resolved URL:', resolveImageUrl(segment.lastFrameImage))
                          // Clear error state on successful load
                          delete imageLoadError.value[`last-${index}`]
                          // Check dimensions
                          const dims = await checkImageDimensions(resolveImageUrl(segment.lastFrameImage) || '')
                          if (dims) {
                            frameImageDimensions.value.set(`${index}-last`, dims)
                          }
                        }"
                      />
                      <!-- Fallback: Show if image fails to load -->
                      <div v-if="imageLoadError[`last-${index}`]" class="absolute inset-0 flex flex-col items-center justify-center text-xs text-gray-500 p-2 text-center bg-gray-200 dark:bg-gray-700 z-10">
                        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500 mb-2" />
                        <p class="font-medium">Failed to load image</p>
                        <p class="text-[10px] mt-1 break-all opacity-75">{{ segment.lastFrameImage?.substring(0, 50) }}...</p>
                        <UButton size="xs" color="primary" class="mt-2" @click="retryImageLoad(index, 'last')">
                          Retry
                        </UButton>
                      </div>
                      <!-- Overlay on hover - only shows on hover -->
                      <div class="absolute inset-0 bg-black opacity-0 group-hover:opacity-50 transition-opacity flex items-center justify-center pointer-events-none z-10">
                        <div class="opacity-0 group-hover:opacity-100 transition-opacity text-white text-center">
                          <UIcon name="i-heroicons-arrow-up-tray" class="w-6 h-6 mx-auto mb-1" />
                          <p class="text-xs">Click to change</p>
                        </div>
                      </div>
                      <!-- Model Source Badge -->
                      <UBadge
                        v-if="frameGenerationStatus.get(index)?.lastModelSource"
                        :color="frameGenerationStatus.get(index)?.lastModelSource === 'seedream-4' ? 'blue' : 'yellow'"
                        variant="solid"
                        class="absolute top-2 right-2 z-20"
                        size="xs"
                      >
                        {{ frameGenerationStatus.get(index)?.lastModelSource === 'seedream-4' ? 'SD4' : 'NB' }}
                      </UBadge>
                      <!-- Aspect Ratio/Resolution Warning -->
                      <UBadge
                        v-if="getFrameWarning(index, 'last')"
                        color="red"
                        variant="solid"
                        class="absolute top-2 left-2 z-20 max-w-[calc(100%-4rem)]"
                        size="xs"
                      >
                        {{ getFrameWarning(index, 'last') }}
                      </UBadge>
                      <!-- Regenerate Button -->
                      <UButton
                        v-if="segment.lastFrameImage"
                        icon="i-heroicons-arrow-path"
                        size="xs"
                        color="primary"
                        variant="solid"
                        class="absolute bottom-2 right-2 z-20"
                        :loading="regeneratingFrames.get(`${index}-last`)"
                        @click.stop="regenerateSingleFrame(index, 'lastFrameImage')"
                        :disabled="generatingFrames || regeneratingFrames.get(`${index}-last`)"
                      >
                        Regenerate
                      </UButton>
                    </div>
                    <!-- Empty state -->
                    <div v-else class="aspect-square flex flex-col items-center justify-center p-4 text-center">
                      <UIcon name="i-heroicons-photo" class="w-10 h-10 text-gray-400 mb-2" />
                      <p class="text-xs text-gray-500 dark:text-gray-400">Click or drag to upload</p>
                    </div>
                    <!-- Hidden file input -->
                    <input
                      :ref="el => setFileInputRef(el, index, 'last')"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      class="hidden"
                      @change="handleImageFileChange(index, 'lastFrameImage', $event)"
                    />
                  </div>
                  <!-- Frame Comparison -->
                  <FrameComparison
                    v-if="frameGenerationStatus.get(index)?.lastNanoImageUrl || frameGenerationStatus.get(index)?.lastSeedreamImageUrl"
                    :nano-image-url="frameGenerationStatus.get(index)?.lastNanoImageUrl"
                    :seedream-image-url="frameGenerationStatus.get(index)?.lastSeedreamImageUrl"
                    :show-comparison="showComparison.get(`${index}-last`) || false"
                    :frame-label="`${segment.type === 'hook' ? 'Hook' : segment.type === 'body' ? 'Body' : 'CTA'} Last Frame`"
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

        <!-- Action Buttons -->
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
            :disabled="!allFramesReady || generatingFrames"
            @click="proceedToGeneration"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-w-[200px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="allFramesReady && !generatingFrames">Continue to Generation</span>
            <span v-else-if="generatingFrames" class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              Generating Frames...
            </span>
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
import FrameComparison from '~/components/generation/FrameComparison.vue'
import { nextTick, triggerRef } from 'vue'
import { getModelById } from '~/config/video-models'

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
const regeneratingFrames = ref<Map<string, boolean>>(new Map())
const frameImageDimensions = ref<Map<string, { width: number; height: number; aspectRatio: string }>>(new Map())

// File input refs
const fileInputRefs = ref<Record<string, HTMLInputElement>>({})

// Image load error tracking
const imageLoadError = ref<Record<string, boolean>>({})

// View mode toggle: 'user' (simplified) or 'admin' (full control)
const viewMode = ref<'user' | 'admin'>('user')

// Available styles for storyboard regeneration (legacy - not currently used for regeneration)
const availableStyles = ref<string[]>(['Cinematic', 'Professional', 'Playful', 'Dramatic', 'Minimalist'])

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
           'Body'
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
        audioNotes: seg.audioNotes,
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

// Video model options
const videoModelOptions = [
  { label: 'Veo 3.1', value: 'google/veo-3.1' },
  { label: 'Veo 3 Fast', value: 'google/veo-3-fast' },
]

const currentModel = computed(() => {
  return selectedStoryboard.value?.meta?.model || 'google/veo-3.1'
})

// Get current video model config
const currentVideoModel = computed(() => {
  return getModelById(currentModel.value) || getModelById('google/veo-3.1')
})

// Duration options for current model
const durationOptions = computed(() => {
  const model = currentVideoModel.value
  if (!model || !model.durationOptions) {
    return [4, 6, 8].map(d => ({ label: `${d}s`, value: d }))
  }
  return model.durationOptions.map(d => ({ label: `${d}s`, value: d }))
})

// Aspect ratio options
const aspectRatioOptions = computed(() => {
  const model = currentVideoModel.value
  if (!model || !model.aspectRatioOptions) {
    return [
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' }
    ]
  }
  return model.aspectRatioOptions.map(ar => ({ label: ar, value: ar }))
})

// Resolution options
const resolutionOptions = [
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' }
]

// Current aspect ratio and resolution
const currentAspectRatio = computed(() => {
  return selectedStoryboard.value?.meta?.aspectRatio || '16:9'
})

const currentResolution = computed(() => {
  return selectedStoryboard.value?.meta?.resolution || '1080p'
})

// Handle aspect ratio change
const handleAspectRatioChange = (newAspectRatio: string) => {
  if (!selectedStoryboard.value) return
  if (newAspectRatio === currentAspectRatio.value) return
  
  if (!selectedStoryboard.value.meta) {
    selectedStoryboard.value.meta = {}
  }
  selectedStoryboard.value.meta.aspectRatio = newAspectRatio as '16:9' | '9:16'
  
  debouncedSave()
  
  // Recheck all frame dimensions
  nextTick(() => {
    checkAllFrameDimensions()
  })
  
  toast.add({
    title: 'Aspect Ratio Updated',
    description: `Aspect ratio changed to ${newAspectRatio}. Existing frames may need regeneration.`,
    color: 'blue',
    timeout: 3000,
  })
}

// Handle resolution change
const handleResolutionChange = (newResolution: string) => {
  if (!selectedStoryboard.value) return
  if (newResolution === currentResolution.value) return
  
  if (!selectedStoryboard.value.meta) {
    selectedStoryboard.value.meta = {}
  }
  selectedStoryboard.value.meta.resolution = newResolution as '720p' | '1080p'
  
  debouncedSave()
  
  // Recheck all frame dimensions
  nextTick(() => {
    checkAllFrameDimensions()
  })
  
  toast.add({
    title: 'Resolution Updated',
    description: `Resolution changed to ${newResolution}. Existing frames may need regeneration.`,
    color: 'blue',
    timeout: 3000,
  })
}

// Get segment duration from startTime and endTime
const getSegmentDuration = (segment: Segment): number => {
  return segment.endTime - segment.startTime
}

// Check if a specific frame is being regenerated
const isFrameRegenerating = (segmentIndex: number, frameType?: 'first' | 'last'): boolean => {
  if (frameType) {
    return regeneratingFrames.value.get(`${segmentIndex}-${frameType}`) === true
  }
  // If no frameType specified, check if either first or last is regenerating
  return regeneratingFrames.value.get(`${segmentIndex}-first`) === true || 
         regeneratingFrames.value.get(`${segmentIndex}-last`) === true
}

// Get expected dimensions based on aspect ratio and resolution
const getExpectedDimensions = (aspectRatio: string, resolution: string): { width: number; height: number } => {
  const is720p = resolution === '720p'
  
  switch (aspectRatio) {
    case '16:9':
      return is720p ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }
    case '9:16':
      return is720p ? { width: 720, height: 1280 } : { width: 1080, height: 1920 }
    default:
      return is720p ? { width: 720, height: 1280 } : { width: 1080, height: 1920 }
  }
}

// Calculate aspect ratio from dimensions
const calculateAspectRatio = (width: number, height: number): string => {
  const ratio = width / height
  // Check with tolerance
  if (Math.abs(ratio - 16/9) < 0.1) return '16:9'
  if (Math.abs(ratio - 9/16) < 0.1) return '9:16'
  return 'unknown'
}

// Check image dimensions (client-side)
const checkImageDimensions = async (imageUrl: string): Promise<{ width: number; height: number; aspectRatio: string } | null> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const aspectRatio = calculateAspectRatio(img.width, img.height)
      resolve({ width: img.width, height: img.height, aspectRatio })
    }
    img.onerror = () => {
      resolve(null)
    }
    img.src = imageUrl
  })
}

// Check all frame dimensions
const checkAllFrameDimensions = async () => {
  if (!selectedStoryboard.value) return
  
  const expectedDimensions = getExpectedDimensions(currentAspectRatio.value, currentResolution.value)
  const expectedAspectRatio = currentAspectRatio.value
  
  for (let i = 0; i < selectedStoryboard.value.segments.length; i++) {
    const segment = selectedStoryboard.value.segments[i]
    
    // Check first frame
    if (segment.firstFrameImage) {
      const dims = await checkImageDimensions(resolveImageUrl(segment.firstFrameImage) || '')
      if (dims) {
        frameImageDimensions.value.set(`${i}-first`, dims)
      }
    }
    
    // Check last frame
    if (segment.lastFrameImage) {
      const dims = await checkImageDimensions(resolveImageUrl(segment.lastFrameImage) || '')
      if (dims) {
        frameImageDimensions.value.set(`${i}-last`, dims)
      }
    }
  }
}

// Get frame warning message
const getFrameWarning = (segmentIndex: number, frameType: 'first' | 'last'): string | null => {
  if (!selectedStoryboard.value) return null
  
  const segment = selectedStoryboard.value.segments[segmentIndex]
  const imageUrl = frameType === 'first' ? segment.firstFrameImage : segment.lastFrameImage
  if (!imageUrl) return null
  
  const dims = frameImageDimensions.value.get(`${segmentIndex}-${frameType}`)
  if (!dims) return null
  
  const expectedDimensions = getExpectedDimensions(currentAspectRatio.value, currentResolution.value)
  const expectedAspectRatio = currentAspectRatio.value
  
  const warnings: string[] = []
  
  // Check aspect ratio
  if (dims.aspectRatio !== expectedAspectRatio && dims.aspectRatio !== 'unknown') {
    warnings.push('Frame image aspect ratio does not match output video aspect ratio')
  }
  
  // Check resolution (with tolerance)
  const widthMatch = Math.abs(dims.width - expectedDimensions.width) <= 10
  const heightMatch = Math.abs(dims.height - expectedDimensions.height) <= 10
  if (!widthMatch || !heightMatch) {
    warnings.push('Frame image resolution does not match output video resolution')
  }
  
  return warnings.length > 0 ? warnings.join('. ') : null
}

// Regenerate single frame
const regenerateSingleFrame = async (segmentIndex: number, field: 'firstFrameImage' | 'lastFrameImage') => {
  if (!selectedStoryboard.value || !selectedStory.value) return
  
  const key = `${segmentIndex}-${field === 'firstFrameImage' ? 'first' : 'last'}`
  regeneratingFrames.value.set(key, true)
  
  try {
    const segment = selectedStoryboard.value.segments[segmentIndex]
    const frameType = field === 'firstFrameImage' ? 'first' : 'last'
    
    // Prepare the request similar to generateFrames but for a single frame
    const response = await $fetch<{ frames: Array<{ segmentIndex: number; frameType: 'first' | 'last'; imageUrl: string }> }>('/api/generate-single-frame', {
      method: 'POST',
      body: {
        storyboard: selectedStoryboard.value,
        story: selectedStory.value,
        productImages: promptData.value?.productImages || [],
        segmentIndex,
        frameType,
        aspectRatio: currentAspectRatio.value,
        resolution: currentResolution.value,
      },
    })
    
    if (response.frames && response.frames.length > 0) {
      const frame = response.frames[0]
      
      // Update the segment
      const updatedSegments = [...selectedStoryboard.value.segments]
      updatedSegments[segmentIndex] = {
        ...updatedSegments[segmentIndex],
        [field]: frame.imageUrl
      }
      selectedStoryboard.value.segments = updatedSegments
      
      // Auto-sync linked frames
      if (field === 'lastFrameImage') {
        // Hook last → Body1 first
        if (segmentIndex === 0 && updatedSegments[1]) {
          updatedSegments[1] = {
            ...updatedSegments[1],
            firstFrameImage: frame.imageUrl
          }
        }
        // Body1 last → Body2 first
        else if (segmentIndex === 1 && updatedSegments[2]) {
          updatedSegments[2] = {
            ...updatedSegments[2],
            firstFrameImage: frame.imageUrl
          }
        }
        // Body2 last → CTA first
        else if (segmentIndex === 2 && updatedSegments[3]) {
          updatedSegments[3] = {
            ...updatedSegments[3],
            firstFrameImage: frame.imageUrl
          }
        }
        selectedStoryboard.value.segments = updatedSegments
      }
      
      // Check dimensions
      await nextTick()
      const dims = await checkImageDimensions(resolveImageUrl(frame.imageUrl) || '')
      if (dims) {
        frameImageDimensions.value.set(key, dims)
      }
      
      debouncedSave()
      
      toast.add({
        title: 'Frame Regenerated',
        description: `${frameType === 'first' ? 'First' : 'Last'} frame has been regenerated successfully.`,
        color: 'green',
      })
    }
  } catch (error: any) {
    console.error('[Storyboards] Error regenerating frame:', error)
    toast.add({
      title: 'Regeneration Failed',
      description: error.data?.message || error.message || 'Failed to regenerate frame',
      color: 'red',
    })
  } finally {
    regeneratingFrames.value.set(key, false)
  }
}

// Handle duration change for a segment
const handleDurationChange = (segmentIndex: number, newDuration: number) => {
  if (!selectedStoryboard.value) return
  
  const segment = selectedStoryboard.value.segments[segmentIndex]
  if (!segment) return
  
  const oldDuration = segment.endTime - segment.startTime
  if (oldDuration === newDuration) return
  
  // Calculate new endTime
  const newEndTime = segment.startTime + newDuration
  
  // Update this segment
  const updatedSegments = [...selectedStoryboard.value.segments]
  updatedSegments[segmentIndex] = {
    ...updatedSegments[segmentIndex],
    endTime: newEndTime
  }
  
  // Recalculate subsequent segments
  let currentStartTime = newEndTime
  for (let i = segmentIndex + 1; i < updatedSegments.length; i++) {
    const nextSegment = updatedSegments[i]
    const nextDuration = nextSegment.endTime - nextSegment.startTime
    updatedSegments[i] = {
      ...nextSegment,
      startTime: currentStartTime,
      endTime: currentStartTime + nextDuration
    }
    currentStartTime = currentStartTime + nextDuration
  }
  
  // Update storyboard
  selectedStoryboard.value.segments = updatedSegments
  
  // Save to localStorage
  debouncedSave()
  
  toast.add({
    title: 'Duration Updated',
    description: `Scene duration changed to ${newDuration}s. Subsequent scenes adjusted.`,
    color: 'blue',
    timeout: 2000,
  })
}

// Demo/Production mode
const isDemoMode = computed(() => {
  return selectedStoryboard.value?.meta.mode === 'demo'
})

// Image upload handlers
const setFileInputRef = (el: any, index: number, type: 'first' | 'last') => {
  if (el) {
    fileInputRefs.value[`${index}-${type}`] = el
  }
}

const triggerImageUpload = (index: number, field: 'firstFrameImage' | 'lastFrameImage') => {
  const type = field === 'firstFrameImage' ? 'first' : 'last'
  const input = fileInputRefs.value[`${index}-${type}`]
  if (input) {
    input.click()
  }
}

const handleImageFileChange = async (index: number, field: 'firstFrameImage' | 'lastFrameImage', event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension || '')) {
      toast.add({
        title: 'Invalid File Type',
        description: 'Please upload a JPEG, PNG, or WebP image',
        color: 'red',
      })
      input.value = ''
      return
    }
    
    console.log('[Storyboards] Selected image file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      extension: fileExtension,
      segment: index,
      field: field
    })
    
    await handleFrameImageUpload(index, field, file)
  }
  // Reset input
  input.value = ''
}

// Drag and drop handlers
const isDragging = ref(false)

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
}

const handleImageDrop = async (index: number, field: 'firstFrameImage' | 'lastFrameImage', event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
  
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isValidType = validTypes.includes(file.type) || validExtensions.includes(fileExtension || '')
    
    if (!isValidType) {
      console.warn('[Storyboards] Dropped file is not a valid image type:', {
        type: file.type,
        name: file.name,
        extension: fileExtension
      })
      toast.add({
        title: 'Invalid File Type',
        description: 'Please drop a JPEG, PNG, or WebP image',
        color: 'red',
      })
      return
    }
    
    console.log('[Storyboards] Dropped image file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      extension: fileExtension,
      segment: index,
      field: field
    })
    
    await handleFrameImageUpload(index, field, file)
  } else {
    console.warn('[Storyboards] No file in drop event')
    toast.add({
      title: 'No File',
      description: 'Please drop an image file',
      color: 'yellow',
    })
  }
}

// Helper to resolve image URL - ensures images are always visible
const resolveImageUrl = (url: string | undefined | null): string | undefined => {
  if (!url) {
    return undefined
  }
  
  // If it's already a full URL (http/https), return as-is (S3 presigned URLs, etc.)
  // This is the most common case for uploaded images
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // If it's already an API path, return as-is
  if (url.startsWith('/api/assets/')) {
    return url
  }
  
  // If it's just a filename, resolve through assets API
  if (!url.includes('/') && !url.includes('\\')) {
    return `/api/assets/${url}`
  }
  
  // For relative paths or local paths, try to extract filename and use assets API
  const filename = url.split('/').pop() || url.split('\\').pop()
  if (filename && filename.includes('.')) {
    // Only resolve if it looks like a filename with extension
    return `/api/assets/${filename}`
  }
  
  // Return original URL as fallback
  return url
}

const handleImageError = (event: Event, index: number, type: 'first' | 'last') => {
  const img = event.target as HTMLImageElement
  const segment = selectedStoryboard.value?.segments[index]
  const originalUrl = type === 'first' ? segment?.firstFrameImage : segment?.lastFrameImage
  const errorKey = `${type}-${index}`
  
  // Mark this image as having an error
  imageLoadError.value[errorKey] = true
  
  console.error(`[Storyboards] Failed to load ${type} frame image for segment ${index}`)
  console.error(`[Storyboards] Image element src:`, img.src)
  console.error(`[Storyboards] Original segment URL:`, originalUrl)
  console.error(`[Storyboards] Resolved URL:`, resolveImageUrl(originalUrl || ''))
  
  // Try to resolve through assets API if it's a local path
  if (originalUrl) {
    const resolved = resolveImageUrl(originalUrl)
    if (resolved && resolved !== img.src) {
      console.log(`[Storyboards] Retrying with resolved URL:`, resolved)
      img.src = resolved
    } else {
      // If it's an S3 URL, try direct access
      if (originalUrl.startsWith('https://') && originalUrl.includes('amazonaws.com')) {
        console.log(`[Storyboards] S3 URL detected, checking if accessible...`)
        console.log(`[Storyboards] Full S3 URL:`, originalUrl)
        // Test if URL is accessible
        fetch(originalUrl, { method: 'HEAD', mode: 'no-cors' })
          .then(() => console.log('[Storyboards] S3 URL is accessible (no-cors check)'))
          .catch(() => console.error('[Storyboards] S3 URL might not be accessible'))
      }
    }
  }
  
  // Show error to user
  toast.add({
    title: 'Image Load Failed',
    description: `Failed to load ${type} frame image. Check console for details.`,
    color: 'red',
    timeout: 5000,
  })
}

const retryImageLoad = (index: number, type: 'first' | 'last') => {
  const errorKey = `${type}-${index}`
  delete imageLoadError.value[errorKey]
  
  // Force re-render by updating the key
  const segment = selectedStoryboard.value?.segments[index]
  if (segment) {
    const url = type === 'first' ? segment.firstFrameImage : segment.lastFrameImage
    if (url) {
      // Trigger reactivity update
      if (selectedStoryboard.value) {
        const updatedSegments = [...selectedStoryboard.value.segments]
        updatedSegments[index] = { ...segment }
        selectedStoryboard.value.segments = updatedSegments
      }
    }
  }
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
        
        // Check all frame dimensions after storyboard loads
        await nextTick()
        setTimeout(() => {
          checkAllFrameDimensions()
        }, 2000) // Wait for images to load
        
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

const generateStoryboards = async (mode?: 'demo' | 'production') => {
  loading.value = true
  error.value = null

  try {
    // Get mood from promptData (Video Tone from homepage)
    const mood = promptData.value?.mood || 'professional'
    
    const result = await $fetch('/api/generate-storyboards', {
      method: 'POST',
      body: {
        story: selectedStory.value,
        prompt: promptData.value.prompt,
        productImages: promptData.value.productImages || [],
        aspectRatio: promptData.value.aspectRatio,
        model: promptData.value.model,
        mood: mood, // Use mood instead of style
        seamlessTransition: false, // Non-seamless mode: first frames only
      },
    })

    selectedStoryboard.value = result.storyboard || result
    if (selectedStoryboard.value) {
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
            if (savedSeg.audioNotes) {
              currentSeg.audioNotes = savedSeg.audioNotes
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

const regenerateStoryboard = async (newStyle: string) => {
  if (!selectedStoryboard.value) return
  
  if (newStyle === currentStyle.value) return
  
  // Update current style
  currentStyle.value = newStyle
  
  // Note: Style-based storyboard regeneration is not currently implemented
  // This function is kept for UI compatibility
  // In the future, this could trigger a regenerate with different style parameters
  
  toast.add({
    title: 'Style Selection',
    description: `Style changed to ${newStyle}. Regeneration not yet implemented.`,
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

    // Set seamlessTransition to false in storyboard meta
    if (selectedStoryboard.value.meta) {
      selectedStoryboard.value.meta.seamlessTransition = false
    }

    const requestBody = {
      storyboard: selectedStoryboard.value,
      productImages: promptData.value.productImages || [],
      subjectReference: promptData.value.subjectReference, // Add person reference for nano-banana
      story: selectedStory.value,
      mode: selectedStoryboard.value.meta.mode || 'production',
    }
    console.log('[Storyboards] Request body productImages:', requestBody.productImages)
    console.log('[Storyboards] Request body productImages count:', requestBody.productImages.length)
    console.log('[Storyboards] Request body subjectReference:', requestBody.subjectReference)

    const apiCall = $fetch('/api/generate-frames', {
      method: 'POST',
      body: requestBody,
    })

    const result = await Promise.race([apiCall, timeoutPromise]) as any
    
    console.log('[Storyboards] ========================================')
    console.log('[Storyboards] Frame Generation API Response')
    console.log('[Storyboards] ========================================')
    console.log('[Storyboards] API response:', result)

    // Check if prompts were refined and update storyboard
    if (result.promptsRefined && result.storyboard) {
      console.log('[Storyboards] Prompts were refined, updating storyboard with refined prompts')
      // Update segments with refined visual prompts
      if (result.storyboard.segments && selectedStoryboard.value) {
        result.storyboard.segments.forEach((refinedSegment: any, index: number) => {
          if (selectedStoryboard.value.segments[index] && refinedSegment.visualPrompt) {
            const originalPrompt = selectedStoryboard.value.segments[index].visualPrompt
            const refinedPrompt = refinedSegment.visualPrompt
            if (originalPrompt !== refinedPrompt) {
              selectedStoryboard.value.segments[index].visualPrompt = refinedPrompt
              console.log(`[Storyboards] Updated visual prompt for segment ${index} (${refinedSegment.type})`)
            }
          }
        })
        // Save updated storyboard
        debouncedSave()
        
        // Show notification that prompts were refined
        toast.add({
          title: 'Prompts Refined',
          description: 'Visual prompts have been automatically refined to match the generated frames.',
          color: 'blue',
        })
      }
    }

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
      // Validate segmentIndex is valid (0-3)
      if (frame.segmentIndex < 0 || frame.segmentIndex > 3) {
        console.error(`[Storyboards] Invalid segmentIndex ${frame.segmentIndex} for frame ${frame.frameType}. Expected 0-3.`)
        return
      }
      
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

    // NON-SEAMLESS MODE: Map frames to segments - only first frames, no daisy-chaining
    // 16-second format (3 segments):
    //   Hook: firstFrameImage = frames[0] (hook first)
    //   Body: firstFrameImage = frames[1] (body first)
    //   CTA: firstFrameImage = frames[2] (cta first)
    // 24-second format (4 segments):
    //   Hook: firstFrameImage = frames[0] (hook first)
    //   Body1: firstFrameImage = frames[1] (body1 first)
    //   Body2: firstFrameImage = frames[2] (body2 first)
    //   CTA: firstFrameImage = frames[3] (cta first)
    
    const segmentCount = selectedStoryboard.value?.segments.length || 0
    if (selectedStoryboard.value && (segmentCount === 3 || segmentCount >= 4)) {
      console.log(`[Storyboards] NON-SEAMLESS MODE: Assigning first frames only (${segmentCount}-segment format)...`)
      
      // NON-SEAMLESS: Assign first frames directly from frame map (no daisy-chaining)
      for (let idx = 0; idx < segmentCount; idx++) {
        const segmentFrames = frameMap.get(String(idx))
        console.log(`[Storyboards] Segment ${idx} frames:`, segmentFrames)
        
        if (segmentFrames?.first) {
          selectedStoryboard.value.segments[idx].firstFrameImage = segmentFrames.first
          frameGenerationStatus.value.set(idx, { 
            ...frameGenerationStatus.value.get(idx), 
          first: true,
            firstModelSource: segmentFrames.firstModelSource,
            firstNanoImageUrl: segmentFrames.firstNanoImageUrl,
            firstSeedreamImageUrl: segmentFrames.firstSeedreamImageUrl
          })
          console.log(`[Storyboards] ✓ Assigned segment ${idx} (${selectedStoryboard.value.segments[idx].type}) first frame:`, segmentFrames.first.substring(0, 60))
        } else {
          console.error(`[Storyboards] ✗ Segment ${idx} (${selectedStoryboard.value.segments[idx].type}) missing first frame in frameMap`)
        }
        
        // NON-SEAMLESS: Clear any existing last frame assignments (shouldn't exist, but clean up)
        if (selectedStoryboard.value.segments[idx].lastFrameImage) {
          console.log(`[Storyboards] Clearing last frame for segment ${idx} (non-seamless mode)`)
          selectedStoryboard.value.segments[idx].lastFrameImage = undefined
        }
      }

      // Frame assignment complete for non-seamless mode (only first frames)
      
      // Trigger reactivity to ensure UI updates
      await nextTick()
      triggerRef(selectedStoryboard)
      console.log('[Storyboards] Frame assignments completed, reactivity triggered')
      
      // Log final state for debugging
      const finalStates = selectedStoryboard.value.segments.map((seg, idx) => ({
        index: idx,
        type: seg.type,
        firstFrameImage: seg.firstFrameImage,
        lastFrameImage: seg.lastFrameImage,
      }))
      console.log('[Storyboards] Final segment states:', finalStates)
      
      // NON-SEAMLESS MODE: Validate frame assignments - only check for first frames
      const validationErrors: string[] = []
      finalStates.forEach((state, idx) => {
        // Check that each segment has its first frame
        if (!state.firstFrameImage) {
          validationErrors.push(`Segment ${idx} (${state.type}) missing first frame`)
          }
        // NON-SEAMLESS: No last frame checks - they are not required
      })
      
      if (validationErrors.length > 0) {
        console.error('[Storyboards] Frame assignment validation errors (non-seamless):', validationErrors)
        frameGenerationError.value = `Frame assignment errors detected: ${validationErrors.join('; ')}`
      } else {
        console.log('[Storyboards] ✓ Frame assignment validation passed (non-seamless mode - first frames only)')
      }
    }

    const frameCount = frames.length
    const mode = selectedStoryboard.value.meta.mode || 'production'
    
    // Save storyboard state including frameGenerationStatus
    saveStoryboardState()
    
    // Check if frames were regenerated due to conflicts
    if (result.framesRegenerated && result.storyboard) {
      console.log('[Storyboards] Frames were regenerated to resolve conflicts')
      selectedStoryboard.value = result.storyboard
      
      const conflictItem = result.conflictDetails?.item || 'conflicting item'
      const conflictResolved = !result.conflictDetected
      
      if (conflictResolved) {
        toast.add({
          title: 'Frames Regenerated',
          description: `Conflicting frames regenerated to remove ${conflictItem}. Conflict resolved.`,
          color: 'success',
          timeout: 5000,
        })
      } else {
        toast.add({
          title: 'Frames Regenerated',
          description: `Conflicting frames regenerated to remove ${conflictItem}, but conflict may still exist.`,
          color: 'warning',
          timeout: 5000,
        })
      }
      
      // Refresh frame display
      debouncedSave()
    } else if (result.conflictDetected && result.conflictDetails) {
      // Check for unresolved scene conflicts (no regeneration attempted or regeneration failed)
      console.warn('[Storyboards] ⚠️ Scene conflict detected:', result.conflictDetails)
      const conflictItem = result.conflictDetails.item || 'an item'
      
      // Legacy fallback: Regenerate storyboard with different solution
      toast.add({
        title: 'Scene Conflict Detected',
        description: `We detected that ${conflictItem} is already in the scene. Regenerating storyboard with a different solution...`,
        color: 'warning',
        timeout: 5000,
      })

      try {
        // Regenerate storyboard with different solution (fallback)
        console.log('[Storyboards] Falling back to storyboard regeneration due to conflict...')
        const regenerateResult = await $fetch('/api/regenerate-storyboard-conflict', {
          method: 'POST',
          body: {
            storyboardId: selectedStoryboard.value.id,
            conflictDetails: result.conflictDetails,
            originalStory: selectedStory.value,
            originalPrompt: promptData.value.prompt || '',
            productImages: promptData.value.productImages || [],
          },
        }) as any

        if (regenerateResult.storyboard) {
          // Replace current storyboard with regenerated one
          console.log('[Storyboards] Storyboard regenerated successfully:', regenerateResult.storyboard.id)
          selectedStoryboard.value = regenerateResult.storyboard

          toast.add({
            title: 'Storyboard Regenerated',
            description: `New storyboard created with a different solution (avoiding ${result.conflictDetails.item}). Please regenerate frames.`,
            color: 'success',
            timeout: 8000,
          })

          // Note: User will need to regenerate frames for the new storyboard
          console.log('[Storyboards] User should regenerate frames for the new storyboard')
        } else {
          throw new Error('Regenerated storyboard not returned')
        }
      } catch (regenerateError: any) {
        console.error('[Storyboards] Error regenerating storyboard:', regenerateError)
        toast.add({
          title: 'Regeneration Failed',
          description: `Failed to regenerate storyboard: ${regenerateError.data?.message || regenerateError.message || 'Unknown error'}. You may need to manually adjust the storyboard.`,
          color: 'error',
          timeout: 10000,
        })
      }
    } else {
      // No conflict - show success message
      toast.add({
        title: 'Frames Generated',
        description: mode === 'demo' 
          ? `Generated ${frameCount} frame(s) for first scene (demo mode)`
          : `Frame images have been generated for all scenes`,
        color: 'green',
      })
      console.log('[Storyboards] Frame generation completed successfully')
    }
  } catch (err: any) {
    console.error('[Storyboards] Error generating frames:', err)
    frameGenerationError.value = err.data?.message || err.message || 'Failed to generate frame images'
    toast.add({
      title: 'Frame Generation Error',
      description: frameGenerationError.value,
      color: 'red',
    })
  } finally {
    // Always set generatingFrames to false when done
    generatingFrames.value = false
    console.log('[Storyboards] Frame generation state cleared')
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
  
  // Non-seamless mode: Only check for first frames (no last frames needed)
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
    
    // Non-seamless mode: Only need first frame (no last frame)
    const hasRequiredData = !!(
      hookSegment.firstFrameImage && 
      hookSegment.visualPrompt &&
      hookSegment.description
    )
    
    if (!hasRequiredData) {
      console.log('[allFramesReady] Demo mode: Hook segment missing data:', {
        firstFrameImage: !!hookSegment.firstFrameImage,
        visualPrompt: !!hookSegment.visualPrompt,
        description: !!hookSegment.description,
      })
    }
    
    return hasRequiredData
  }
  
  // Production mode: Check that all segments have required data
  // Non-seamless mode: Only check for first frames
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    
    // Each segment needs:
    // 1. First frame image (no last frame in non-seamless mode)
    // 2. Visual prompt (for video generation)
    // 3. Description (for context)
    // 4. Timing (startTime, endTime)
    const hasFrames = !!segment.firstFrameImage
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
    
    // Ensure seamlessTransition is set to false in storyboard meta
    if (selectedStoryboard.value.meta) {
      selectedStoryboard.value.meta.seamlessTransition = false
    }
    
    // Save selected storyboard for generation
    sessionStorage.setItem('generateStoryboard', JSON.stringify(selectedStoryboard.value))
    sessionStorage.setItem('promptData', JSON.stringify(promptData.value))
  }

  // Navigate to non-seamless generation page
  router.push('/generate-seam')
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
              transition: 'none',
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

  let imageUrl: string | undefined = undefined

  // If it's a File, we need to upload it first
  if (file instanceof File) {
    try {
      console.log('[Storyboards] Starting upload for file:', {
        name: file.name,
        type: file.type,
        size: file.size
      })
      
      const formData = new FormData()
      formData.append('image', file)
      
      const uploadResult = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
        method: 'POST',
        body: formData,
      })

      console.log('[Storyboards] Upload result:', uploadResult)

      if (uploadResult.urls && uploadResult.urls.length > 0) {
        imageUrl = uploadResult.urls[0]
        console.log('[Storyboards] ✓ Image uploaded successfully')
        console.log('[Storyboards] Uploaded URL:', imageUrl)
        console.log('[Storyboards] URL type:', imageUrl.startsWith('http') ? 'Full URL (S3)' : 'Relative path')
        console.log('[Storyboards] URL length:', imageUrl.length)
        console.log('[Storyboards] URL preview (first 100 chars):', imageUrl.substring(0, 100))
        
        // Force Vue reactivity by creating a new segment object
        if (selectedStoryboard.value) {
          const updatedSegments = [...selectedStoryboard.value.segments]
          updatedSegments[segmentIndex] = {
            ...updatedSegments[segmentIndex],
            [field]: imageUrl
          }
          selectedStoryboard.value.segments = updatedSegments
          
          // Also update the local segment reference
          segment[field] = imageUrl
        }
        
        // Force reactivity update
        await nextTick()
        
        // Verify the URL was set
        console.log('[Storyboards] Segment after setting URL:', {
          field: field,
          value: segment[field],
          storyboardValue: selectedStoryboard.value?.segments[segmentIndex]?.[field],
          matches: segment[field] === imageUrl
        })
        
        // Check dimensions after upload
        await nextTick()
        const dims = await checkImageDimensions(resolveImageUrl(imageUrl) || '')
        if (dims) {
          frameImageDimensions.value.set(`${segmentIndex}-${field === 'firstFrameImage' ? 'first' : 'last'}`, dims)
        }
        
        // Update frame generation status
        const status = frameGenerationStatus.value.get(segmentIndex) || {}
        if (field === 'firstFrameImage') {
          status.first = true
        } else {
          status.last = true
        }
        frameGenerationStatus.value.set(segmentIndex, status)
        
        // Save to localStorage
        debouncedSave()
        
        toast.add({
          title: 'Image Uploaded',
          description: 'Frame image has been uploaded successfully',
          color: 'green',
        })
      } else {
        console.error('[Storyboards] Upload failed: No URLs in response', uploadResult)
        throw new Error('Upload failed: No URL returned')
      }
    } catch (err: any) {
      console.error('[Storyboards] Upload error:', err)
      console.error('[Storyboards] Error details:', {
        message: err.message,
        statusCode: err.statusCode,
        data: err.data
      })
      toast.add({
        title: 'Upload Failed',
        description: err.data?.message || err.message || 'Failed to upload image',
        color: 'red',
      })
      return
    }
  } else if (typeof file === 'string') {
    // It's already a URL
    imageUrl = file
    segment[field] = imageUrl
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
    imageUrl = undefined
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

  // Auto-sync frame images based on continuity rules
  if (imageUrl && field === 'lastFrameImage') {
    // Hook's last frame → Body1's first frame
    if (segmentIndex === 0 && selectedStoryboard.value.segments[1]) {
      selectedStoryboard.value.segments[1].firstFrameImage = imageUrl
      const body1Status = frameGenerationStatus.value.get(1) || {}
      body1Status.first = true
      frameGenerationStatus.value.set(1, body1Status)
      console.log('[Storyboards] Synced Hook last frame to Body1 first frame')
    }
    // Body1's last frame → Body2's first frame
    else if (segmentIndex === 1 && selectedStoryboard.value.segments[2]) {
      selectedStoryboard.value.segments[2].firstFrameImage = imageUrl
      const body2Status = frameGenerationStatus.value.get(2) || {}
      body2Status.first = true
      frameGenerationStatus.value.set(2, body2Status)
      console.log('[Storyboards] Synced Body1 last frame to Body2 first frame')
    }
    // Body2's last frame → CTA's first frame
    else if (segmentIndex === 2 && selectedStoryboard.value.segments[3]) {
      selectedStoryboard.value.segments[3].firstFrameImage = imageUrl
      const ctaStatus = frameGenerationStatus.value.get(3) || {}
      ctaStatus.first = true
      frameGenerationStatus.value.set(3, ctaStatus)
      console.log('[Storyboards] Synced Body2 last frame to CTA first frame')
    }
  }

  // Save state after image change
  debouncedSave()
}
</script>
