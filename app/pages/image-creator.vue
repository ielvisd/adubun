<template>
  <div class="py-12">
    <UContainer class="max-w-5xl">
      <div class="mb-8">
        <h1 class="text-4xl font-bold text-gray-900 mb-2">Image Creator</h1>
        <p class="text-gray-600">Generate high-quality images using AI models</p>
      </div>

      <UCard class="p-6">
        <UForm :state="form" @submit="handleSubmit">
          <!-- Model Selection -->
          <UFormField label="Model" name="model" class="mb-6">
            <URadioGroup v-model="selectedModel" :items="modelOptions" />
            <template #description>
              Select the AI model to use for image generation
            </template>
          </UFormField>

          <!-- Prompt -->
          <UFormField label="Prompt" name="prompt" required>
            <UTextarea
              v-model="form.prompt"
              placeholder="a photo of a store front called 'Seedream 4', it sells books, a poster in the window says 'Seedream 4 now on Replicate'"
              :rows="4"
              class="w-full"
            />
            <template #description>
              Text prompt for image generation
            </template>
          </UFormField>

          <!-- Image Input -->
          <UFormField 
            label="Input Images (Optional)" 
            name="image_input"
            class="mt-4"
          >
            <template #description>
              Input image(s) for image-to-image generation. 1-10 images for single or multi-reference generation.
            </template>
            <MultiImageUpload 
              v-model="form.image_input" 
              :max-images="10" 
              @upload="handleImageUpload($event)" 
            />
          </UFormField>

          <!-- Seedream 4.0 specific fields -->
          <template v-if="selectedModel === 'seedream'">
            <!-- Size -->
            <UFormField label="Size" name="size" class="mt-4">
              <USelect
                v-model="form.size"
                :items="sizeOptions"
              />
              <template #description>
                Image resolution: 1K (1024px), 2K (2048px), 4K (4096px), or custom for specific dimensions.
              </template>
            </UFormField>

            <!-- Aspect Ratio (only when size is not custom) -->
            <UFormField 
              v-if="form.size !== 'custom'"
              label="Aspect Ratio" 
              name="aspect_ratio" 
              class="mt-4"
            >
              <USelect
                v-model="form.aspect_ratio"
                :items="aspectRatioOptions"
              />
              <template #description>
                Image aspect ratio. Use 'match_input_image' to automatically match the input image's aspect ratio.
              </template>
            </UFormField>

            <!-- Custom Width and Height (only when size is custom) -->
            <div v-if="form.size === 'custom'" class="grid grid-cols-2 gap-4 mt-4">
              <UFormField label="Width" name="width">
                <UInput
                  v-model.number="form.width"
                  type="number"
                  :min="1024"
                  :max="4096"
                />
                <template #description>
                  Custom image width (1024-4096 pixels)
                </template>
              </UFormField>
              <UFormField label="Height" name="height">
                <UInput
                  v-model.number="form.height"
                  type="number"
                  :min="1024"
                  :max="4096"
                />
                <template #description>
                  Custom image height (1024-4096 pixels)
                </template>
              </UFormField>
            </div>

            <!-- Max Images -->
            <UFormField 
              label="Max Images" 
              name="max_images" 
              class="mt-4"
            >
              <UInput
                v-model.number="form.max_images"
                type="number"
                :min="1"
                :max="15"
              />
              <template #description>
                Maximum number of images to generate (1-15). Set Sequential Image Generation to 'auto' to generate multiple images.
              </template>
            </UFormField>

            <!-- Sequential Image Generation -->
            <UFormField 
              label="Sequential Image Generation" 
              name="sequential_image_generation" 
              class="mt-4"
            >
              <USelect
                v-model="form.sequential_image_generation"
                :items="sequentialOptions"
              />
              <template #description>
                <span v-if="form.sequential_image_generation === 'disabled'">
                  <strong>Disabled:</strong> Generates a single image. Set to 'auto' to generate multiple images (up to Max Images).
                </span>
                <span v-else>
                  <strong>Auto:</strong> The model will generate multiple related images (up to Max Images). This enables multi-image generation.
                </span>
              </template>
            </UFormField>

            <!-- Enhance Prompt -->
            <UFormField label="Enhance Prompt" name="enhance_prompt" class="mt-4">
              <USwitch v-model="form.enhance_prompt" />
              <template #description>
                Enable prompt enhancement for higher quality results (takes longer to generate).
              </template>
            </UFormField>
          </template>

          <!-- Nano Banana specific fields -->
          <template v-if="selectedModel === 'nano-banana'">
            <!-- Aspect Ratio -->
            <UFormField 
              label="Aspect Ratio" 
              name="aspect_ratio" 
              class="mt-4"
            >
              <USelect
                v-model="form.aspect_ratio"
                :items="aspectRatioOptions"
              />
              <template #description>
                Image aspect ratio. Use 'match_input_image' to automatically match the input image's aspect ratio.
              </template>
            </UFormField>

            <!-- Output Format -->
            <UFormField label="Output Format" name="output_format" class="mt-4">
              <USelect
                v-model="form.output_format"
                :items="outputFormatOptions"
              />
              <template #description>
                Format of the output image
              </template>
            </UFormField>
          </template>

          <!-- Submit Button -->
          <div class="mt-6">
            <UButton
              type="submit"
              size="xl"
              color="secondary"
              variant="solid"
              class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg"
              :disabled="isGenerating || !form.prompt"
            >
              <UIcon v-if="isGenerating" name="i-heroicons-arrow-path" class="w-5 h-5 mr-2 animate-spin" />
              {{ isGenerating ? 'Generating...' : 'Generate Images' }}
            </UButton>
          </div>
        </UForm>
      </UCard>

      <!-- Loading State -->
      <UCard v-if="isGenerating || predictionId" class="mt-6 p-6">
        <div v-if="isGenerating && !predictionId" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-12 h-12 text-secondary-500 animate-spin mx-auto mb-4" />
          <p class="text-gray-600">Starting image generation...</p>
        </div>
        <div v-else-if="predictionId" class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-700">Status: {{ predictionStatus }}</p>
              <p class="text-xs text-gray-500 mt-1">Prediction ID: {{ predictionId }}</p>
            </div>
            <UIcon 
              v-if="predictionStatus === 'starting' || predictionStatus === 'processing'"
              name="i-heroicons-arrow-path" 
              class="w-6 h-6 text-secondary-500 animate-spin" 
            />
          </div>
          <div v-if="predictionStatus === 'succeeded' && generatedImages.length > 0" class="mt-6">
            <h3 class="text-lg font-semibold mb-4">Generated Images ({{ generatedImages.length }})</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="(imageUrl, index) in generatedImages"
                :key="index"
                class="relative group border-2 border-gray-200 rounded-lg overflow-hidden hover:border-secondary-500 transition-colors bg-white"
              >
                <!-- Loading state -->
                <div v-if="(!imageLoaded || !imageLoaded[index]) && (!imageErrors || !imageErrors[index])" class="absolute inset-0 flex items-center justify-center min-h-[200px] bg-gray-50 z-10">
                  <div class="text-center">
                    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p class="text-sm text-gray-500">Loading image...</p>
                  </div>
                </div>
                
                <!-- Error state -->
                <div v-if="imageErrors && imageErrors[index]" class="absolute inset-0 p-4 text-center text-red-600 min-h-[200px] flex flex-col items-center justify-center bg-white z-10">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500 mb-2" />
                  <p class="text-sm font-medium">Failed to load image</p>
                  <p class="text-xs text-gray-500 mt-1 break-all px-2">{{ imageErrors[index] }}</p>
                  <UButton
                    variant="outline"
                    size="sm"
                    color="red"
                    class="mt-3"
                    @click="retryImageLoad(imageUrl, index)"
                  >
                    Retry Loading
                  </UButton>
                  <UButton
                    variant="outline"
                    size="sm"
                    class="mt-2"
                    @click="window.open(imageUrl, '_blank')"
                  >
                    Open in New Tab
                  </UButton>
                </div>
                
                <!-- Image -->
                <img
                  v-if="!imageErrors || !imageErrors[index]"
                  :src="imageUrl"
                  :alt="`Generated image ${index + 1}`"
                  class="w-full h-auto object-contain block relative z-0"
                  :class="{ 'opacity-0 invisible': !imageLoaded || !imageLoaded[index], 'opacity-100 visible': imageLoaded && imageLoaded[index] }"
                  @error="handleImageError($event, index)"
                  @load="handleImageLoad($event, index)"
                />
                
                <!-- Hover overlay with download button -->
                <div v-if="imageLoaded && imageLoaded[index] && (!imageErrors || !imageErrors[index])" class="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:pointer-events-auto z-10">
                  <div class="absolute inset-0 bg-black opacity-0 group-hover:opacity-50 transition-opacity"></div>
                  <UButton
                    variant="solid"
                    color="secondary"
                    size="sm"
                    class="relative opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-10"
                    @click="downloadImage(imageUrl, index)"
                  >
                    Download
                  </UButton>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="predictionStatus === 'failed'" class="text-center py-4">
            <p class="text-red-600">Image generation failed. Please try again.</p>
            <UButton
              variant="outline"
              color="red"
              class="mt-4"
              @click="resetForm"
            >
              Try Again
            </UButton>
          </div>
        </div>
      </UCard>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import MultiImageUpload from '~/components/ui/MultiImageUpload.vue'

const toast = useToast()

// Model selection
const selectedModel = ref<'seedream' | 'nano-banana'>('seedream')

// Form state
const form = ref({
  prompt: '',
  image_input: [] as (File | string | null)[],
  size: '2K' as '1K' | '2K' | '4K' | 'custom',
  aspect_ratio: 'match_input_image',
  width: 2048,
  height: 2048,
  sequential_image_generation: 'disabled' as 'disabled' | 'auto',
  max_images: 1,
  enhance_prompt: true,
  output_format: 'jpg' as 'jpg' | 'png',
})

// Generation state
const isGenerating = ref(false)
const predictionId = ref<string | null>(null)
const predictionStatus = ref<string>('')
const generatedImages = ref<string[]>([])
const imageErrors = ref<Record<number, string>>({})
const imageLoaded = ref<Record<number, boolean>>({})

// Options
const sizeOptions = [
  { label: '1K (1024px)', value: '1K' },
  { label: '2K (2048px)', value: '2K' },
  { label: '4K (4096px)', value: '4K' },
  { label: 'Custom', value: 'custom' },
]

const aspectRatioOptions = [
  { label: 'Match Input Image', value: 'match_input_image' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
]

const sequentialOptions = [
  { label: 'Disabled', value: 'disabled' },
  { label: 'Auto', value: 'auto' },
]

const modelOptions = [
  { label: 'Seedream 4.0', value: 'seedream' },
  { label: 'Nano Banana', value: 'nano-banana' },
]

const outputFormatOptions = [
  { label: 'JPG', value: 'jpg' },
  { label: 'PNG', value: 'png' },
]

// Handle image upload
const handleImageUpload = (files: (File | string | null)[]) => {
  form.value.image_input = files.filter(f => f !== null)
}

// Poll for prediction status
const pollPredictionStatus = async (predId: string) => {
  const maxAttempts = 120 // 4 minutes max (120 * 2 seconds)
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      const statusResult = await $fetch('/api/check-prediction-status', {
        method: 'POST',
        body: { predictionId: predId },
      })

      predictionStatus.value = statusResult.status

      if (statusResult.status === 'succeeded') {
        // Handle array of images or single image from output
        let imageUrls: string[] = []
        if (Array.isArray(statusResult.output)) {
          imageUrls = statusResult.output.filter((url: any) => url && typeof url === 'string')
        } else if (statusResult.output && typeof statusResult.output === 'string') {
          imageUrls = [statusResult.output]
        } else {
          throw new Error('No images in result')
        }
        
        console.log(`[Image Creator] Received ${imageUrls.length} image URL(s):`, imageUrls)
        generatedImages.value = imageUrls
        // Clear any previous errors and loading states
        imageErrors.value = {}
        imageLoaded.value = {}

        isGenerating.value = false
        toast.add({
          title: 'Success',
          description: `Generated ${generatedImages.value.length} image(s)`,
          color: 'green',
        })
        return
      } else if (statusResult.status === 'failed' || statusResult.status === 'canceled') {
        isGenerating.value = false
        toast.add({
          title: 'Generation Failed',
          description: statusResult.error || 'Image generation failed',
          color: 'red',
        })
        return
      }

      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    } catch (error: any) {
      console.error('Error polling prediction status:', error)
      // Continue polling on errors
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }
  }

  // Timeout
  isGenerating.value = false
  toast.add({
    title: 'Timeout',
    description: 'Image generation timed out. Please check the prediction status manually.',
    color: 'yellow',
  })
}

// Handle form submission
const handleSubmit = async () => {
  if (!form.value.prompt) {
    toast.add({
      title: 'Error',
      description: 'Please enter a prompt',
      color: 'red',
    })
    return
  }

  isGenerating.value = true
  predictionId.value = null
  predictionStatus.value = ''
  generatedImages.value = []

  try {
    // Create FormData for file uploads
    const formDataToSend = new FormData()

    // Add prompt
    formDataToSend.append('prompt', form.value.prompt)

    // Add image inputs if any
    if (form.value.image_input && form.value.image_input.length > 0) {
      form.value.image_input.forEach((img) => {
        if (img instanceof File) {
          formDataToSend.append('image_input', img)
        } else if (img) {
          formDataToSend.append('image_input', img)
        }
      })
    }

    // Add model
    formDataToSend.append('model', selectedModel.value === 'seedream' ? 'bytedance/seedream-4' : 'google/nano-banana')

    // Add model-specific parameters
    if (selectedModel.value === 'seedream') {
      formDataToSend.append('size', form.value.size)
      if (form.value.size !== 'custom') {
        formDataToSend.append('aspect_ratio', form.value.aspect_ratio)
      }
      if (form.value.size === 'custom') {
        formDataToSend.append('width', form.value.width.toString())
        formDataToSend.append('height', form.value.height.toString())
      }
      formDataToSend.append('sequential_image_generation', form.value.sequential_image_generation)
      if (form.value.sequential_image_generation === 'auto') {
        formDataToSend.append('max_images', form.value.max_images.toString())
      }
      formDataToSend.append('enhance_prompt', form.value.enhance_prompt.toString())
    } else if (selectedModel.value === 'nano-banana') {
      formDataToSend.append('aspect_ratio', form.value.aspect_ratio)
      formDataToSend.append('output_format', form.value.output_format)
    }

    // Call API
    const result = await $fetch('/api/generate-image', {
      method: 'POST',
      body: formDataToSend,
    })

    predictionId.value = result.predictionId
    predictionStatus.value = result.status || 'starting'

    // Start polling
    if (predictionId.value) {
      pollPredictionStatus(predictionId.value)
    }
  } catch (error: any) {
    console.error('Error generating image:', error)
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      statusCode: error.statusCode,
      data: error.data,
    })
    isGenerating.value = false
    
    // Extract error message from response if available
    let errorMessage = error.message || 'Failed to generate image'
    if (error.data?.message) {
      errorMessage = error.data.message
    } else if (error.data?.originalError) {
      errorMessage = error.data.originalError
    }
    
    toast.add({
      title: 'Error',
      description: errorMessage,
      color: 'red',
    })
  }
}

// Download image
const downloadImage = (url: string, index: number) => {
  const link = document.createElement('a')
  link.href = url
  const extension = selectedModel.value === 'nano-banana' ? form.value.output_format : 'png'
  link.download = `${selectedModel.value}-image-${index + 1}.${extension}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Reset form
const resetForm = () => {
  predictionId.value = null
  predictionStatus.value = ''
  generatedImages.value = []
  isGenerating.value = false
}

// Handle image load errors
const handleImageError = (event: Event, index: number) => {
  const img = event.target as HTMLImageElement
  const imageUrl = generatedImages.value[index]
  console.error(`[Image Creator] Failed to load image ${index + 1}:`, {
    url: imageUrl,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
    error: img.error,
  })
  
  // Store error for this image
  imageErrors.value[index] = `Failed to load image. URL: ${imageUrl?.substring(0, 100)}...`
  
  // Don't hide the image, show error message instead
  toast.add({
    title: 'Image Load Error',
    description: `Failed to load image ${index + 1}. Check console for details.`,
    color: 'red',
  })
}

// Handle image load success
const handleImageLoad = (event: Event, index: number) => {
  const img = event.target as HTMLImageElement
  console.log(`[Image Creator] Successfully loaded image ${index + 1}:`, {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    src: img.src.substring(0, 100),
  })
  // Mark image as loaded
  imageLoaded.value[index] = true
  // Clear any previous error for this image
  delete imageErrors.value[index]
}

// Retry loading an image
const retryImageLoad = (imageUrl: string, index: number) => {
  console.log(`[Image Creator] Retrying image load for index ${index}:`, imageUrl)
  delete imageErrors.value[index]
  imageLoaded.value[index] = false
  // Force image reload by updating the src
  const img = document.querySelector(`img[alt="Generated image ${index + 1}"]`) as HTMLImageElement
  if (img) {
    img.src = ''
    setTimeout(() => {
      img.src = imageUrl + '?t=' + Date.now() // Add cache busting
    }, 100)
  }
}
</script>

