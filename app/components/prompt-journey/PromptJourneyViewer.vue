<template>
  <div class="mt-12 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UIcon name="i-heroicons-document-text" class="w-6 h-6 text-secondary-500" />
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Prompt Journey</h2>
          <UBadge color="blue" variant="subtle">{{ totalStages }} stages</UBadge>
        </div>
        <UButton 
          variant="ghost" 
          color="gray"
          @click="collapsed = !collapsed"
        >
          <UIcon :name="collapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'" />
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </UButton>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
        See every prompt used to generate your video - from your original idea to the final AI instructions
      </p>
    </div>

    <!-- Content (collapsible) -->
    <div v-show="!collapsed" class="p-6">
      <!-- Timeline View -->
      <div class="space-y-8">
        
        <!-- 1. User Input -->
        <PromptStage
          :stage-number="1"
          stage-name="Your Original Input"
          stage-description="What you told us"
          icon="i-heroicons-user"
          icon-color="blue"
        >
          <div class="space-y-3">
            <PromptBlock
              label="User Prompt"
              :content="userInput.prompt"
            />
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Ad Type</div>
                <div class="font-semibold text-gray-900 dark:text-white capitalize">{{ userInput.adType || 'N/A' }}</div>
              </div>
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Mood</div>
                <div class="font-semibold text-gray-900 dark:text-white capitalize">{{ userInput.mood || 'N/A' }}</div>
              </div>
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Aspect Ratio</div>
                <div class="font-semibold text-gray-900 dark:text-white">{{ userInput.aspectRatio }}</div>
              </div>
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Model</div>
                <div class="font-semibold text-gray-900 dark:text-white text-xs">{{ userInput.model || 'veo-3-fast' }}</div>
              </div>
            </div>
            <div v-if="userInput.productImages?.length || userInput.subjectReference" class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Reference Images</h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div v-for="(img, idx) in userInput.productImages" :key="idx" class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <img :src="img" alt="Product" class="w-full h-full object-cover" />
                </div>
                <div v-if="userInput.subjectReference" class="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                  <img :src="userInput.subjectReference" alt="Person" class="w-full h-full object-cover" />
                  <div class="absolute bottom-1 left-1">
                    <UBadge color="purple" size="xs">Person</UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PromptStage>

        <!-- 2. Story Generation -->
        <PromptStage
          v-if="storyGeneration"
          :stage-number="2"
          stage-name="Story Generation (GPT-4o)"
          stage-description="AI created narrative structure"
          icon="i-heroicons-book-open"
          icon-color="purple"
        >
          <div class="space-y-3">
            <PromptBlock
              label="System Instructions"
              :content="storyGeneration.systemPrompt"
              collapsible
            />
            <PromptBlock
              label="User Prompt to GPT-4o"
              :content="storyGeneration.userPrompt"
            />
            <div class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <h4 class="font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
                Generated Story
              </h4>
              <div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <div><strong class="text-green-900 dark:text-green-100">Hook:</strong> {{ storyGeneration.output.hook }}</div>
                <div><strong class="text-green-900 dark:text-green-100">Body 1:</strong> {{ storyGeneration.output.bodyOne }}</div>
                <div><strong class="text-green-900 dark:text-green-100">Body 2:</strong> {{ storyGeneration.output.bodyTwo }}</div>
                <div><strong class="text-green-900 dark:text-green-100">CTA:</strong> {{ storyGeneration.output.callToAction }}</div>
              </div>
            </div>
          </div>
        </PromptStage>

        <!-- 3. Storyboard Generation -->
        <PromptStage
          v-if="storyboardGeneration"
          :stage-number="storyGeneration ? 3 : 2"
          stage-name="Storyboard Planning (GPT-4o)"
          stage-description="AI broke story into visual scenes"
          icon="i-heroicons-film"
          icon-color="orange"
        >
          <div class="space-y-3">
            <PromptBlock
              label="System Instructions"
              :content="storyboardGeneration.systemPrompt"
              collapsible
            />
            <PromptBlock
              label="User Prompt to GPT-4o"
              :content="storyboardGeneration.userPrompt"
            />
            <div class="mt-4 space-y-3">
              <h4 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-orange-500" />
                Generated Visual Prompts ({{ storyboard.segments.length }} scenes)
              </h4>
              <div 
                v-for="(segment, idx) in storyboard.segments" 
                :key="idx"
                class="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
              >
                <div class="flex items-center justify-between mb-2">
                  <UBadge :color="getSegmentColor(segment.type)">{{ segment.type.toUpperCase() }}</UBadge>
                  <span class="text-xs text-gray-600 dark:text-gray-400">{{ segment.startTime }}s - {{ segment.endTime }}s</span>
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300">{{ segment.visualPrompt }}</p>
              </div>
            </div>
          </div>
        </PromptStage>

        <!-- 4. Frame Generation -->
        <PromptStage
          v-if="frameGeneration && frameGeneration.frames.length > 0"
          :stage-number="getStageNumber(4)"
          stage-name="Frame Generation (Nano-Banana)"
          stage-description="AI generated keyframe images"
          icon="i-heroicons-photo"
          icon-color="green"
        >
          <div class="space-y-4">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              Each frame uses the segment's visual prompt enhanced with character consistency and image references
            </div>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
              <FramePromptCard
                v-for="(frame, idx) in frameGeneration.frames"
                :key="idx"
                :frame="frame"
                :index="idx"
              />
            </div>
          </div>
        </PromptStage>

        <!-- 5. Video Generation -->
        <PromptStage
          v-if="videoGeneration && videoGeneration.segments.length > 0"
          :stage-number="getStageNumber(5)"
          stage-name="Video Generation (Veo 3.1)"
          stage-description="AI generated video clips"
          icon="i-heroicons-video-camera"
          icon-color="red"
        >
          <div class="space-y-4">
            <div 
              v-for="(videoSeg, idx) in videoGeneration.segments" 
              :key="idx"
              class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
            >
              <div class="flex items-center justify-between mb-3">
                <UBadge :color="getSegmentColor(videoSeg.type)">{{ videoSeg.type.toUpperCase() }} Video</UBadge>
                <span class="text-xs text-gray-600 dark:text-gray-400">Duration: {{ videoSeg.duration || 'N/A' }}s</span>
              </div>
              
              <PromptBlock
                label="Video Generation Prompt"
                :content="videoSeg.prompt"
                compact
              />
              
              <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-700 dark:text-gray-300">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-photo" class="w-4 h-4" />
                  <span>First Frame: {{ videoSeg.firstFrame ? '✓' : '✗' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-photo" class="w-4 h-4" />
                  <span>Last Frame: {{ videoSeg.lastFrame ? '✓' : '✗' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-user" class="w-4 h-4" />
                  <span>Person Ref: {{ videoSeg.subjectReference ? '✓' : '✗' }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-cube" class="w-4 h-4" />
                  <span>Product: {{ userInput.productImages?.length || 0 }}</span>
                </div>
              </div>
            </div>
          </div>
        </PromptStage>

        <!-- 6. Audio Generation -->
        <PromptStage
          v-if="hasVoiceover"
          :stage-number="getStageNumber(6)"
          stage-name="Voiceover Generation (OpenAI TTS)"
          stage-description="AI generated narration audio"
          icon="i-heroicons-speaker-wave"
          icon-color="teal"
        >
          <div class="space-y-3">
            <div 
              v-for="(segment, idx) in storyboard.segments" 
              :key="idx"
              class="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800"
            >
              <div class="flex items-center justify-between mb-2">
                <UBadge :color="getSegmentColor(segment.type)">{{ segment.type.toUpperCase() }}</UBadge>
              </div>
              <div class="text-sm text-gray-700 dark:text-gray-300">
                <strong>Narration:</strong> {{ segment.audioNotes || 'No voiceover' }}
              </div>
            </div>
          </div>
        </PromptStage>

      </div>

      <!-- Export Options -->
      <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">Export Prompt Journey</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Save all prompts for debugging or documentation</p>
          </div>
          <div class="flex gap-2">
            <UButton @click="exportAsJSON" variant="outline">
              <UIcon name="i-heroicons-document-arrow-down" />
              Export JSON
            </UButton>
            <UButton @click="copyToClipboard" variant="outline">
              <UIcon name="i-heroicons-clipboard" />
              {{ copied ? 'Copied!' : 'Copy All' }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PromptStage from './PromptStage.vue'
import PromptBlock from './PromptBlock.vue'
import FramePromptCard from './FramePromptCard.vue'
import type { Storyboard } from '~/types/generation'

const props = defineProps<{
  storyboard: Storyboard
}>()

const collapsed = ref(false)
const copied = ref(false)
const toast = useToast()

// Extract prompt journey data from storyboard
const userInput = computed(() => props.storyboard.promptJourney?.userInput || {
  prompt: 'No user prompt available',
  adType: '',
  mood: '',
  aspectRatio: props.storyboard.meta.aspectRatio,
  model: props.storyboard.meta.model || '',
  productImages: [],
  subjectReference: undefined
})

const storyGeneration = computed(() => props.storyboard.promptJourney?.storyGeneration)
const storyboardGeneration = computed(() => props.storyboard.promptJourney?.storyboardGeneration)
const frameGeneration = computed(() => props.storyboard.promptJourney?.frameGeneration)
const videoGeneration = computed(() => props.storyboard.promptJourney?.videoGeneration)

const hasVoiceover = computed(() => 
  props.storyboard.segments.some(seg => seg.audioNotes && seg.audioNotes.trim().length > 0)
)

const totalStages = computed(() => {
  let count = 1 // User input
  if (storyGeneration.value) count++
  if (storyboardGeneration.value) count++
  if (frameGeneration.value && frameGeneration.value.frames.length > 0) count++
  if (videoGeneration.value && videoGeneration.value.segments.length > 0) count++
  if (hasVoiceover.value) count++
  return count
})

const getStageNumber = (baseNumber: number) => {
  let adjustment = 0
  if (!storyGeneration.value && baseNumber > 2) adjustment--
  if (!frameGeneration.value?.frames.length && baseNumber > 4) adjustment--
  return baseNumber + adjustment
}

const getSegmentColor = (type: string) => {
  switch (type) {
    case 'hook': return 'blue'
    case 'body': return 'purple'
    case 'cta': return 'green'
    default: return 'gray'
  }
}

const exportAsJSON = () => {
  const data = {
    storyboard: props.storyboard,
    exportedAt: new Date().toISOString()
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prompt-journey-${props.storyboard.id}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  toast.add({
    title: 'Exported Successfully',
    description: 'Prompt journey downloaded as JSON',
    color: 'green'
  })
}

const copyToClipboard = async () => {
  const text = generateTextSummary()
  
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
    
    toast.add({
      title: 'Copied!',
      description: 'All prompts copied to clipboard',
      color: 'green'
    })
  } catch (error) {
    toast.add({
      title: 'Copy Failed',
      description: 'Could not copy to clipboard',
      color: 'red'
    })
  }
}

const generateTextSummary = () => {
  let text = '=== PROMPT JOURNEY ===\n\n'
  
  text += '1. USER INPUT\n'
  text += `Prompt: ${userInput.value.prompt}\n`
  text += `Ad Type: ${userInput.value.adType}\n`
  text += `Mood: ${userInput.value.mood}\n`
  text += `Aspect Ratio: ${userInput.value.aspectRatio}\n\n`
  
  if (storyGeneration.value) {
    text += '2. STORY GENERATION\n'
    text += `System Prompt:\n${storyGeneration.value.systemPrompt}\n\n`
    text += `User Prompt:\n${storyGeneration.value.userPrompt}\n\n`
    text += `Output:\n${JSON.stringify(storyGeneration.value.output, null, 2)}\n\n`
  }
  
  if (storyboardGeneration.value) {
    text += '3. STORYBOARD GENERATION\n'
    text += `System Prompt:\n${storyboardGeneration.value.systemPrompt}\n\n`
    text += `User Prompt:\n${storyboardGeneration.value.userPrompt}\n\n`
  }
  
  if (videoGeneration.value) {
    text += '4. VIDEO GENERATION\n'
    videoGeneration.value.segments.forEach((seg, idx) => {
      text += `Segment ${idx + 1} (${seg.type}):\n${seg.prompt}\n\n`
    })
  }
  
  return text
}
</script>

