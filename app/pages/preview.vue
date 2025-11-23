<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black py-8 sm:py-12">
    <UContainer class="max-w-6xl px-4 sm:px-6">
      <!-- Existing Video Preview Flow -->
      <div v-if="videoData && !isCategoryFlow" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl sm:text-3xl font-bold text-mendo-black dark:text-mendo-white mb-2">
            Your Ad is Ready!
          </h1>
          <p class="text-mendo-black/70 dark:text-mendo-white/70 text-sm sm:text-base">
            Review your generated ad video below
          </p>
        </div>

        <!-- Video Player -->
        <UCard class="bg-mendo-white dark:bg-mendo-black overflow-hidden border border-mendo-light-grey dark:border-mendo-light-grey/30">
          <div class="aspect-[9/16] w-full bg-black flex items-center justify-center">
            <video
              v-if="videoData.videoUrl"
              :src="videoData.videoUrl"
              controls
              class="w-full h-full object-contain"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
            <div v-else class="text-white text-center p-8">
              <UIcon name="i-heroicons-video-camera" class="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Video not available</p>
            </div>
          </div>
          
          <!-- Music Player -->
          <div class="p-4">
            <MusicPlayer :music-url="videoData.musicUrl" />
          </div>
        </UCard>

        <!-- Download Button -->
        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <UButton
            v-if="videoData.videoUrl"
            color="secondary"
            variant="solid"
            size="lg"
            @click="downloadVideo"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-h-[44px]"
          >
            <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5 mr-2" />
            Download Video
          </UButton>
          <UButton
            variant="outline"
            color="gray"
            size="lg"
            @click="$router.push('/history')"
            class="min-h-[44px]"
          >
            View History
          </UButton>
        </div>

        <!-- Storyboard Summary -->
        <UCard v-if="videoData.storyboard" class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
          <template #header>
            <h2 class="text-xl font-semibold text-mendo-black dark:text-mendo-white">Storyboard Summary</h2>
          </template>

          <div class="space-y-4">
            <div
              v-for="(segment, index) in videoData.storyboard.segments"
              :key="index"
              class="border-l-2 border-secondary-500 pl-4 py-2 space-y-3"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-semibold text-mendo-black dark:text-mendo-white uppercase">
                  {{ segment.type === 'hook' ? 'Hook' : segment.type === 'cta' ? 'Call to Action' : 'Body' }}
                </span>
                <span class="text-xs text-mendo-black/70 dark:text-mendo-white/70">
                  {{ segment.startTime }}s - {{ segment.endTime }}s
                </span>
              </div>
              
              <!-- Description -->
              <div>
                <label class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-1 flex items-center gap-2">
                  Description
                  <UIcon
                    v-if="editedFields.has(`video-segment-${index}-description`)"
                    name="i-heroicons-pencil-square"
                    class="w-3 h-3 text-secondary-500"
                    title="Edited"
                  />
                </label>
                <UTextarea
                  v-model="segment.description"
                  :rows="2"
                  class="w-full text-sm"
                  :class="{ 'ring-1 ring-secondary-500': editedFields.has(`video-segment-${index}-description`) }"
                  @blur="saveVideoSegmentEdit(index, 'description', segment.description)"
                />
              </div>
              
              <!-- Visual Prompt -->
              <div>
                <label class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-1 flex items-center gap-2">
                  Visual Prompt
                  <UIcon
                    v-if="editedFields.has(`video-segment-${index}-visualPrompt`)"
                    name="i-heroicons-pencil-square"
                    class="w-3 h-3 text-secondary-500"
                    title="Edited"
                  />
                </label>
                <UTextarea
                  v-model="segment.visualPrompt"
                  :rows="3"
                  class="w-full text-xs"
                  :class="{ 'ring-1 ring-secondary-500': editedFields.has(`video-segment-${index}-visualPrompt`) }"
                  @blur="saveVideoSegmentEdit(index, 'visualPrompt', segment.visualPrompt)"
                />
              </div>
            </div>
          </div>
        </UCard>

        <!-- Voiceover Script -->
        <UCard v-if="videoData.voiceoverScript" class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold text-mendo-black dark:text-mendo-white">Voiceover Script</h2>
              <div class="flex items-center gap-2">
                <UIcon
                  v-if="editedFields.has('voiceover-script')"
                  name="i-heroicons-pencil-square"
                  class="w-4 h-4 text-secondary-500"
                  title="Edited"
                />
                <UIcon
                  v-if="isSaving"
                  name="i-heroicons-arrow-path"
                  class="w-4 h-4 text-mendo-black/40 dark:text-mendo-white/40 animate-spin"
                  title="Saving..."
                />
              </div>
            </div>
          </template>

          <div class="space-y-3">
            <UTextarea
              v-model="videoData.voiceoverScript"
              :rows="8"
              class="w-full"
              :class="{ 'ring-1 ring-secondary-500': editedFields.has('voiceover-script') }"
              @blur="saveVoiceoverScript"
            />
            <div
              v-if="videoData.voiceoverSegments && videoData.voiceoverSegments.length > 0"
              class="space-y-3 pt-3 border-t border-mendo-light-grey dark:border-mendo-light-grey/30"
            >
              <div
                v-for="(seg, index) in videoData.voiceoverSegments"
                :key="index"
                class="space-y-1"
              >
                <label class="text-xs font-semibold text-mendo-black dark:text-mendo-white">
                  {{ seg.type === 'hook' ? 'Hook' : seg.type === 'cta' ? 'CTA' : 'Body' }}:
                </label>
                <UTextarea
                  v-model="seg.script"
                  :rows="2"
                  class="w-full text-xs"
                  @blur="saveVoiceoverSegment(index, seg.script)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Category Flow: Storyboard Preview with Frame Generation -->
      <div v-else class="space-y-6">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-2xl sm:text-3xl font-bold text-mendo-black dark:text-mendo-white mb-2">
            Your Storyboard
          </h1>
          <p class="text-mendo-black/70 dark:text-mendo-white/70 text-sm sm:text-base">
            Review your storyboard and frames before generating the video
          </p>
        </div>

        <!-- Loading State: Storyboard Generation -->
        <div v-if="generatingStoryboard" class="flex flex-col items-center justify-center py-24">
          <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
          <h2 class="text-2xl font-semibold text-mendo-black dark:text-mendo-white mb-2">Creating Storyboard</h2>
          <p class="text-mendo-black/70 dark:text-mendo-white/70 text-center">Planning your video segments...</p>
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
              @click="$router.push('/create')"
            >
              Go Back
            </UButton>
          </template>
        </UAlert>

        <!-- Storyboard Display -->
        <div v-else-if="storyboard" class="space-y-6">
          <!-- Storyboard Segments -->
          <div class="space-y-4">
            <UCard
              v-for="(segment, index) in storyboard.segments"
              :key="index"
              class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <UBadge :color="getSegmentColor(segment.type)" size="lg">
                      {{ getSegmentLabel(segment.type) }}
                    </UBadge>
                    <span class="text-sm text-mendo-black/70 dark:text-mendo-white/70">
                      {{ segment.startTime }}s - {{ segment.endTime }}s
                    </span>
                  </div>
                </div>
              </template>

              <div class="space-y-4">
                <!-- Segment Description -->
                <div>
                  <label class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-1 flex items-center gap-2">
                    Description
                    <UIcon
                      v-if="editedFields.has(`segment-${index}-description`)"
                      name="i-heroicons-pencil-square"
                      class="w-3 h-3 text-secondary-500"
                      title="Edited"
                    />
                    <UIcon
                      v-if="isSaving"
                      name="i-heroicons-arrow-path"
                      class="w-3 h-3 text-mendo-black/40 dark:text-mendo-white/40 animate-spin"
                      title="Saving..."
                    />
                  </label>
                  <UTextarea
                    v-model="segment.description"
                    :rows="2"
                    class="w-full"
                    :class="{ 'ring-1 ring-secondary-500': editedFields.has(`segment-${index}-description`) }"
                    @blur="saveSegmentEdit(index, 'description', segment.description)"
                  />
                </div>
                
                <!-- Visual Prompt -->
                <div>
                  <label class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-1 flex items-center gap-2">
                    Visual Prompt
                    <UIcon
                      v-if="editedFields.has(`segment-${index}-visualPrompt`)"
                      name="i-heroicons-pencil-square"
                      class="w-3 h-3 text-secondary-500"
                      title="Edited"
                    />
                    <UIcon
                      v-if="isSaving"
                      name="i-heroicons-arrow-path"
                      class="w-3 h-3 text-mendo-black/40 dark:text-mendo-white/40 animate-spin"
                      title="Saving..."
                    />
                  </label>
                  <UTextarea
                    v-model="segment.visualPrompt"
                    :rows="3"
                    class="w-full"
                    :class="{ 'ring-1 ring-secondary-500': editedFields.has(`segment-${index}-visualPrompt`) }"
                    @blur="saveSegmentEdit(index, 'visualPrompt', segment.visualPrompt)"
                  />
                </div>

                <!-- Dialogue / Audio Input -->
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h4 class="text-sm font-semibold text-mendo-black/80 dark:text-mendo-white/80 uppercase tracking-wide">Spoken Dialogue</h4>
                    <UBadge 
                      v-if="getDialogue(index).dialogueText.trim()"
                      color="blue"
                      variant="soft"
                      size="xs"
                    >
                      Has Dialogue
                    </UBadge>
                  </div>
                  <UCard class="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <div class="space-y-4">
                      <!-- Character Field -->
                      <UFormField 
                        label="Character" 
                        :name="`segment-${index}-character`"
                        description="Who is speaking? (e.g., 'The man', 'The young woman')"
                      >
                        <UInput
                          :model-value="getDialogue(index).character"
                          placeholder="The man"
                          class="w-full"
                          :disabled="generatingFrames || isSaving"
                          @update:model-value="(value: string) => updateDialogue(index, 'character', value)"
                        />
                      </UFormField>

                      <!-- Dialogue Text Field -->
                      <UFormField 
                        label="Dialogue Text" 
                        :name="`segment-${index}-dialogue`"
                        :description="segment.type === 'cta' ? 'CTA dialogue must be 5 words or less' : 'What will the character say?'"
                      >
                        <UTextarea
                          :model-value="getDialogue(index).dialogueText"
                          :rows="3"
                          class="w-full"
                          :disabled="generatingFrames || isSaving"
                          :class="{ 
                            'ring-1 ring-yellow-500': segment.type === 'cta' && !validateCTADialogue(getDialogue(index).dialogueText).isValid && getDialogue(index).dialogueText.trim()
                          }"
                          @update:model-value="(value: string) => updateDialogue(index, 'dialogueText', value)"
                        />
                        <div 
                          v-if="segment.type === 'cta' && getDialogue(index).dialogueText.trim()"
                          class="mt-1"
                        >
                          <UBadge 
                            :color="validateCTADialogue(getDialogue(index).dialogueText).isValid ? 'green' : 'yellow'"
                            variant="soft"
                            size="xs"
                          >
                            {{ validateCTADialogue(getDialogue(index).dialogueText).isValid ? 'Valid' : 'Exceeds limit' }}
                          </UBadge>
                        </div>
                      </UFormField>

                      <!-- Formatted Preview (Read-only) -->
                      <div v-if="getDialogue(index).dialogueText.trim()" class="mt-2 p-3 bg-mendo-white dark:bg-mendo-black rounded-lg border border-mendo-light-grey dark:border-mendo-light-grey/30">
                        <p class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-1">Formatted Output:</p>
                        <p class="text-sm text-mendo-black/80 dark:text-mendo-white/80 font-mono">{{ getDialoguePreview(index) }}</p>
                      </div>
                    </div>
                  </UCard>
                </div>

                <!-- Scene Video -->
                <div v-if="videoGenerationStatus !== 'idle' || sceneVideos.has(index)" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 uppercase tracking-wide">Scene Video</p>
                    <UButton
                      v-if="sceneVideos.has(index)"
                      icon="i-heroicons-arrow-path"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :loading="regeneratingScenes.has(index)"
                      :disabled="regeneratingScenes.has(index) || videoGenerationStatus === 'processing'"
                      @click="regenerateScene(index)"
                      class="flex items-center gap-1"
                    >
                      Regenerate
                    </UButton>
                  </div>
                  
                  <div
                    v-if="sceneVideos.has(index)"
                    class="aspect-[9/16] w-full bg-black rounded-lg overflow-hidden border-2 border-mendo-light-grey dark:border-mendo-light-grey/30"
                  >
                    <video
                      :src="sceneVideos.get(index)"
                      controls
                      class="w-full h-full object-contain"
                      preload="metadata"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                  <div
                    v-else-if="videoGenerationStatus === 'processing'"
                    class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                  >
                    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-secondary-500 animate-spin mb-2" />
                    <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Generating video...</p>
                  </div>
                  <div
                    v-else
                    class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                  >
                    <UIcon name="i-heroicons-video-camera" class="w-12 h-12 text-mendo-black/40 dark:text-mendo-white/40 mb-2" />
                    <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Video not generated</p>
                  </div>
                </div>

                <!-- Frame Images -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- First Frame -->
                  <div>
                    <p class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-2">Opening Shot</p>
                    <div
                      v-if="segment.firstFrameImage"
                      class="relative w-full rounded-lg overflow-hidden border-2 border-mendo-light-grey dark:border-mendo-light-grey/30 bg-black"
                      style="height: 300px;"
                    >
                      <NuxtImg
                        :src="segment.firstFrameImage"
                        alt="First frame"
                        class="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div
                      v-else-if="getFrameStatus(index, 'first') === 'generating'"
                      class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                    >
                      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-secondary-500 animate-spin mb-2" />
                      <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Generating...</p>
                    </div>
                    <div
                      v-else
                      class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                    >
                      <UIcon name="i-heroicons-photo" class="w-12 h-12 text-mendo-black/40 dark:text-mendo-white/40 mb-2" />
                      <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Pending</p>
                    </div>
                  </div>

                  <!-- Last Frame -->
                  <div>
                    <p class="text-xs font-medium text-mendo-black/70 dark:text-mendo-white/70 mb-2">Closing Shot</p>
                    <div
                      v-if="segment.lastFrameImage"
                      class="relative w-full rounded-lg overflow-hidden border-2 border-mendo-light-grey dark:border-mendo-light-grey/30 bg-black"
                      style="height: 300px;"
                    >
                      <NuxtImg
                        :src="segment.lastFrameImage"
                        alt="Last frame"
                        class="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div
                      v-else-if="getFrameStatus(index, 'last') === 'generating'"
                      class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                    >
                      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-secondary-500 animate-spin mb-2" />
                      <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Generating...</p>
                    </div>
                    <div
                      v-else
                      class="aspect-[9/16] bg-mendo-light-grey dark:bg-mendo-light-grey/20 rounded-lg border-2 border-dashed border-mendo-light-grey dark:border-mendo-light-grey/30 flex flex-col items-center justify-center"
                    >
                      <UIcon name="i-heroicons-photo" class="w-12 h-12 text-mendo-black/40 dark:text-mendo-white/40 mb-2" />
                      <p class="text-xs text-mendo-black/70 dark:text-mendo-white/70">Pending</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Frame Generation Progress -->
          <UCard v-if="generatingFrames" class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
            <template #header>
              <h3 class="text-lg font-semibold text-mendo-black dark:text-mendo-white">Generating Frames</h3>
            </template>
            <div class="space-y-2">
              <div
                v-for="(frame, idx) in frameGenerationStatus"
                :key="idx"
                class="flex items-center gap-3"
              >
                <UIcon
                  v-if="frame.status === 'completed'"
                  name="i-heroicons-check-circle"
                  class="w-5 h-5 text-green-500"
                />
                <UIcon
                  v-else-if="frame.status === 'generating'"
                  name="i-heroicons-arrow-path"
                  class="w-5 h-5 text-secondary-500 animate-spin"
                />
                <UIcon
                  v-else
                  name="i-heroicons-clock"
                  class="w-5 h-5 text-mendo-black/40 dark:text-mendo-white/40"
                />
                <span class="text-sm text-mendo-black/80 dark:text-mendo-white/80">
                  {{ frame.label }}
                </span>
              </div>
            </div>
          </UCard>

          <!-- Proceed to Storyboards Button -->
          <div class="flex justify-center">
            <UButton
              :disabled="!allFramesReady || generatingFrames || videoGenerationStatus === 'processing' || startingVideoGeneration"
              :loading="generatingFrames || videoGenerationStatus === 'processing' || startingVideoGeneration"
              size="xl"
              color="secondary"
              class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 px-8 rounded-lg shadow-lg hover:shadow-xl transition-all min-h-[56px]"
              @click="proceedToGeneration"
            >
              <span v-if="!allFramesReady && !generatingFrames && videoGenerationStatus === 'idle' && !startingVideoGeneration">
                Waiting for frames...
              </span>
              <span v-else-if="generatingFrames">
                Generating frames...
              </span>
              <span v-else-if="startingVideoGeneration">
                Starting generation...
              </span>
              <span v-else-if="videoGenerationStatus === 'processing'">
                Generating video...
              </span>
              <span v-else>
                Generate Video
              </span>
            </UButton>
          </div>

          <!-- Video Generation Progress -->
          <UCard v-if="videoGenerationStatus === 'processing'" class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
            <template #header>
              <h3 class="text-lg font-semibold text-mendo-black dark:text-mendo-white">Video Generation Progress</h3>
            </template>
            <div class="space-y-4">
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-medium text-mendo-black/70 dark:text-mendo-white/70">Overall Progress</span>
                  <span class="text-sm font-semibold text-mendo-black dark:text-mendo-white">{{ videoGenerationProgress }}%</span>
                </div>
                <UProgress :value="videoGenerationProgress" class="mb-4" />
              </div>
              <div class="flex items-center gap-3">
                <UIcon
                  v-if="videoGenerationStep === 'generating-assets'"
                  name="i-heroicons-arrow-path"
                  class="w-6 h-6 text-secondary-500 animate-spin"
                />
                <UIcon
                  v-else-if="videoGenerationStep === 'composing-video'"
                  name="i-heroicons-film"
                  class="w-6 h-6 text-secondary-500"
                />
                <UIcon
                  v-else
                  name="i-heroicons-clock"
                  class="w-6 h-6 text-mendo-black/40 dark:text-mendo-white/40"
                />
                <span class="text-sm text-mendo-black/80 dark:text-mendo-white/80">
                  {{ videoGenerationStep === 'generating-assets' ? 'Generating video assets...' : videoGenerationStep === 'composing-video' ? 'Composing final video...' : 'Processing...' }}
                </span>
              </div>
            </div>
          </UCard>

          <!-- Final Videos Section -->
          <div v-if="videoGenerationStatus === 'completed' && (finalVideoOriginal || finalVideoSeamless || sceneVideos.size > 0)" class="space-y-6">
            <div class="text-center">
              <h2 class="text-2xl font-bold text-mendo-black dark:text-mendo-white mb-2">Final Videos</h2>
              <p class="text-mendo-black/70 dark:text-mendo-white/70 text-sm sm:text-base">
                Compare the un-seamless and seamless stitched versions
              </p>
            </div>

            <!-- Notification for scene changes -->
            <UAlert
              v-if="sceneVideoChanged"
              color="yellow"
              variant="soft"
              title="Scene Videos Updated"
              description="One or more scene videos have been regenerated. Regenerate the final videos to see the changes."
              class="mb-4"
            >
              <template #actions>
                <UButton
                  variant="ghost"
                  color="yellow"
                  size="sm"
                  :loading="regeneratingFinal"
                  @click="regenerateFinalVideos"
                >
                  Regenerate Final Videos
                </UButton>
              </template>
            </UAlert>

            <!-- Notification if videos are missing but scenes are available -->
            <UAlert
              v-if="videoGenerationStatus === 'completed' && sceneVideos.size > 0 && (!finalVideoOriginal || !finalVideoSeamless)"
              color="blue"
              variant="soft"
              title="Composing Final Videos"
              :description="!finalVideoOriginal && !finalVideoSeamless ? 'Composing both video versions...' : !finalVideoOriginal ? 'Composing original video...' : 'Composing seamless video...'"
              class="mb-4"
            >
              <template #actions>
                <UButton
                  variant="ghost"
                  color="blue"
                  size="sm"
                  :loading="regeneratingFinal"
                  @click="regenerateFinalVideos"
                >
                  {{ !finalVideoOriginal && !finalVideoSeamless ? 'Compose Videos' : 'Retry Composition' }}
                </UButton>
              </template>
            </UAlert>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Original (Un-seamless) Video -->
              <UCard class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
                <template #header>
                  <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-mendo-black dark:text-mendo-white">Original (Un-seamless)</h3>
                    <UButton
                      v-if="finalVideoOriginal"
                      icon="i-heroicons-arrow-path"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :loading="regeneratingFinal"
                      :disabled="regeneratingFinal"
                      @click="regenerateFinalVideos"
                    >
                      Regenerate
                    </UButton>
                  </div>
                </template>
                <div class="aspect-[9/16] w-full bg-black rounded-lg overflow-hidden">
                  <video
                    v-if="finalVideoOriginal"
                    :src="finalVideoOriginal"
                    controls
                    class="w-full h-full object-contain"
                    preload="metadata"
                  >
                    Your browser does not support the video tag.
                  </video>
                  <div v-else class="w-full h-full flex items-center justify-center text-white">
                    <div class="text-center">
                      <UIcon name="i-heroicons-video-camera" class="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p class="text-sm">Not available</p>
                    </div>
                  </div>
                </div>
              </UCard>

              <!-- Seamless Video -->
              <UCard class="bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
                <template #header>
                  <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-mendo-black dark:text-mendo-white">Seamless Stitched</h3>
                    <UButton
                      v-if="finalVideoSeamless"
                      icon="i-heroicons-arrow-path"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :loading="regeneratingFinal"
                      :disabled="regeneratingFinal"
                      @click="regenerateFinalVideos"
                    >
                      Regenerate
                    </UButton>
                  </div>
                </template>
                <div class="aspect-[9/16] w-full bg-black rounded-lg overflow-hidden">
                  <video
                    v-if="finalVideoSeamless"
                    :src="finalVideoSeamless"
                    controls
                    class="w-full h-full object-contain"
                    preload="metadata"
                  >
                    Your browser does not support the video tag.
                  </video>
                  <div v-else class="w-full h-full flex items-center justify-center text-white">
                    <div class="text-center">
                      <UIcon name="i-heroicons-video-camera" class="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p class="text-sm">Not available</p>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import type { Storyboard, Segment } from '~/types/generation'
import MusicPlayer from '~/components/ui/MusicPlayer.vue'
import { parseDialogue, formatDialogue, validateCTADialogue } from '~/utils/dialogue-parser'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// Existing video preview flow
const loading = ref(true)
const error = ref<string | null>(null)
const videoData = ref<{
  videoUrl: string
  storyboard?: Storyboard
  voiceoverScript?: string
  voiceoverSegments?: Array<{ type: string; script: string }>
  duration?: number
  cost?: number
  musicUrl?: string | null
} | null>(null)

// Category flow: Storyboard generation
const isCategoryFlow = ref(false)
const generatingStoryboard = ref(false)
const storyboard = ref<Storyboard | null>(null)

// Category flow: Frame generation
const generatingFrames = ref(false)
const frameGenerationStatus = ref<Array<{ label: string; status: 'pending' | 'generating' | 'completed' }>>([])
const generatedFrames = ref<Array<{ segmentIndex: number; frameType: 'first' | 'last'; imageUrl: string }>>([])

// Video generation state
const videoGenerationJobId = ref<string | null>(null)
const videoGenerationStatus = ref<'idle' | 'processing' | 'completed' | 'failed'>('idle')
const videoGenerationProgress = ref(0)
const videoGenerationStep = ref<'generating-assets' | 'composing-video' | 'completed'>('generating-assets')
const sceneVideos = ref<Map<number, string>>(new Map()) // segmentId -> videoUrl
const finalVideoOriginal = ref<string | null>(null)
const finalVideoSeamless = ref<string | null>(null)
const regeneratingScenes = ref<Set<number>>(new Set()) // Track which scenes are regenerating
const regeneratingFinal = ref(false)
const sceneVideoChanged = ref(false) // Track if any scene has changed
const pollingInterval = ref<NodeJS.Timeout | null>(null)
const assetJobId = ref<string | null>(null) // Store asset job ID for regeneration
const startingVideoGeneration = ref(false) // Track initial API call state for immediate feedback

// Poll for storyboard status
const pollStoryboardStatus = async (jobId: string, meta: any, maxAttempts: number = 60): Promise<Storyboard> => {
  let attempts = 0
  
  while (attempts < maxAttempts) {
    try {
      const statusData = await $fetch(`/api/plan-storyboard-status`, {
        method: 'POST',
        body: { jobId },
      })
      
      if (statusData.status === 'completed' && statusData.storyboard) {
        // API returns storyboard directly
        const storyboardData = statusData.storyboard as Storyboard
        
        // Ensure meta exists and has correct aspectRatio
        if (!storyboardData.meta) {
          storyboardData.meta = {}
        }
        // Ensure aspectRatio is valid (must be '16:9' or '9:16')
        if (!storyboardData.meta.aspectRatio || 
            (storyboardData.meta.aspectRatio !== '16:9' && storyboardData.meta.aspectRatio !== '9:16')) {
          // Default to 9:16 if not set or invalid
          storyboardData.meta.aspectRatio = '9:16'
        }
        
        return storyboardData
      } else if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Storyboard generation failed')
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

// Generate storyboard from category flow
const generateStoryboard = async () => {
  if (!import.meta.client) return
  
  generatingStoryboard.value = true
  error.value = null
  
  try {
    const promptDataStr = sessionStorage.getItem('promptData')
    const categoryFlowStr = sessionStorage.getItem('categoryFlow')
    
    if (!promptDataStr || !categoryFlowStr) {
      throw new Error('Missing prompt data or category flow data')
    }
    
    const promptData = JSON.parse(promptDataStr)
    const categoryFlow = JSON.parse(categoryFlowStr)
    
    // Step 1: Parse prompt
    console.log('[Preview] Step 1: Parsing prompt...')
    
    // Collect all reference images (avatar + product)
    const referenceImages: string[] = []
    if (promptData.avatarReference && Array.isArray(promptData.avatarReference)) {
      referenceImages.push(...promptData.avatarReference)
    }
    if (promptData.productImages && Array.isArray(promptData.productImages)) {
      referenceImages.push(...promptData.productImages)
    }
    
    console.log('[Preview] Reference images to pass:', referenceImages.length)
    
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
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      },
    })
    
    console.log('[Preview] Step 1 complete: Prompt parsed')
    
    // Step 2: Plan storyboard
    console.log('[Preview] Step 2: Planning storyboard...')
    const storyboardResult = await $fetch('/api/plan-storyboard', {
      method: 'POST',
      body: { parsed: parsedResult },
    }) as Storyboard | { jobId?: string; status?: string; meta?: any }
    
    let storyboardData: Storyboard
    
    // Check if this is an async response with jobId
    if ('jobId' in storyboardResult && storyboardResult.jobId && storyboardResult.status === 'pending') {
      console.log('[Preview] Storyboard planning is async, polling...')
      // Ensure meta has aspectRatio before passing to poll
      const metaForPoll = storyboardResult.meta || parsedResult.meta || {}
      if (!metaForPoll.aspectRatio) {
        metaForPoll.aspectRatio = promptData.aspectRatio || '9:16'
      }
      storyboardData = await pollStoryboardStatus(storyboardResult.jobId, metaForPoll)
    } else {
      storyboardData = storyboardResult as Storyboard
    }
    
    console.log('[Preview] Step 2 complete: Storyboard planned')
    
    // Ensure storyboard meta has correct aspectRatio
    if (!storyboardData.meta) {
      storyboardData.meta = {}
    }
    
    // Ensure aspectRatio is set correctly (must be '16:9' or '9:16')
    const aspectRatio = promptData.aspectRatio || '9:16'
    if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
      console.warn('[Preview] Invalid aspectRatio, defaulting to 9:16:', aspectRatio)
      storyboardData.meta.aspectRatio = '9:16'
    } else {
      storyboardData.meta.aspectRatio = aspectRatio as '16:9' | '9:16'
    }
    
    // Ensure mode is set
    if (!storyboardData.meta.mode) {
      storyboardData.meta.mode = 'production'
    }
    
    console.log('[Preview] Storyboard meta after normalization:', {
      aspectRatio: storyboardData.meta.aspectRatio,
      mode: storyboardData.meta.mode,
      seamlessTransition: storyboardData.meta.seamlessTransition,
    })
    
    storyboard.value = storyboardData
    
    // Initialize dialogue state when storyboard is ready
    initializeDialogueState()
    
    // Auto-trigger frame generation after storyboard is ready
    await generateFrames(storyboardData, promptData)
  } catch (err: any) {
    console.error('[Preview] Error generating storyboard:', err)
    error.value = err.message || 'Failed to generate storyboard'
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to generate storyboard. Please try again.',
      color: 'red',
    })
  } finally {
    generatingStoryboard.value = false
  }
}

// Generate frames after storyboard is ready
const generateFrames = async (storyboardData: Storyboard, promptData: any) => {
  if (!import.meta.client) return
  
  generatingFrames.value = true
  error.value = null
  
  try {
    // Initialize frame generation status
    const expectedFrames = [
      { label: 'Hook first frame', segmentIndex: 0, frameType: 'first' as const },
      { label: 'Hook last frame', segmentIndex: 0, frameType: 'last' as const },
      { label: 'Body last frame', segmentIndex: 1, frameType: 'last' as const },
      { label: 'CTA last frame', segmentIndex: 2, frameType: 'last' as const },
    ]
    
    frameGenerationStatus.value = expectedFrames.map(f => ({
      label: f.label,
      status: 'pending' as const,
    }))
    
    // Extract story from storyboard segments
    const story = {
      description: promptData.prompt,
      hook: storyboardData.segments.find(s => s.type === 'hook')?.description || '',
      bodyOne: storyboardData.segments.find((s, idx) => s.type === 'body' && idx === 1)?.description || '',
      bodyTwo: storyboardData.segments.find((s, idx) => s.type === 'body' && idx === 2)?.description || '',
      callToAction: storyboardData.segments.find(s => s.type === 'cta')?.description || '',
    }
    
    console.log('[Preview] Step 3: Generating frames...')
    console.log('[Preview] Avatar reference:', promptData.avatarReference)
    console.log('[Preview] Avatar ID:', promptData.avatarId)
    
    // Call generate-frames API
    const framesResult = await $fetch('/api/generate-frames', {
      method: 'POST',
      body: {
        storyboard: storyboardData,
        productImages: promptData.productImages || [],
        subjectReference: promptData.personReference,
        avatarReference: promptData.avatarReference || [],
        avatarId: promptData.avatarId,
        story,
        mode: storyboardData.meta.mode || 'production',
      },
    }) as { frames: Array<{ segmentIndex: number; frameType: string; imageUrl: string }> }
    
    console.log('[Preview] Step 3 complete: Frames generated')
    console.log('[Preview] Frames count:', framesResult.frames.length)
    
    // Update frame generation status
    framesResult.frames.forEach((frame) => {
      const statusIndex = frameGenerationStatus.value.findIndex(
        s => s.label.includes(getFrameLabel(frame.segmentIndex, frame.frameType))
      )
      if (statusIndex !== -1) {
        frameGenerationStatus.value[statusIndex].status = 'completed'
      }
      
      // Update storyboard segments with frame images
      if (storyboard.value) {
        const segment = storyboard.value.segments[frame.segmentIndex]
        if (segment) {
          if (frame.frameType === 'first') {
            segment.firstFrameImage = frame.imageUrl
          } else if (frame.frameType === 'last') {
            segment.lastFrameImage = frame.imageUrl
          }
        }
      }
    })
    
    generatedFrames.value = framesResult.frames
    
    // Implement frame reuse logic: Body and CTA opening shots reuse previous segments' last frames
    if (storyboard.value) {
      const bodySegments = storyboard.value.segments.filter(s => s.type === 'body')
      const ctaSegment = storyboard.value.segments.find(s => s.type === 'cta')
      
      if (bodySegments.length === 1) {
        // 3-segment format: Hook, Body, CTA
        const hookSegment = storyboard.value.segments[0]
        const bodySegment = bodySegments[0]
        
        if (hookSegment.lastFrameImage && !bodySegment.firstFrameImage) {
          bodySegment.firstFrameImage = hookSegment.lastFrameImage
          console.log('[Preview] Assigned body first frame (from hook last):', hookSegment.lastFrameImage.substring(0, 60))
        }
        if (bodySegment.lastFrameImage && ctaSegment && !ctaSegment.firstFrameImage) {
          ctaSegment.firstFrameImage = bodySegment.lastFrameImage
          console.log('[Preview] Assigned CTA first frame (from body last):', bodySegment.lastFrameImage.substring(0, 60))
        }
      } else if (bodySegments.length === 2) {
        // 4-segment format: Hook, Body1, Body2, CTA
        const hookSegment = storyboard.value.segments[0]
        const body1Segment = bodySegments[0]
        const body2Segment = bodySegments[1]
        
        if (hookSegment.lastFrameImage && !body1Segment.firstFrameImage) {
          body1Segment.firstFrameImage = hookSegment.lastFrameImage
          console.log('[Preview] Assigned body1 first frame (from hook last):', hookSegment.lastFrameImage.substring(0, 60))
        }
        if (body1Segment.lastFrameImage && !body2Segment.firstFrameImage) {
          body2Segment.firstFrameImage = body1Segment.lastFrameImage
          console.log('[Preview] Assigned body2 first frame (from body1 last):', body1Segment.lastFrameImage.substring(0, 60))
        }
        if (body2Segment.lastFrameImage && ctaSegment && !ctaSegment.firstFrameImage) {
          ctaSegment.firstFrameImage = body2Segment.lastFrameImage
          console.log('[Preview] Assigned CTA first frame (from body2 last):', body2Segment.lastFrameImage.substring(0, 60))
        }
      }
    }
  } catch (err: any) {
    console.error('[Preview] Error generating frames:', err)
    error.value = err.message || 'Failed to generate frames'
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to generate frames. Please try again.',
      color: 'red',
    })
  } finally {
    generatingFrames.value = false
  }
}

// Helper functions
const getSegmentLabel = (type: string): string => {
  switch (type) {
    case 'hook':
      return 'Hook'
    case 'cta':
      return 'Call to Action'
    case 'body':
      return 'Body'
    default:
      return type
  }
}

const getSegmentColor = (type: string): string => {
  switch (type) {
    case 'hook':
      return 'blue'
    case 'cta':
      return 'green'
    case 'body':
      return 'purple'
    default:
      return 'gray'
  }
}

const getFrameLabel = (segmentIndex: number, frameType: string): string => {
  const segmentLabels = ['Hook', 'Body', 'Body', 'CTA']
  const frameLabels = { first: 'first', last: 'last' }
  return `${segmentLabels[segmentIndex] || 'Segment'} ${frameLabels[frameType as keyof typeof frameLabels] || frameType}`
}

const getFrameStatus = (segmentIndex: number, frameType: 'first' | 'last'): 'pending' | 'generating' | 'completed' => {
  const frame = generatedFrames.value.find(
    f => f.segmentIndex === segmentIndex && f.frameType === frameType
  )
  if (frame) return 'completed'
  
  const status = frameGenerationStatus.value.find(
    s => s.label.includes(getFrameLabel(segmentIndex, frameType))
  )
  return status?.status || 'pending'
}

const allFramesReady = computed(() => {
  if (!storyboard.value) return false
  
  // Check if all required frames are generated
  const requiredFrames = [
    { segmentIndex: 0, frameType: 'first' as const },
    { segmentIndex: 0, frameType: 'last' as const },
    { segmentIndex: 1, frameType: 'last' as const },
    { segmentIndex: 2, frameType: 'last' as const },
  ]
  
  return requiredFrames.every(frame => {
    const generated = generatedFrames.value.find(
      f => f.segmentIndex === frame.segmentIndex && f.frameType === frame.frameType
    )
    return !!generated
  })
})

// Poll for video generation status
const pollVideoStatus = async () => {
  if (!videoGenerationJobId.value) return
  
  try {
    const result = await $fetch(`/api/generate-video-status/${videoGenerationJobId.value}`) as {
      status: 'processing' | 'completed' | 'failed'
      progress: number
      step?: 'generating-assets' | 'composing-video' | 'completed'
      message?: string
      videoUrl?: string
      videoId?: string
      error?: string
      assets?: Array<{ segmentId: number; videoUrl?: string; status: string }>
      sceneVideos?: Record<number, string>
      assetJobId?: string
    }
    
    videoGenerationStatus.value = result.status
    videoGenerationProgress.value = result.progress
    if (result.step) {
      videoGenerationStep.value = result.step
    }
    
    // Store asset job ID for regeneration
    if (result.assetJobId) {
      assetJobId.value = result.assetJobId
    }
    
    // Update scene videos from response
    let allScenesComplete = false
    if (result.sceneVideos) {
      console.log('[Preview] Received sceneVideos from API:', Object.keys(result.sceneVideos).length, 'scenes')
      Object.entries(result.sceneVideos).forEach(([segmentId, videoUrl]) => {
        const id = parseInt(segmentId)
        const oldUrl = sceneVideos.value.get(id)
        if (oldUrl && oldUrl !== videoUrl) {
          // Scene video changed - mark for final video regeneration
          sceneVideoChanged.value = true
          console.log(`[Preview] Scene ${id} video changed`)
        }
        sceneVideos.value.set(id, videoUrl)
        console.log(`[Preview] Scene ${id} video set:`, videoUrl?.substring(0, 60))
      })
      // Check if all scenes are complete
      if (storyboard.value && Object.keys(result.sceneVideos).length === storyboard.value.segments.length) {
        allScenesComplete = true
        console.log('[Preview] All scene videos are complete')
      }
    } else if (result.assets) {
      // Fallback: extract from assets array
      console.log('[Preview] Extracting scene videos from assets array:', result.assets.length, 'assets')
      const completedAssets = result.assets.filter(a => a.status === 'completed' && a.videoUrl)
      completedAssets.forEach((asset) => {
        const oldUrl = sceneVideos.value.get(asset.segmentId)
        if (oldUrl && oldUrl !== asset.videoUrl) {
          sceneVideoChanged.value = true
          console.log(`[Preview] Scene ${asset.segmentId} video changed (from assets)`)
        }
        sceneVideos.value.set(asset.segmentId, asset.videoUrl!)
        console.log(`[Preview] Scene ${asset.segmentId} video set from assets:`, asset.videoUrl?.substring(0, 60))
      })
      // Check if all scenes are complete
      if (storyboard.value && completedAssets.length === storyboard.value.segments.length) {
        allScenesComplete = true
        console.log('[Preview] All scene videos are complete (from assets)')
      }
    }
    
    // If all scenes are complete but we don't have the original video yet, compose it
    if (allScenesComplete && !finalVideoOriginal.value && result.status !== 'completed') {
      console.log('[Preview] All scenes complete, composing original video...')
      await composeOriginalVideo()
    }
    
    // If completed, we have the seamless video from the status endpoint
    // We still need to compose the original (un-seamless) version
    if (result.status === 'completed' && result.videoUrl) {
      console.log('[Preview] Generation completed, seamless video URL:', result.videoUrl?.substring(0, 60))
      finalVideoSeamless.value = result.videoUrl
      
      // Compose original version if we have all scene videos
      // Check if we have videos for all segments
      if (storyboard.value && sceneVideos.value.size === storyboard.value.segments.length) {
        if (!finalVideoOriginal.value) {
          console.log('[Preview] Composing original video after completion...')
          await composeOriginalVideo()
        } else {
          console.log('[Preview] Original video already composed')
        }
      } else {
        console.warn('[Preview] Cannot compose original video: missing scene videos. Have', sceneVideos.value.size, 'of', storyboard.value?.segments.length)
        // Try to compose anyway if we have at least some videos
        if (sceneVideos.value.size > 0) {
          console.log('[Preview] Attempting to compose original video with available scenes...')
          await composeOriginalVideo()
        }
      }
      
      // Stop polling only if we have both videos or if we've tried to compose
      if (finalVideoOriginal.value || finalVideoSeamless.value) {
        stopPollingVideoStatus()
        console.log('[Preview] Stopping polling - videos available')
        
        toast.add({
          title: 'Video Generated!',
          description: finalVideoOriginal.value && finalVideoSeamless.value 
            ? 'Both video versions are ready to view.'
            : 'Your video is ready to view.',
          color: 'green',
        })
      } else {
        console.warn('[Preview] Generation completed but no videos available')
      }
    } else if (result.status === 'failed') {
      stopPollingVideoStatus()
      console.error('[Preview] Generation failed:', result.error)
      toast.add({
        title: 'Generation Failed',
        description: result.error || 'Video generation failed',
        color: 'red',
      })
    }
  } catch (err: any) {
    console.error('[Preview] Error polling video status:', err)
    // Continue polling on error (might be temporary)
  }
}

// Start polling for video generation status
const startPollingVideoStatus = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
  }
  
  // Poll immediately, then every 2 seconds
  pollVideoStatus()
  pollingInterval.value = setInterval(() => {
    pollVideoStatus()
  }, 2000)
}

// Stop polling
const stopPollingVideoStatus = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
}

// Format clips for composition (helper function)
const formatClipsForComposition = () => {
  if (!storyboard.value || sceneVideos.value.size === 0) return []
  
  const segmentTimings = new Map<number, { startTime: number; endTime: number; type: string }>()
  storyboard.value.segments.forEach((seg, idx) => {
    segmentTimings.set(idx, {
      startTime: seg.startTime,
      endTime: seg.endTime,
      type: seg.type,
    })
  })
  
  let currentStartTime = 0
  const formattedClips = Array.from(sceneVideos.value.entries())
    .sort(([a], [b]) => a - b) // Sort by segmentId
    .map(([segmentId, videoUrl]) => {
      const timing = segmentTimings.get(segmentId)
      if (!timing) return null
      
      const clipStart = currentStartTime
      const clipDuration = timing.endTime - timing.startTime
      const clipEnd = currentStartTime + clipDuration
      currentStartTime = clipEnd
      
      return {
        videoUrl,
        startTime: clipStart,
        endTime: clipEnd,
        type: timing.type || 'scene',
      }
    })
    .filter((clip): clip is NonNullable<typeof clip> => clip !== null)
  
  return formattedClips
}

// Compose original (un-seamless) video only
const composeOriginalVideo = async () => {
  const formattedClips = formatClipsForComposition()
  if (formattedClips.length === 0 || !storyboard.value) {
    console.warn('[Preview] Cannot compose original video: missing clips or storyboard')
    return
  }
  
  console.log('[Preview] Composing original video with', formattedClips.length, 'clips')
  
  try {
    const composeOptions = {
      transition: 'none',
      musicVolume: 30,
      aspectRatio: storyboard.value.meta.aspectRatio || '9:16',
    }
    
    const originalResult = await $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video', {
      method: 'POST',
      body: {
        clips: formattedClips,
        options: composeOptions,
      },
    })
    
    if (originalResult.videoUrl) {
      finalVideoOriginal.value = originalResult.videoUrl
      console.log('[Preview] ✓ Original video composed successfully:', originalResult.videoUrl)
    } else {
      console.error('[Preview] Original video composition returned no URL')
      toast.add({
        title: 'Composition Warning',
        description: 'Original video composition completed but no URL was returned',
        color: 'yellow',
        timeout: 5000,
      })
    }
  } catch (err: any) {
    console.error('[Preview] Error composing original video:', err)
    toast.add({
      title: 'Composition Error',
      description: err.message || 'Failed to compose original video. You can try regenerating it manually.',
      color: 'red',
      timeout: 8000,
    })
  }
}

// Compose final videos (both original and seamless)
const composeFinalVideos = async () => {
  const formattedClips = formatClipsForComposition()
  if (formattedClips.length === 0 || !storyboard.value) {
    toast.add({
      title: 'Error',
      description: 'No video clips available for composition',
      color: 'red',
    })
    return
  }
  
  try {
    const composeOptions = {
      transition: 'none',
      musicVolume: 30,
      aspectRatio: storyboard.value.meta.aspectRatio || '9:16',
    }
    
    // Compose both versions in parallel
    const [originalResult, smartResult] = await Promise.all([
      $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video', {
        method: 'POST',
        body: {
          clips: formattedClips,
          options: composeOptions,
        },
      }),
      $fetch<{ videoUrl: string; videoId: string }>('/api/compose-video-smart', {
        method: 'POST',
        body: {
          clips: formattedClips,
          options: composeOptions,
        },
      }),
    ])
    
    finalVideoOriginal.value = originalResult.videoUrl
    finalVideoSeamless.value = smartResult.videoUrl
    sceneVideoChanged.value = false
    
    toast.add({
      title: 'Videos Composed',
      description: 'Both video versions are ready',
      color: 'green',
    })
  } catch (err: any) {
    console.error('[Preview] Error composing final videos:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to compose final videos',
      color: 'red',
    })
  }
}

// Regenerate a specific scene
const regenerateScene = async (segmentId: number) => {
  if (!storyboard.value || !assetJobId.value || regeneratingScenes.value.has(segmentId)) return
  
  try {
    regeneratingScenes.value.add(segmentId)
    
    toast.add({
      title: 'Regenerating Scene',
      description: `Regenerating ${getSegmentLabel(storyboard.value.segments[segmentId]?.type || '')} scene...`,
      color: 'blue',
    })
    
    // Call retry-segment API with current storyboard
    await $fetch(`/api/retry-segment/${segmentId}`, {
      method: 'POST',
      body: {
        jobId: assetJobId.value,
        storyboard: storyboard.value,
      },
    })
    
    // Poll for updated status to get new scene video
    await pollVideoStatus()
    
    // Mark that scene video changed
    sceneVideoChanged.value = true
    
    // Show notification that final video needs regeneration
    toast.add({
      title: 'Scene Regenerated',
      description: 'The scene has been regenerated. Regenerate the final video to see the changes.',
      color: 'yellow',
      timeout: 5000,
    })
  } catch (err: any) {
    console.error('[Preview] Error regenerating scene:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to regenerate scene',
      color: 'red',
    })
  } finally {
    regeneratingScenes.value.delete(segmentId)
  }
}

// Regenerate final videos
const regenerateFinalVideos = async () => {
  if (regeneratingFinal.value) return
  
  try {
    regeneratingFinal.value = true
    
    toast.add({
      title: 'Regenerating Final Videos',
      description: 'Composing both video versions...',
      color: 'blue',
    })
    
    await composeFinalVideos()
  } catch (err: any) {
    console.error('[Preview] Error regenerating final videos:', err)
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to regenerate final videos',
      color: 'red',
    })
  } finally {
    regeneratingFinal.value = false
  }
}

// Proceed to video generation
const proceedToGeneration = async () => {
  if (!storyboard.value || !allFramesReady.value) return
  
  // Set loading states immediately for instant visual feedback
  startingVideoGeneration.value = true
  videoGenerationStatus.value = 'processing'
  videoGenerationProgress.value = 0
  videoGenerationStep.value = 'generating-assets'
  
  try {
    // Show loading state
    const loadingToast = toast.add({
      title: 'Starting Video Generation',
      description: 'Preparing your video...',
      color: 'primary',
    })
    
    // Call video generation endpoint
    const result = await $fetch('/api/generate-video', {
      method: 'POST',
      body: {
        storyboard: storyboard.value,
        frames: generatedFrames.value,
      },
    }) as { jobId: string }
    
    // Store jobId in component state
    videoGenerationJobId.value = result.jobId
    sceneVideos.value.clear()
    finalVideoOriginal.value = null
    finalVideoSeamless.value = null
    sceneVideoChanged.value = false
    
    // Store jobId and data in sessionStorage
    if (import.meta.client) {
      sessionStorage.setItem('generateVideoJobId', result.jobId)
      sessionStorage.setItem('generateStoryboard', JSON.stringify(storyboard.value))
      sessionStorage.setItem('generateFrames', JSON.stringify(generatedFrames.value))
      
      // Also store promptData for reference
      const promptDataStr = sessionStorage.getItem('promptData')
      if (promptDataStr) {
        sessionStorage.setItem('promptData', promptDataStr)
      }
    }
    
    // Remove loading toast
    toast.remove(loadingToast.id)
    
    // Start polling for video generation status
    startPollingVideoStatus()
  } catch (err: any) {
    console.error('[Preview] Error starting video generation:', err)
    videoGenerationStatus.value = 'idle'
    toast.add({
      title: 'Error',
      description: err.message || 'Failed to start video generation',
      color: 'error',
    })
  } finally {
    // Reset starting state once API call completes
    startingVideoGeneration.value = false
  }
}

// Load data on mount
onMounted(async () => {
  if (!import.meta.client) return
  
  try {
    // Check if this is a new navigation (from create/finalize) vs page refresh
    const isNewNavigation = sessionStorage.getItem('isNewNavigation') === 'true'
    
    // If new navigation, clear old video generation state (but preserve storyboard/frames if they exist)
    if (isNewNavigation) {
      sessionStorage.removeItem('generateVideoJobId')
      sessionStorage.removeItem('videoResult')
      sessionStorage.removeItem('isNewNavigation') // Clear flag after use
      console.log('[Preview] New navigation detected - cleared old video generation state')
    }
    // On refresh: preserve ALL data - do NOT clear anything
    
    // Check if this is category flow (has categoryFlow in sessionStorage)
    const categoryFlowStr = sessionStorage.getItem('categoryFlow')
    if (categoryFlowStr) {
      isCategoryFlow.value = true
      
      // Check if there's an existing video generation job (only if not new navigation)
      if (!isNewNavigation) {
        const existingJobId = sessionStorage.getItem('generateVideoJobId')
        if (existingJobId) {
          videoGenerationJobId.value = existingJobId
          videoGenerationStatus.value = 'processing'
          startPollingVideoStatus()
        }
      }
      
      // Generate storyboard on load
      await generateStoryboard()
      loading.value = false
      return
    }
    
    // Otherwise, check for existing video data (existing flow)
    const storedData = sessionStorage.getItem('videoResult')
    if (storedData) {
      const data = JSON.parse(storedData)
      videoData.value = {
        videoUrl: data.videoUrl || '',
        storyboard: data.storyboard,
        voiceoverScript: data.voiceoverScript || data.script,
        voiceoverSegments: data.voiceoverSegments || data.segments,
        duration: data.duration,
        cost: data.cost,
        musicUrl: data.musicUrl || null,
      }
      // Initialize dialogue state after loading storyboard
      if (videoData.value.storyboard) {
        storyboard.value = videoData.value.storyboard
        initializeDialogueState()
      }
      sessionStorage.removeItem('videoResult')
    } else if (route.query.videoId) {
      // Load from API if videoId is provided
      try {
        const result = await $fetch(`/api/video/${route.query.videoId}`)
        videoData.value = {
          videoUrl: result.url || '',
          storyboard: result.storyboard,
          voiceoverScript: result.voiceoverScript,
          voiceoverSegments: result.voiceoverSegments,
          duration: result.duration,
          cost: result.generationCost,
          musicUrl: result.musicUrl || null,
        }
        // Initialize dialogue state after loading storyboard
        if (videoData.value.storyboard) {
          storyboard.value = videoData.value.storyboard
          initializeDialogueState()
        }
      } catch (err: any) {
        error.value = err.data?.message || err.message || 'Failed to load video'
      }
    } else {
      error.value = 'No video data found'
    }
    
    // Initialize dialogue state if storyboard exists
    if (storyboard.value) {
      initializeDialogueState()
    }
    
    loading.value = false
  } catch (err: any) {
    console.error('Error loading video data:', err)
    error.value = err.message || 'Failed to load video data'
    loading.value = false
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopPollingVideoStatus()
})

// Track edited fields
const editedFields = ref<Set<string>>(new Set())
const isSaving = ref(false)

// Dialogue state for each segment (character and dialogue text)
const dialogueState = ref<Record<number, { character: string; dialogueText: string }>>({})

// Initialize dialogue state from segments
const initializeDialogueState = () => {
  if (!storyboard.value) return
  
  console.log('[Preview] Initializing dialogue state from storyboard segments')
  storyboard.value.segments.forEach((segment, index) => {
    // Try to parse dialogue from audioNotes
    const parsed = parseDialogue(segment.audioNotes)
    if (parsed) {
      dialogueState.value[index] = {
        character: parsed.character,
        dialogueText: parsed.dialogueText
      }
      console.log(`[Preview] Segment ${index} (${segment.type}): Found dialogue - "${parsed.dialogueText}"`)
    } else {
      dialogueState.value[index] = {
        character: '',
        dialogueText: ''
      }
      if (segment.audioNotes && segment.audioNotes.trim()) {
        console.warn(`[Preview] Segment ${index} (${segment.type}): audioNotes exists but failed to parse: "${segment.audioNotes.substring(0, 100)}"`)
      }
    }
  })
  
  // Also check if voiceoverSegments exist and merge them into storyboard if audioNotes is empty
  if (videoData.value?.voiceoverSegments && storyboard.value) {
    console.log('[Preview] Checking voiceoverSegments for dialogue to merge into storyboard')
    videoData.value.voiceoverSegments.forEach((voiceoverSeg: any, index: number) => {
      const storyboardSegment = storyboard.value?.segments[index]
      if (storyboardSegment && voiceoverSeg.script) {
        // Try to parse the voiceover script format: "[Character] says: '[text]'"
        const scriptMatch = voiceoverSeg.script.match(/(.+?)\s+says:\s*['"](.+?)['"]/i)
        if (scriptMatch && (!storyboardSegment.audioNotes || !storyboardSegment.audioNotes.trim())) {
          // Convert to audioNotes format: "Dialogue: [Character] says: '[text]'"
          const character = scriptMatch[1].trim()
          const dialogueText = scriptMatch[2].trim()
          storyboardSegment.audioNotes = `Dialogue: ${character} says: '${dialogueText}'`
          console.log(`[Preview] Merged voiceover dialogue into segment ${index} (${storyboardSegment.type}): "${dialogueText}"`)
          
          // Update dialogue state
          dialogueState.value[index] = {
            character,
            dialogueText
          }
        }
      }
    })
  }
}

// Update audioNotes when dialogue changes
const updateDialogue = (index: number, field: 'character' | 'dialogueText', value: string) => {
  if (!storyboard.value) return
  
  const segment = storyboard.value.segments[index]
  if (!segment) return
  
  // Update local dialogue state
  if (!dialogueState.value[index]) {
    dialogueState.value[index] = { character: '', dialogueText: '' }
  }
  dialogueState.value[index][field] = value
  
  // Validate CTA dialogue word count
  if (segment.type === 'cta' && field === 'dialogueText') {
    const validation = validateCTADialogue(value)
    if (!validation.isValid) {
      toast.add({
        title: 'Word Limit Exceeded',
        description: validation.message,
        color: 'yellow',
        timeout: 3000,
      })
    }
  }
  
  // Reconstruct audioNotes format
  const { character, dialogueText } = dialogueState.value[index]
  segment.audioNotes = formatDialogue(character, dialogueText)
  
  // Trigger save
  saveSegmentEdit(index, 'audioNotes', segment.audioNotes)
}

// Get parsed dialogue for a segment
const getDialogue = (index: number) => {
  if (!dialogueState.value[index]) {
    const segment = storyboard.value?.segments[index]
    if (segment) {
      const parsed = parseDialogue(segment.audioNotes)
      if (parsed) {
        dialogueState.value[index] = {
          character: parsed.character,
          dialogueText: parsed.dialogueText
        }
      } else {
        dialogueState.value[index] = { character: '', dialogueText: '' }
      }
    }
  }
  return dialogueState.value[index] || { character: '', dialogueText: '' }
}

// Get dialogue preview text for display
const getDialoguePreview = (index: number): string => {
  const dialogue = getDialogue(index)
  if (!dialogue.dialogueText.trim()) return ''
  return formatDialogue(dialogue.character || 'Character', dialogue.dialogueText)
}

// Save segment edit (category flow)
const saveSegmentEdit = async (segmentIndex: number, field: string, value: string) => {
  if (!storyboard.value || !import.meta.client) return
  
  try {
    // Update local storyboard
    if (storyboard.value.segments[segmentIndex]) {
      (storyboard.value.segments[segmentIndex] as any)[field] = value
    }
    
    // Mark as edited
    const editKey = `segment-${segmentIndex}-${field}`
    editedFields.value.add(editKey)
    
    // Save to sessionStorage
    sessionStorage.setItem('generateStoryboard', JSON.stringify(storyboard.value))
    
    // Save to API if storyboard has an ID
    if (storyboard.value.id) {
      isSaving.value = true
      try {
        await $fetch('/api/update-storyboard', {
          method: 'POST',
          body: {
            storyboardId: storyboard.value.id,
            segments: storyboard.value.segments.map((seg, idx) => ({
              type: seg.type,
              description: idx === segmentIndex && field === 'description' ? value : seg.description,
              visualPrompt: idx === segmentIndex && field === 'visualPrompt' ? value : seg.visualPrompt,
              audioNotes: idx === segmentIndex && field === 'audioNotes' ? value : seg.audioNotes,
              startTime: seg.startTime,
              endTime: seg.endTime,
            })),
          },
        })
        
        toast.add({
          title: 'Saved',
          description: 'Your changes have been saved',
          color: 'green',
          timeout: 2000,
        })
      } catch (err: any) {
        console.error('[Preview] Error saving to API:', err)
        // Still show success since sessionStorage was updated
        toast.add({
          title: 'Saved Locally',
          description: 'Changes saved locally. API save failed.',
          color: 'yellow',
          timeout: 3000,
        })
      } finally {
        isSaving.value = false
      }
    }
  } catch (err: any) {
    console.error('[Preview] Error saving segment edit:', err)
  }
}

// Save voiceover script (existing video flow)
const saveVoiceoverScript = async () => {
  if (!videoData.value || !import.meta.client) return
  
  try {
    // Save to sessionStorage
    const videoResult = {
      videoUrl: videoData.value.videoUrl,
      storyboard: videoData.value.storyboard,
      voiceoverScript: videoData.value.voiceoverScript,
      voiceoverSegments: videoData.value.voiceoverSegments,
      duration: videoData.value.duration,
      cost: videoData.value.cost,
      musicUrl: videoData.value.musicUrl,
    }
    sessionStorage.setItem('videoResult', JSON.stringify(videoResult))
    
    // Mark as edited
    editedFields.value.add('voiceover-script')
    
    // Save to API if storyboard has an ID
    if (videoData.value.storyboard?.id) {
      isSaving.value = true
      try {
        await $fetch('/api/update-storyboard', {
          method: 'POST',
          body: {
            storyboardId: videoData.value.storyboard.id,
            voiceoverScript: videoData.value.voiceoverScript,
          },
        })
        
        toast.add({
          title: 'Saved',
          description: 'Voiceover script has been saved',
          color: 'green',
          timeout: 2000,
        })
      } catch (err: any) {
        console.error('[Preview] Error saving voiceover to API:', err)
        toast.add({
          title: 'Saved Locally',
          description: 'Changes saved locally. API save failed.',
          color: 'yellow',
          timeout: 3000,
        })
      } finally {
        isSaving.value = false
      }
    }
  } catch (err: any) {
    console.error('[Preview] Error saving voiceover script:', err)
  }
}

// Save video segment edit (existing video flow)
const saveVideoSegmentEdit = async (segmentIndex: number, field: string, value: string) => {
  if (!videoData.value?.storyboard || !import.meta.client) return
  
  try {
    // Update local storyboard
    if (videoData.value.storyboard.segments[segmentIndex]) {
      (videoData.value.storyboard.segments[segmentIndex] as any)[field] = value
    }
    
    // Mark as edited
    const editKey = `video-segment-${segmentIndex}-${field}`
    editedFields.value.add(editKey)
    
    // Save to sessionStorage
    const videoResult = {
      videoUrl: videoData.value.videoUrl,
      storyboard: videoData.value.storyboard,
      voiceoverScript: videoData.value.voiceoverScript,
      voiceoverSegments: videoData.value.voiceoverSegments,
      duration: videoData.value.duration,
      cost: videoData.value.cost,
      musicUrl: videoData.value.musicUrl,
    }
    sessionStorage.setItem('videoResult', JSON.stringify(videoResult))
    
    // Save to API if storyboard has an ID
    if (videoData.value.storyboard.id) {
      isSaving.value = true
      try {
        await $fetch('/api/update-storyboard', {
          method: 'POST',
          body: {
            storyboardId: videoData.value.storyboard.id,
            segments: videoData.value.storyboard.segments.map((seg, idx) => ({
              type: seg.type,
              description: idx === segmentIndex && field === 'description' ? value : seg.description,
              visualPrompt: idx === segmentIndex && field === 'visualPrompt' ? value : seg.visualPrompt,
              audioNotes: seg.audioNotes,
              startTime: seg.startTime,
              endTime: seg.endTime,
            })),
          },
        })
        
        toast.add({
          title: 'Saved',
          description: 'Your changes have been saved',
          color: 'green',
          timeout: 2000,
        })
      } catch (err: any) {
        console.error('[Preview] Error saving to API:', err)
        toast.add({
          title: 'Saved Locally',
          description: 'Changes saved locally. API save failed.',
          color: 'yellow',
          timeout: 3000,
        })
      } finally {
        isSaving.value = false
      }
    }
  } catch (err: any) {
    console.error('[Preview] Error saving video segment edit:', err)
  }
}

// Save voiceover segment (existing video flow)
const saveVoiceoverSegment = async (index: number, script: string) => {
  if (!videoData.value || !import.meta.client) return
  
  try {
    // Update local data
    if (videoData.value.voiceoverSegments && videoData.value.voiceoverSegments[index]) {
      videoData.value.voiceoverSegments[index].script = script
    }
    
    // Mark as edited
    editedFields.value.add(`voiceover-segment-${index}`)
    
    // Save to sessionStorage
    const videoResult = {
      videoUrl: videoData.value.videoUrl,
      storyboard: videoData.value.storyboard,
      voiceoverScript: videoData.value.voiceoverScript,
      voiceoverSegments: videoData.value.voiceoverSegments,
      duration: videoData.value.duration,
      cost: videoData.value.cost,
      musicUrl: videoData.value.musicUrl,
    }
    sessionStorage.setItem('videoResult', JSON.stringify(videoResult))
    
    // Save to API if storyboard has an ID
    if (videoData.value.storyboard?.id) {
      isSaving.value = true
      try {
        await $fetch('/api/update-storyboard', {
          method: 'POST',
          body: {
            storyboardId: videoData.value.storyboard.id,
            voiceoverScript: videoData.value.voiceoverScript,
          },
        })
        
        toast.add({
          title: 'Saved',
          description: 'Voiceover segment has been saved',
          color: 'green',
          timeout: 2000,
        })
      } catch (err: any) {
        console.error('[Preview] Error saving voiceover segment to API:', err)
        toast.add({
          title: 'Saved Locally',
          description: 'Changes saved locally. API save failed.',
          color: 'yellow',
          timeout: 3000,
        })
      } finally {
        isSaving.value = false
      }
    }
  } catch (err: any) {
    console.error('[Preview] Error saving voiceover segment:', err)
  }
}

const downloadVideo = async () => {
  if (!videoData.value?.videoUrl) {
    toast.add({
      title: 'Error',
      description: 'Video URL not available',
      color: 'red',
    })
    return
  }

  try {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = videoData.value.videoUrl
    link.download = `adubun-ad-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.add({
      title: 'Download Started',
      description: 'Your video download has started',
      color: 'green',
    })
  } catch (err: any) {
    toast.add({
      title: 'Download Error',
      description: err.message || 'Failed to download video',
      color: 'red',
    })
  }
}
</script>
