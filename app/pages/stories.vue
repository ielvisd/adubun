<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <UContainer class="max-w-6xl px-4 sm:px-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Generating Stories</h2>
        <p class="text-gray-600 dark:text-gray-400 text-center">We're creating 3 unique story options for your ad...</p>
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
            @click="$router.push('/')"
          >
            Go Back
          </UButton>
        </template>
      </UAlert>

      <!-- Stories Selection -->
      <div v-else-if="stories.length > 0" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Choose Your Story
          </h1>
          <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base md:text-lg mb-6">
            Select one of the three story options below. Each tells your ad's story in a unique way.
          </p>
          
          <!-- Mode Selection - Mendo Style -->
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <div class="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-none px-4 py-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Demo</span>
              <USwitch
                v-model="isProductionMode"
                @update:model-value="handleModeChange"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Production</span>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <p v-if="!isProductionMode" class="font-medium">
                Demo Mode: Only the first scene will be generated for faster testing
              </p>
              <p v-else class="font-medium">
                Production Mode: All scenes will be generated
              </p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <UCard
            v-for="(story, index) in stories"
            :key="story.id"
            :class="[
              'cursor-pointer transition-all duration-200 hover:shadow-lg',
              selectedStoryId === story.id
                ? 'ring-2 ring-secondary-500 bg-secondary-50 dark:bg-gray-800'
                : 'bg-white dark:bg-gray-800'
            ]"
            @click="selectStory(story)"
            role="button"
            tabindex="0"
            @keydown.enter="selectStory(story)"
            @keydown.space.prevent="selectStory(story)"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <UBadge color="secondary" variant="soft" size="lg">
                  Story {{ index + 1 }}
                </UBadge>
                <div
                  v-if="selectedStoryId === story.id"
                  class="w-6 h-6 rounded-full bg-secondary-500 flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-check" class="w-4 h-4 text-white" />
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <p class="text-gray-700 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
                {{ story.description }}
              </p>

              <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                <div class="text-xs sm:text-sm">
                  <span class="font-semibold text-gray-900 dark:text-white">Hook:</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ story.hook }}</span>
                </div>
                <div class="text-xs sm:text-sm">
                  <span class="font-semibold text-gray-900 dark:text-white">Body 1:</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ story.bodyOne }}</span>
                </div>
                <div class="text-xs sm:text-sm">
                  <span class="font-semibold text-gray-900 dark:text-white">Body 2:</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ story.bodyTwo }}</span>
                </div>
                <div class="text-xs sm:text-sm">
                  <span class="font-semibold text-gray-900 dark:text-white">CTA:</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ story.callToAction }}</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center pt-6">
          <UButton
            variant="ghost"
            color="gray"
            @click="$router.push('/')"
            class="min-h-[44px]"
          >
            Back
          </UButton>
          <UButton
            color="secondary"
            variant="solid"
            :disabled="!selectedStoryId || isNavigating"
            :loading="isNavigating"
            @click="proceedToStoryboards"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-w-[200px] min-h-[44px]"
          >
            <span v-if="!isNavigating">Continue with Selected Story</span>
            <span v-else>Loading...</span>
          </UButton>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import type { Story } from '~/types/generation'

definePageMeta({
  middleware: 'auth', // Require authentication
})

const router = useRouter()
const toast = useToast()

const loading = ref(true)
const error = ref<string | null>(null)
const stories = ref<Story[]>([])
const selectedStoryId = ref<string | null>(null)
const promptData = ref<any>(null)
const isNavigating = ref(false)
const isProductionMode = ref(false) // Default to demo mode for faster testing

onMounted(async () => {
  // Load mode from sessionStorage first
  if (process.client) {
    const storedMode = sessionStorage.getItem('generationMode')
    if (storedMode) {
      isProductionMode.value = storedMode === 'production'
    }
    
    // Get prompt data from sessionStorage
    const storedData = sessionStorage.getItem('promptData')
    if (!storedData) {
      error.value = 'No prompt data found. Please start from the home page.'
      loading.value = false
      return
    }

    try {
      promptData.value = JSON.parse(storedData)
      await generateStories()
    } catch (err: any) {
      error.value = err.message || 'Failed to load prompt data'
      loading.value = false
    }
  }
})

const generateStories = async () => {
  loading.value = true
  error.value = null

  try {
    // Prepare form data for API
    const formDataToSend = new FormData()
    formDataToSend.append('prompt', promptData.value.prompt)
    formDataToSend.append('aspectRatio', promptData.value.aspectRatio)
    formDataToSend.append('model', promptData.value.model || 'kwaivgi/kling-v2.5-turbo-pro')
    if (promptData.value.generateVoiceover !== undefined) {
      formDataToSend.append('generateVoiceover', promptData.value.generateVoiceover.toString())
    }

    // Add product images if they are File objects (they should be URLs by now)
    if (promptData.value.productImages && Array.isArray(promptData.value.productImages)) {
      // If images are already URLs, we need to handle them differently
      // For now, assume they're URLs and send as JSON
      const body: any = {
        prompt: promptData.value.prompt,
        productImages: promptData.value.productImages,
        aspectRatio: promptData.value.aspectRatio,
        model: promptData.value.model || 'google/veo-3-fast',
        generateVoiceover: promptData.value.generateVoiceover || false,
      }

      const result = await $fetch('/api/generate-stories', {
        method: 'POST',
        body,
      })

      // Handle response - MCP returns content array
      let storiesData = result
      if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
        storiesData = JSON.parse(result.content[0].text)
      }

      stories.value = storiesData.stories || result.stories || []
      // Update promptData with the returned data (includes uploaded image URLs)
      promptData.value = storiesData.promptData || result.promptData || promptData.value
    } else {
      // No images, send as JSON
      const result = await $fetch('/api/generate-stories', {
        method: 'POST',
        body: {
          prompt: promptData.value.prompt,
          productImages: [],
          aspectRatio: promptData.value.aspectRatio,
          model: promptData.value.model || 'google/veo-3-fast',
          generateVoiceover: promptData.value.generateVoiceover || false,
        },
      })

      // Handle response - MCP returns content array
      let storiesData = result
      if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
        storiesData = JSON.parse(result.content[0].text)
      }

      stories.value = storiesData.stories || result.stories || []
      promptData.value = storiesData.promptData || result.promptData || promptData.value
    }

    loading.value = false
  } catch (err: any) {
    console.error('Error generating stories:', err)
    error.value = err.data?.message || err.message || 'Failed to generate stories'
    loading.value = false
  }
}

const selectStory = (story: Story) => {
  selectedStoryId.value = story.id
}

const proceedToStoryboards = async () => {
  if (!selectedStoryId.value) {
    toast.add({
      title: 'Please Select a Story',
      description: 'You must select one of the story options to continue',
      color: 'yellow',
    })
    return
  }

  const selectedStory = stories.value.find(s => s.id === selectedStoryId.value)
  if (!selectedStory) {
    return
  }

  isNavigating.value = true

  try {
    // Generate additional product images if needed (after story selection)
    const currentImageCount = promptData.value.productImages?.length || 0
    if (currentImageCount < 10) {
      try {
        const generatingToast = toast.add({
          title: 'Generating Product Images',
          description: `Generating ${10 - currentImageCount} additional product images...`,
          color: 'blue',
          timeout: 0, // Don't auto-dismiss
        })

        const imageResult = await $fetch('/api/generate-product-images', {
          method: 'POST',
          body: {
            prompt: promptData.value.prompt,
            existingImages: promptData.value.productImages || [],
            targetCount: 10,
          },
        })

        // Update promptData with new images
        promptData.value.productImages = imageResult.images || promptData.value.productImages

        toast.remove(generatingToast.id)
        toast.add({
          title: 'Images Generated',
          description: `Generated ${imageResult.generated?.length || 0} additional product images`,
          color: 'green',
        })
      } catch (err: any) {
        console.error('Error generating product images:', err)
        // Continue even if image generation fails
        toast.add({
          title: 'Image Generation Warning',
          description: 'Could not generate additional images. Continuing with existing images.',
          color: 'yellow',
        })
      }
    }

    // Store selected story and prompt data for storyboard generation
    if (process.client) {
      sessionStorage.setItem('selectedStory', JSON.stringify(selectedStory))
      sessionStorage.setItem('promptData', JSON.stringify(promptData.value))
      // Store mode selection
      sessionStorage.setItem('generationMode', isProductionMode.value ? 'production' : 'demo')
    }

    // Navigate to storyboards page immediately (it will show loading overlay)
    await router.push('/storyboards')
  } catch (err: any) {
    console.error('Error navigating to storyboards:', err)
    toast.add({
      title: 'Navigation Error',
      description: 'Failed to navigate to storyboard page',
      color: 'red',
    })
    isNavigating.value = false
  }
}

const handleModeChange = (value: boolean) => {
  isProductionMode.value = value
  // Store mode immediately when changed
  if (process.client) {
    sessionStorage.setItem('generationMode', value ? 'production' : 'demo')
  }
}
</script>

