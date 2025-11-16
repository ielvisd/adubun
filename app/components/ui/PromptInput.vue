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

      <!-- Product Images Upload -->
      <div class="w-full mt-4">
        <UFormField name="productImages" required>
          <ProductImageUpload v-model="form.productImages" />
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
      <div v-if="showImageInputs" class="space-y-4 mt-4">
        <!-- For Veo 3.1: image (first frame) -->
        <UFormField 
          v-if="isVeo31"
          label="Input Image (Optional)" 
          name="image"
          description="Input image to start generating from. Ideal images are 16:9 or 9:16 and 1280x720 or 720x1280, depending on the aspect ratio you choose."
        >
          <ImageUpload v-model="form.image" @upload="handleImageUpload('image', $event)" />
        </UFormField>

        <!-- For Veo 3.1: last_frame -->
        <UFormField 
          v-if="isVeo31"
          label="Last Frame Image (Optional)" 
          name="lastFrame"
          description="Ending image for interpolation. When provided with an input image, creates a transition between the two images."
        >
          <ImageUpload v-model="form.lastFrame" @upload="handleImageUpload('lastFrame', $event)" />
        </UFormField>

        <!-- For Veo 3.1: reference_images (1-3 images) -->
        <UFormField 
          v-if="isVeo31"
          label="Reference Images (Optional)" 
          name="referenceImages"
          description="1 to 3 reference images for subject-consistent generation (reference-to-video, or R2V). Reference images only work with 16:9 aspect ratio and 8-second duration. Last frame is ignored if reference images are provided."
        >
          <MultiImageUpload v-model="form.referenceImages" :max-images="3" @upload="handleMultiImageUpload($event)" />
        </UFormField>

        <!-- For Kling: image input -->
        <UFormField 
          v-if="isKling"
          label="Input Image (Optional)" 
          name="firstFrameImage"
          description="Input image for image-to-video generation. The output video will start from this image."
        >
          <ImageUpload v-model="form.firstFrameImage" @upload="handleImageUpload('firstFrameImage', $event)" />
        </UFormField>

        <!-- For other models (Hailuo doesn't support images) -->
        <div v-if="!isVeo31 && !isKling" class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      </div>

      <!-- Additional Veo 3.1 fields -->
      <div v-if="isVeo31" class="space-y-4 mt-4">
        <UFormField label="Negative Prompt (Optional)" name="negativePrompt">
          <UTextarea
            v-model="form.negativePrompt"
            placeholder="Description of what to exclude from the generated video"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Resolution" name="resolution">
            <USelect
              v-model="form.resolution"
              :items="resolutionOptions"
            />
          </UFormField>

          <UFormField label="Generate Audio" name="generateAudio">
            <UCheckbox v-model="form.generateAudio" label="Generate audio with the video" />
          </UFormField>
        </div>

        <UFormField label="Seed (Optional)" name="seed">
          <UInput
            v-model.number="form.seed"
            type="number"
            placeholder="Random seed. Omit for random generations"
          />
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
import MultiImageUpload from './MultiImageUpload.vue'
import ProductImageUpload from './ProductImageUpload.vue'
import { VIDEO_MODELS, DEFAULT_MODEL_ID, getModelById } from '~/config/video-models'
import type { VideoModel } from '~/types/generation'

const schema = z.object({
  model: z.string().min(1, 'Please select a video generation model'),
  prompt: z.string().min(10, 'Please provide at least 10 characters describing your ad').max(1000, 'Description must be less than 1000 characters'),
  productImages: z.array(z.union([z.instanceof(File), z.string()])).min(1, 'At least 1 product image is required').max(10, 'Maximum 10 product images allowed'),
  duration: z.number().min(1).max(180).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  style: z.string().min(1),
  mode: z.enum(['demo', 'production']).optional(),
  // Veo 3.1 fields
  image: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  lastFrame: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  referenceImages: z.array(z.union([z.instanceof(File), z.string()])).max(3).optional(),
  negativePrompt: z.string().optional(),
  resolution: z.string().optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional().nullable(),
  // Kling and other model fields
  firstFrameImage: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  subjectReference: z.union([z.instanceof(File), z.string()]).optional().nullable(),
  inputImage: z.union([z.instanceof(File), z.string()]).optional().nullable(),
})

// Initialize form state consistently for SSR
const getInitialFormState = () => ({
  model: DEFAULT_MODEL_ID,
  prompt: '',
  productImages: [] as (File | string)[],
  duration: 30,
  aspectRatio: '16:9' as '16:9' | '9:16' | '1:1',
  style: 'Cinematic',
  mode: 'demo' as 'demo' | 'production',
  // Veo 3.1 fields
  image: null as File | string | null,
  lastFrame: null as File | string | null,
  referenceImages: [] as (File | string)[],
  negativePrompt: '',
  resolution: '1080p',
  generateAudio: true,
  seed: null as number | null,
  // Kling and other model fields
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

const resolutionOptions = [
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
]

// Check if current model is Veo 3.1
const isVeo31 = computed(() => form.model === 'google/veo-3.1')

// Check if current model is Kling
const isKling = computed(() => form.model === 'kwaivgi/kling-v2.5-turbo-pro')

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
    if (model.id !== 'google/veo-3.1') {
      form.image = null
      form.lastFrame = null
      form.referenceImages = []
    }
    if (model.id !== 'kwaivgi/kling-v2.5-turbo-pro' && !model.supportsFirstFrame) {
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

const handleImageUpload = (field: 'firstFrameImage' | 'subjectReference' | 'inputImage' | 'image' | 'lastFrame', file: File | string | null) => {
  form[field] = file
}

const handleMultiImageUpload = (files: (File | string | null)[]) => {
  form.referenceImages = files.filter(f => f !== null) as (File | string)[]
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

