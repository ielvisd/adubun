<template>
  <div>
    <div v-if="mounted">
      <UForm :state="form" :schema="schema" @submit="handleSubmit" class="space-y-6">
        
        <!-- SIMPLE MODE (Default) -->
        <div v-if="!showAdvanced" class="space-y-6">
          
          <!-- 1. Ad Type Selection -->
          <UFormField 
            label="What kind of ad are you making?" 
            name="adType" 
            required
          >
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div 
                v-for="type in adTypeOptions" 
                :key="type.value"
                @click="form.adType = type.value"
                :class="[
                  'p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-2',
                  form.adType === type.value
                    ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                ]"
              >
                <span class="text-2xl">{{ type.icon }}</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white leading-tight">{{ type.label }}</span>
              </div>
            </div>
          </UFormField>

          <!-- 2. Enhanced Prompt Field with Dynamic Placeholder -->
          <UFormField 
            label="Describe your ad" 
            name="prompt" 
            required
            class="space-y-2"
          >
            <EnhancedPromptField 
              v-model="form.prompt" 
              :disabled="props.loading"
              :placeholder="dynamicPlaceholder"
              @update:model-value="detectSettingsFromPrompt"
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">
                {{ dynamicDescription }}
              </span>
            </template>
          </UFormField>

          <!-- 3. Product Image Upload -->
          <UFormField 
            label="Product Photos (Optional)" 
            name="productImages"
          >
            <MultiImageUpload 
              v-model="form.productImages" 
              :max-images="10" 
              @upload="handleProductImageUpload($event)" 
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">
                Upload 3-10 photos from different angles
              </span>
            </template>
          </UFormField>

          <!-- 3.5. Person Reference Upload (for Lifestyle/Testimonial/Tutorial ads) -->
          <UFormField 
            v-if="form.adType === 'lifestyle' || form.adType === 'testimonial' || form.adType === 'tutorial'"
            label="Person Reference (Optional)" 
            name="personReference"
          >
            <MultiImageUpload 
              v-model="form.personReference" 
              :max-images="1" 
              @upload="handlePersonReferenceUpload($event)" 
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">
                Upload a clear photo of the person you want to feature. They'll appear consistently across all scenes.
              </span>
            </template>
          </UFormField>

          <!-- 4. Quick Format Picker (Visual) -->
          <UFormField 
            label="Where will you share this?" 
            name="aspectRatio" 
            required
          >
            <QuickFormatPicker 
              v-model="form.aspectRatio" 
              :disabled="props.loading"
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">
                Select your platform
              </span>
            </template>
          </UFormField>

          <!-- 5. Video Style/Mood -->
          <UFormField label="Video Style" name="mood" required>
            <USelect
              v-model="form.mood"
              :items="moodOptions"
              :disabled="props.loading"
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">The emotional tone of your video</span>
            </template>
          </UFormField>

          <!-- 6. Seamless Transition Toggle (Main Option) -->
          <UFormField label="Transition Style" name="seamlessTransition">
            <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <USwitch
                v-model="form.seamlessTransition"
                :disabled="props.loading"
              />
              <div class="flex-1">
                <span class="text-sm font-medium text-gray-900 dark:text-white block">
                  {{ form.seamlessTransition ? 'Seamless Transitions' : 'Creative Transitions' }}
                </span>
                <span class="text-xs text-gray-600 dark:text-gray-400">
                  {{ form.seamlessTransition 
                    ? 'Smooth, connected scenes with visual continuity' 
                    : 'Independent scenes with creative freedom' }}
                </span>
              </div>
            </div>
          </UFormField>

          <!-- Advanced Options Toggle -->
          <div class="pt-2">
            <button
              type="button"
              @click="showAdvanced = true"
              class="text-sm font-medium text-secondary-600 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-300 flex items-center gap-2 group"
            >
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4 group-hover:rotate-180 transition-transform duration-300" />
              <span>Show advanced options</span>
              <UIcon name="i-heroicons-chevron-down" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ADVANCED MODE -->
        <div v-else class="space-y-6">
          
          <!-- Back to Simple -->
          <div class="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Advanced Options</h3>
            <button
              type="button"
              @click="showAdvanced = false"
              class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
            >
              <UIcon name="i-heroicons-chevron-up" class="w-4 h-4" />
              <span>Hide advanced options</span>
            </button>
          </div>

          <!-- 1. Ad Type Selection -->
          <UFormField label="Ad Type" name="adType" required>
            <USelect
              v-model="form.adType"
              :items="adTypeOptions"
              :disabled="props.loading"
            />
          </UFormField>

          <!-- 2. Enhanced Prompt Field -->
          <UFormField label="Describe your ad" name="prompt" required>
            <EnhancedPromptField 
              v-model="form.prompt" 
              :disabled="props.loading"
              :placeholder="dynamicPlaceholder"
              @update:model-value="detectSettingsFromPrompt"
            />
          </UFormField>

          <!-- 3. Product Images -->
          <UFormField 
            label="Product Photos (Optional)" 
            name="productImages"
          >
            <MultiImageUpload 
              v-model="form.productImages" 
              :max-images="10" 
              @upload="handleProductImageUpload($event)" 
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">Upload 3-10 photos from different angles</span>
            </template>
          </UFormField>

          <!-- 3.5. Person Reference (Advanced Mode) -->
          <UFormField 
            v-if="form.adType === 'lifestyle' || form.adType === 'testimonial' || form.adType === 'tutorial'"
            label="Person Reference (Optional)" 
            name="personReference"
          >
            <MultiImageUpload 
              v-model="form.personReference" 
              :max-images="1" 
              @upload="handlePersonReferenceUpload($event)" 
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">Upload a photo of the person to feature in your ad</span>
            </template>
          </UFormField>

          <!-- 4. Format Picker -->
          <UFormField label="Where will you share this?" name="aspectRatio" required>
            <QuickFormatPicker 
              v-model="form.aspectRatio" 
              :disabled="props.loading"
            />
          </UFormField>

          <!-- 5. Video Style/Mood -->
          <UFormField label="Video Style" name="mood" required>
            <USelect
              v-model="form.mood"
              :items="moodOptions"
              :disabled="props.loading"
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">The emotional tone of your video</span>
            </template>
          </UFormField>

          <!-- 6. Quality & Speed (Model Selection) -->
          <UFormField label="Quality & Speed" name="model" required>
            <USelect
              v-model="form.model"
              :items="modelOptions"
              :disabled="props.loading"
              @update:model-value="handleModelChange"
            />
            <template #description>
              <span class="text-gray-600 dark:text-gray-400">
                {{ selectedModel?.description || 'Select a video generation model' }}
              </span>
            </template>
          </UFormField>

          <!-- 7. Voiceover Toggle -->
          <UFormField label="Generate Voiceover Script" name="generateVoiceover">
            <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <USwitch
                v-model="form.generateVoiceover"
                :disabled="props.loading"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Generate a voiceover script matching your storyboard (optional)
              </span>
            </div>
          </UFormField>
        </div>

        <!-- Cost & Time Estimate (Always visible) -->
        <div class="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ estimatedCost }} • {{ estimatedTime }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">No credit card needed</p>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <UButton
          type="submit"
          size="xl"
          :loading="props.loading"
          :disabled="props.loading"
          color="secondary"
          variant="solid"
          class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all"
        >
          <span v-if="!props.loading">Generate My Video</span>
          <span v-else>Generating...</span>
        </UButton>
      </UForm>
    </div>
    <div v-else class="w-full animate-pulse space-y-4">
      <div class="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      <div class="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      <div class="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import MultiImageUpload from './MultiImageUpload.vue'
import EnhancedPromptField from './EnhancedPromptField.vue'
import QuickFormatPicker from './QuickFormatPicker.vue'
import { VIDEO_MODELS, DEFAULT_MODEL_ID, getModelById } from '~/config/video-models'
import type { VideoModel } from '~/types/generation'

const schema = z.object({
  adType: z.string().min(1, 'Please select an ad type'),
  prompt: z.string().min(10, 'Please provide at least 10 characters describing your ad').max(1000, 'Description must be less than 1000 characters'),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).max(10).optional(),
  personReference: z.array(z.union([z.instanceof(File), z.string()])).max(1).optional(),
  aspectRatio: z.enum(['16:9', '9:16']),
  mood: z.string().min(1, 'Please select a video tone'),
  model: z.string().min(1, 'Please select a video generation model'),
  seamlessTransition: z.boolean().optional(),
  generateVoiceover: z.boolean().optional(),
})

// Initialize form state
const getInitialFormState = () => ({
  adType: 'lifestyle',
  prompt: '',
  productImages: [] as (File | string)[],
  personReference: [] as (File | string)[],
  aspectRatio: '16:9' as '16:9' | '9:16' | '1:1',
  mood: 'professional',
  model: DEFAULT_MODEL_ID,
  seamlessTransition: true, // Default: ON (seamless)
  generateVoiceover: false,
})

const form = reactive(getInitialFormState())
const mounted = ref(false)
const showAdvanced = ref(false)

onMounted(() => {
  mounted.value = true
  handleModelChange(DEFAULT_MODEL_ID)
})

// Ad Type Options
const adTypeOptions = [
  { label: 'Lifestyle Ad', value: 'lifestyle', icon: '🌟', placeholder: 'Describe your product in real-life situations, focusing on benefits and usage...', description: 'Shows the product in real-life situations' },
  { label: 'Product Ad', value: 'product', icon: '📦', placeholder: 'Describe your product\'s key features, focusing on close-ups and details...', description: 'Super focused on the product in all frames' },
  { label: 'Luxury Ad', value: 'luxury', icon: '💎', placeholder: 'Describe your product in an epic, cinematic way with dramatic natural elements (waterfalls, smoke, water, wood)...', description: 'Cinematic product storytelling with nature' },
  { label: 'Unboxing Ad', value: 'unboxing', icon: '🎁', placeholder: 'Describe the unboxing experience, from package to reveal...', description: 'Shows the product unboxing experience' },
  { label: 'Testimonial Ad', value: 'testimonial', icon: '💬', placeholder: 'Paste a customer review or describe the user experience you want to highlight...', description: 'Real customers sharing experiences' },
  { label: 'Tutorial Ad', value: 'tutorial', icon: '📚', placeholder: 'List the steps to use your product (e.g., Step 1: ..., Step 2: ...)', description: 'Step-by-step guide on how to use' },
  { label: 'Brand Story', value: 'brand_story', icon: '📖', placeholder: 'Tell the story of your brand, its values, and mission...', description: 'Tells a narrative about brand value' },
]

// Computed dynamic placeholder
const dynamicPlaceholder = computed(() => {
  const selected = adTypeOptions.find(opt => opt.value === form.adType)
  return selected ? selected.placeholder : 'Describe your product and target audience...'
})

const dynamicDescription = computed(() => {
  const selected = adTypeOptions.find(opt => opt.value === form.adType)
  return selected ? selected.description : 'Describe your product and target audience'
})

// Model options
const modelOptions = VIDEO_MODELS.map((model: VideoModel) => ({
  label: model.name,
  value: model.id,
}))

const selectedModel = computed<VideoModel | undefined>(() => {
  return getModelById(form.model)
})

// Mood/style options with friendly labels and emojis
const moodOptions = [
  { label: '💼 Professional', value: 'professional' },
  { label: '🎉 Playful', value: 'playful' },
  { label: '✨ Inspirational', value: 'inspirational' },
  { label: '🎬 Dramatic', value: 'dramatic' },
  { label: '🧘 Calm', value: 'calm' },
  { label: '⚡ Energetic', value: 'energetic' },
  { label: '💎 Luxurious', value: 'luxurious' },
  { label: '😊 Friendly', value: 'friendly' },
]

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: typeof form]
}>()

// Cost & Time Estimates
const estimatedCost = computed(() => {
  const baseCost = 1.60
  // Could adjust based on model selection in future
  return `~$${baseCost.toFixed(2)}`
})

const estimatedTime = computed(() => {
  return '3 minutes'
})

// Smart Detection from Prompt
const detectSettingsFromPrompt = (prompt: string) => {
  const lowerPrompt = prompt.toLowerCase()
  
  // Auto-detect aspect ratio
  if (lowerPrompt.includes('instagram story') || lowerPrompt.includes('reels') || lowerPrompt.includes('tiktok') || lowerPrompt.includes('vertical')) {
    form.aspectRatio = '9:16'
  } else if (lowerPrompt.includes('youtube') || lowerPrompt.includes('horizontal') || lowerPrompt.includes('landscape')) {
    form.aspectRatio = '16:9'
  } else if (lowerPrompt.includes('instagram feed') || lowerPrompt.includes('square')) {
    form.aspectRatio = '1:1'
  }
  
  // Auto-detect mood
  if (lowerPrompt.includes('energetic') || lowerPrompt.includes('high-energy') || lowerPrompt.includes('exciting')) {
    form.mood = 'energetic'
  } else if (lowerPrompt.includes('luxury') || lowerPrompt.includes('luxurious') || lowerPrompt.includes('elegant') || lowerPrompt.includes('premium')) {
    form.mood = 'luxurious'
  } else if (lowerPrompt.includes('playful') || lowerPrompt.includes('fun') || lowerPrompt.includes('vibrant')) {
    form.mood = 'playful'
  } else if (lowerPrompt.includes('calm') || lowerPrompt.includes('peaceful') || lowerPrompt.includes('soothing')) {
    form.mood = 'calm'
  } else if (lowerPrompt.includes('dramatic') || lowerPrompt.includes('intense') || lowerPrompt.includes('powerful')) {
    form.mood = 'dramatic'
  } else if (lowerPrompt.includes('inspirational') || lowerPrompt.includes('inspiring') || lowerPrompt.includes('motivational')) {
    form.mood = 'inspirational'
  } else if (lowerPrompt.includes('friendly') || lowerPrompt.includes('warm') || lowerPrompt.includes('welcoming')) {
    form.mood = 'friendly'
  }
}

const handleModelChange = (modelId: string) => {
  const model = getModelById(modelId)
  if (model) {
    if (model.aspectRatioOptions && !model.aspectRatioOptions.includes(form.aspectRatio)) {
      form.aspectRatio = model.aspectRatioOptions[0]
    }
  }
}

const handleProductImageUpload = (files: (File | string | null)[]) => {
  form.productImages = files.filter(f => f !== null) as (File | string)[]
}

const handlePersonReferenceUpload = (files: (File | string | null)[]) => {
  form.personReference = files.filter(f => f !== null) as (File | string)[]
}

const handleSubmit = async (event: any) => {
  const data = event.data || form
  
  try {
    schema.parse(data)
    emit('submit', { ...data })
  } catch (error: any) {
    if (error.errors && error.errors.length > 0) {
      const firstError = error.errors[0]
      const toast = useToast()
      toast.add({
        title: 'Validation Error',
        description: firstError.message || 'Please check your input',
        color: 'red',
      })
    }
    throw error
  }
}
</script>
