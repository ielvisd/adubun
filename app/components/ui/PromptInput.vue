<template>
  <div>
    <div v-if="mounted">
      <UForm :state="form" :schema="schema" @submit="handleSubmit" class="space-y-6">
        <!-- Single text input: "Describe the ad you want" -->
        <UFormField label="Describe the ad you want" name="prompt" required>
          <UTextarea
            v-model="form.prompt"
            placeholder="Make me an ad for AlaniNu energy drink."
            :rows="4"
            class="w-full"
            :disabled="props.loading"
          />
          <template #description>
            <span class="text-gray-600 dark:text-gray-400">Describe your ad in natural language. Include details about your product, target audience, and desired style.</span>
          </template>
        </UFormField>

        <!-- Product image upload (up to 10 images, optional but recommended) -->
        <UFormField 
          label="Product Images (Optional but Recommended)" 
          name="productImages"
        >
          <MultiImageUpload 
            v-model="form.productImages" 
            :max-images="10" 
            @upload="handleProductImageUpload($event)" 
          />
          <template #description>
            <span class="text-gray-600 dark:text-gray-400">Upload up to 10 product reference images. Multiple angles are recommended for better results. If you provide fewer than 10, we'll generate additional images automatically.</span>
          </template>
        </UFormField>

        <!-- Video dimension dropdown -->
        <UFormField label="Video Dimension" name="aspectRatio" required>
          <USelect
            v-model="form.aspectRatio"
            :items="aspectRatioOptions"
            :disabled="props.loading"
          />
          <template #description>
            <span class="text-gray-600 dark:text-gray-400">Choose the aspect ratio for your video ad</span>
          </template>
        </UFormField>

        <!-- Video model selection -->
        <UFormField label="Video Generation Model" name="model" required>
          <USelect
            v-model="form.model"
            :items="modelOptions"
            :disabled="props.loading"
            @update:model-value="handleModelChange"
          />
          <template #description>
            <p v-if="selectedModel?.description" class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {{ selectedModel.description }}
            </p>
          </template>
        </UFormField>

        <!-- Voiceover toggle (off by default) -->
        <UFormField label="Generate Voiceover Script" name="generateVoiceover">
          <div class="flex items-center gap-3">
            <USwitch
              v-model="form.generateVoiceover"
              :disabled="props.loading"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Generate a voiceover script matching the storyboard content (optional)
            </span>
          </div>
        </UFormField>

        <UButton
          type="submit"
          size="xl"
          :loading="props.loading"
          :disabled="props.loading"
          color="secondary"
          variant="solid"
          class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg"
        >
          Generate Stories
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
import { VIDEO_MODELS, DEFAULT_MODEL_ID, getModelById } from '~/config/video-models'
import type { VideoModel } from '~/types/generation'

const schema = z.object({
  prompt: z.string().min(10, 'Please provide at least 10 characters describing your ad').max(1000, 'Description must be less than 1000 characters'),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).max(10).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  model: z.string().min(1, 'Please select a video generation model'),
  generateVoiceover: z.boolean().optional(),
})

// Initialize form state
const getInitialFormState = () => ({
  prompt: '',
  productImages: [] as (File | string)[],
  aspectRatio: '16:9' as '16:9' | '9:16' | '1:1', // Default to 16:9
  model: DEFAULT_MODEL_ID,
  generateVoiceover: false, // Off by default
})

const form = reactive(getInitialFormState())

const mounted = ref(false)

onMounted(() => {
  mounted.value = true
  // Initialize based on default model
  handleModelChange(DEFAULT_MODEL_ID)
})

// Model options for dropdown
const modelOptions = VIDEO_MODELS.map((model: VideoModel) => ({
  label: model.name,
  value: model.id,
}))

// Computed selected model
const selectedModel = computed<VideoModel | undefined>(() => {
  return getModelById(form.model)
})

// Aspect ratio options
const aspectRatioOptions = [
  { label: '16:9 (Landscape)', value: '16:9' },
  { label: '9:16 (Vertical)', value: '9:16' },
  { label: '1:1 (Square)', value: '1:1' },
]

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: typeof form]
}>()

const handleModelChange = (modelId: string) => {
  const model = getModelById(modelId)
  if (model) {
    // Update aspect ratio to first available option if current is not supported
    if (model.aspectRatioOptions && !model.aspectRatioOptions.includes(form.aspectRatio)) {
      form.aspectRatio = model.aspectRatioOptions[0]
    }
  }
}

const handleProductImageUpload = (files: (File | string | null)[]) => {
  form.productImages = files.filter(f => f !== null) as (File | string)[]
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
