<template>
  <div v-if="mounted">
    <UForm :state="form" :schema="schema" @submit="handleSubmit">
      <div class="w-full mb-4">
        <UFormField label="Video Generation Model" name="model" required>
          <USelect
            v-model="form.model"
            :items="modelOptions"
            @update:model-value="handleModelChange"
          />
          <p v-if="selectedModel?.description" class="text-xs text-gray-500 mt-1">
            {{ selectedModel.description }}
          </p>
        </UFormField>
      </div>

      <div class="w-full">
        <UFormField label="Describe Your Ad" name="prompt" required>
          <UTextarea
            v-model="form.prompt"
            placeholder="Create a 30s Instagram ad for luxury watches with elegant gold aesthetics..."
            :rows="4"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <UFormField 
          v-if="selectedModel?.supportsCustomDuration" 
          label="Duration" 
          name="duration"
        >
          <USelect
            v-model="form.duration"
            :items="durationOptions"
          />
        </UFormField>

        <UFormField label="Aspect Ratio" name="aspectRatio">
          <USelect
            v-model="form.aspectRatio"
            :items="aspectRatioOptions"
          />
        </UFormField>

        <UFormField label="Style" name="style">
          <USelect
            v-model="form.style"
            :items="styleOptions"
          />
        </UFormField>
      </div>

      <div class="mt-4">
        <UFormField label="Mode" name="mode">
          <URadioGroup v-model="form.mode" :options="modeOptions" />
        </UFormField>
        <p class="text-xs text-gray-500 mt-1">
          Demo mode shows all scenes but only generates the first scene. Production mode generates all scenes.
        </p>
      </div>

      <!-- Image inputs - shown conditionally based on model capabilities -->
      <div v-if="showImageInputs" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <UFormField 
          v-if="selectedModel?.supportsFirstFrame"
          label="First Frame Image (Optional)" 
          name="firstFrameImage"
          description="First frame image for video generation. The output video will have the same aspect ratio as this image."
        >
          <ImageUpload v-model="form.firstFrameImage" @upload="handleImageUpload('firstFrameImage', $event)" />
        </UFormField>

        <UFormField 
          v-if="selectedModel?.supportsCharacterReference"
          label="Subject Reference (Optional)" 
          name="subjectReference"
          description="An optional character reference image to use as the subject in the generated video."
        >
          <ImageUpload v-model="form.subjectReference" @upload="handleImageUpload('subjectReference', $event)" />
        </UFormField>

        <UFormField 
          v-if="selectedModel?.supportsImageToVideo && !selectedModel?.supportsFirstFrame && !selectedModel?.supportsCharacterReference"
          label="Input Image (Optional)" 
          name="inputImage"
          description="Input image for image-to-video generation."
        >
          <ImageUpload v-model="form.inputImage" @upload="handleImageUpload('inputImage', $event)" />
        </UFormField>
      </div>

      <UButton
        type="submit"
        size="xl"
        :loading="props.loading"
        :disabled="props.loading"
        color="secondary"
        variant="solid"
        class="mt-8 w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg"
      >
        Generate Video
      </UButton>
    </UForm>
  </div>
  <div v-else class="w-full animate-pulse">
    <div class="h-32 bg-gray-200 rounded-lg mb-4"></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div class="h-16 bg-gray-200 rounded-lg"></div>
      <div class="h-16 bg-gray-200 rounded-lg"></div>
      <div class="h-16 bg-gray-200 rounded-lg"></div>
    </div>
    <div class="h-12 bg-gray-200 rounded-lg"></div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import ImageUpload from './ImageUpload.vue'
import { VIDEO_MODELS, DEFAULT_MODEL_ID, getModelById } from '~/config/video-models'
import type { VideoModel } from '~/types/generation'

const schema = z.object({
  model: z.string().min(1, 'Please select a video generation model'),
  prompt: z.string().min(10, 'Please provide at least 10 characters describing your ad').max(1000, 'Description must be less than 1000 characters'),
  duration: z.number().min(1).max(180).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  style: z.string().min(1),
  mode: z.enum(['demo', 'production']).optional(),
  firstFrameImage: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  subjectReference: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  inputImage: z.union([z.instanceof(File), z.string()]).optional().nullable(),
})

// Initialize form state consistently for SSR
const getInitialFormState = () => ({
  model: DEFAULT_MODEL_ID,
  prompt: '',
  duration: 30,
  aspectRatio: '16:9' as '16:9' | '9:16' | '1:1',
  style: 'Cinematic',
  mode: 'demo' as 'demo' | 'production',
  firstFrameImage: null as File | string | null,
  subjectReference: null as File | string | null,
  inputImage: null as File | string | null,
})

const form = reactive(getInitialFormState())

const mounted = ref(false)

onMounted(() => {
  mounted.value = true
  // Initialize duration based on default model
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

// Computed duration options based on selected model
const durationOptions = computed(() => {
  if (selectedModel.value?.durationOptions) {
    return selectedModel.value.durationOptions.map((d: number) => ({
      label: `${d}s`,
      value: d,
    }))
  }
  // Default duration options
  return [15, 30, 60].map((d: number) => ({
    label: `${d}s`,
    value: d,
  }))
})

// Computed aspect ratio options based on selected model
const aspectRatioOptions = computed(() => {
  if (selectedModel.value?.aspectRatioOptions) {
    return selectedModel.value.aspectRatioOptions.map((ar: '16:9' | '9:16' | '1:1') => ({
      label: ar,
      value: ar,
    }))
  }
  return (['16:9', '9:16', '1:1'] as const).map((ar: '16:9' | '9:16' | '1:1') => ({
    label: ar,
    value: ar,
  }))
})

const styleOptions = ['Cinematic', 'Minimal', 'Energetic', 'Elegant']
const modeOptions = [
  { label: 'Demo (All scenes shown, first scene generated)', value: 'demo' },
  { label: 'Production (All scenes generated)', value: 'production' },
]

// Computed to show image inputs section
const showImageInputs = computed(() => {
  return selectedModel.value && (
    selectedModel.value.supportsFirstFrame ||
    selectedModel.value.supportsCharacterReference ||
    (selectedModel.value.supportsImageToVideo && !selectedModel.value.supportsFirstFrame && !selectedModel.value.supportsCharacterReference)
  )
})

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: typeof form]
}>()

const handleModelChange = (modelId: string) => {
  const model = getModelById(modelId)
  if (model) {
    // Update duration to model's default if it has one
    if (model.defaultDuration) {
      form.duration = model.defaultDuration
    }
    // Update aspect ratio to first available option if current is not supported
    if (model.aspectRatioOptions && !model.aspectRatioOptions.includes(form.aspectRatio)) {
      form.aspectRatio = model.aspectRatioOptions[0]
    }
    // Clear image inputs that are not supported by the new model
    if (!model.supportsFirstFrame) {
      form.firstFrameImage = null
    }
    if (!model.supportsCharacterReference) {
      form.subjectReference = null
    }
    if (!model.supportsImageToVideo || model.supportsFirstFrame || model.supportsCharacterReference) {
      form.inputImage = null
    }
  }
}

const handleImageUpload = (field: 'firstFrameImage' | 'subjectReference' | 'inputImage', file: File | string | null) => {
  form[field] = file
}

const handleSubmit = async (event: any) => {
  const data = event.data || form
  
  // Manual validation as fallback
  try {
    // Create a dynamic schema based on selected model
    const model = getModelById(data.model)
    let dynamicSchema = schema
    
    // If model doesn't support custom duration, make duration optional
    if (model && !model.supportsCustomDuration) {
      dynamicSchema = schema.extend({
        duration: z.number().optional(),
      })
    }
    
    dynamicSchema.parse(data)
    emit('submit', { ...data })
  } catch (error: any) {
    // If validation fails, the form will show errors automatically
    // But we can also prevent submission
    if (error.errors && error.errors.length > 0) {
      const firstError = error.errors[0]
      const toast = useToast()
      toast.add({
        title: 'Validation Error',
        description: firstError.message || 'Please check your input',
        color: 'error',
      })
    }
    throw error // Re-throw to let UForm handle it
  }
}
</script>

