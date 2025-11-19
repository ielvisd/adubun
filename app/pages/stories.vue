<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 sm:py-12">
    <!-- Loading Overlay - Shows immediately when navigating to storyboards -->
    <div v-if="isNavigating" class="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center">
      <UCard class="bg-white dark:bg-gray-800 p-8 max-w-md mx-4">
        <div class="flex flex-col items-center justify-center text-center">
          <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
          <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Preparing Storyboard</h2>
          <p class="text-gray-600 dark:text-gray-400">Loading your selected story...</p>
        </div>
      </UCard>
    </div>

    <UContainer class="max-w-6xl px-4 sm:px-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-24">
        <UIcon name="i-heroicons-arrow-path" class="w-16 h-16 text-secondary-500 animate-spin mb-4" />
        <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Generating Your Story</h2>
        <p class="text-gray-600 dark:text-gray-400 text-center">We're creating your story and preview image...</p>
        <p class="text-gray-500 dark:text-gray-500 text-sm text-center mt-2">This takes about 50-70 seconds</p>
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
          <div class="flex gap-2">
            <UButton
              v-if="isRetryable"
              color="red"
              @click="generateStories"
              :loading="loading"
            >
              {{ loading ? 'Retrying...' : 'Retry' }}
            </UButton>
            <UButton
              variant="ghost"
              color="red"
              @click="$router.push('/')"
            >
              Go Back
            </UButton>
          </div>
        </template>
      </UAlert>

      <!-- Stories Selection -->
      <div v-else-if="stories.length > 0" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Choose Your Story
          </h1>
          <p class="text-gray-600 dark:text-gray-400 text-sm sm:text-base md:text-lg mb-6">
            Review your story option below. Don't like it? Generate another one until you find the perfect fit.
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

        <div ref="storiesContainer" class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto">
          <UCard
            v-for="(story, index) in stories"
            :key="story.id"
            :class="[
              'story-card cursor-pointer transition-all duration-300 ease-in-out',
              selectedStoryId === story.id
                ? 'selected ring-2 ring-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 border-secondary-500'
                : 'bg-white dark:bg-gray-800 border-transparent hover:border-secondary-500'
            ]"
            @click="selectStory(story)"
            role="button"
            tabindex="0"
            @keydown.enter="selectStory(story)"
            @keydown.space.prevent="selectStory(story)"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-1 flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      v-if="story.emoji"
                      class="text-2xl leading-none"
                      role="img"
                      :aria-label="`Emoji representing ${story.title || 'story'}`"
                    >
                      {{ story.emoji }}
                    </span>
                    <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                      {{ story.title || `Story ${index + 1}` }}
                    </h3>
                  </div>
                </div>
                <div
                  v-if="selectedStoryId === story.id"
                  class="w-6 h-6 rounded-full bg-secondary-500 flex items-center justify-center flex-shrink-0"
                >
                  <UIcon name="i-heroicons-check" class="w-4 h-4 text-white" />
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <!-- Preview Image -->
              <div v-if="story.previewImageUrl" class="w-full h-48 sm:h-56 rounded-lg overflow-hidden">
                <img 
                  :src="story.previewImageUrl" 
                  :alt="`Preview for ${story.title || 'story'}`"
                  class="w-full h-full object-cover"
                />
              </div>
              
              <!-- Loading Skeleton for Preview (if not available) -->
              <div v-else class="w-full h-48 sm:h-56 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center">
                <div class="text-center">
                  <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 dark:text-gray-500 mb-2 mx-auto" />
                  <p class="text-xs text-gray-500 dark:text-gray-400">Generating preview...</p>
                </div>
              </div>

              <p class="text-gray-700 dark:text-gray-300 leading-relaxed text-sm sm:text-base">
                {{ story.description }}
              </p>

              <!-- Collapsed View - Only Hook -->
              <div v-if="!expandedStories.has(index)" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                <div class="text-xs sm:text-sm">
                  <span class="font-semibold text-gray-900 dark:text-white">Hook:</span>
                  <span class="text-gray-600 dark:text-gray-400 ml-2">{{ story.hook }}</span>
                </div>
                
                <UButton
                  variant="ghost"
                  color="secondary"
                  size="xs"
                  @click.stop="toggleStoryExpansion(index)"
                  class="mt-2"
                >
                  Read More
                  <UIcon name="i-heroicons-chevron-down" class="ml-1" />
                </UButton>
              </div>

              <!-- Expanded View - All Details -->
              <div v-else class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
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
                
                <UButton
                  variant="ghost"
                  color="secondary"
                  size="xs"
                  @click.stop="toggleStoryExpansion(index)"
                  class="mt-2"
                >
                  Show Less
                  <UIcon name="i-heroicons-chevron-up" class="ml-1" />
                </UButton>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Generate Another Story Button -->
        <div class="flex justify-center pt-6">
          <UButton
            v-if="stories.length < maxStories"
            variant="outline"
            color="secondary"
            size="lg"
            :loading="isGeneratingMore"
            :disabled="isGeneratingMore"
            @click="generateMoreStories"
            class="min-w-[250px] min-h-[44px]"
          >
            <UIcon v-if="!isGeneratingMore" name="i-heroicons-plus-circle" class="mr-2" />
            <span v-if="!isGeneratingMore">Generate Another Story</span>
            <span v-else>Generating...</span>
          </UButton>
          <div v-else class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Maximum {{ maxStories }} stories generated. Please select one to continue.
            </p>
          </div>
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
            @click="proceedToStoryboards"
            class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold min-w-[200px] min-h-[44px]"
          >
            Continue with Selected Story
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
const isRetryable = ref(false)
const stories = ref<Story[]>([])
const selectedStoryId = ref<string | null>(null)
const promptData = ref<any>(null)
const isNavigating = ref(false)
const isProductionMode = ref(true) // Default to production mode
const expandedStories = ref<Set<number>>(new Set())
const isGeneratingMore = ref(false)
const maxStories = 5 // Maximum number of stories to generate
const storiesContainer = ref<HTMLElement | null>(null)

const toggleStoryExpansion = (index: number) => {
  if (expandedStories.value.has(index)) {
    expandedStories.value.delete(index)
  } else {
    expandedStories.value.add(index)
  }
  // Force reactivity
  expandedStories.value = new Set(expandedStories.value)
}

const generateMoreStories = async () => {
  if (stories.value.length >= maxStories) {
    toast.add({
      title: 'Maximum Stories Reached',
      description: `You can generate up to ${maxStories} stories. Please select one to continue.`,
      color: 'yellow',
    })
    return
  }

  isGeneratingMore.value = true
  error.value = null

  try {
    const result = await $fetch('/api/generate-stories', {
      method: 'POST',
      body: {
        prompt: promptData.value.prompt,
        productImages: promptData.value.productImages || [],
        personReference: promptData.value.personReference,
        aspectRatio: promptData.value.aspectRatio,
        mood: promptData.value.mood,
        adType: promptData.value.adType,
        model: promptData.value.model,
        generateVoiceover: promptData.value.generateVoiceover,
      },
    })

    // Handle response - MCP returns content array
    let storiesData = result
    if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
      storiesData = JSON.parse(result.content[0].text)
    }

    const newStories = storiesData.stories || result.stories || []
    const previousLength = stories.value.length
    stories.value.push(...newStories)

    // Auto-scroll to the new story
    await nextTick()
    // Scroll to the stories container to show the new story
    if (storiesContainer.value) {
      const cards = storiesContainer.value.querySelectorAll('.story-card')
      const newCard = cards[previousLength] as HTMLElement
      if (newCard) {
        newCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Briefly highlight the new card
        newCard.classList.add('ring-2', 'ring-green-500')
        setTimeout(() => {
          newCard.classList.remove('ring-2', 'ring-green-500')
        }, 2000)
      }
    }

    toast.add({
      title: 'New Story Generated',
      description: 'A new story option has been added!',
      color: 'green',
    })
  } catch (err: any) {
    console.error('Error generating more stories:', err)
    error.value = err.data?.message || err.message || 'Failed to generate more stories'
    toast.add({
      title: 'Generation Failed',
      description: error.value,
      color: 'red',
    })
  } finally {
    isGeneratingMore.value = false
  }
}

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
  isRetryable.value = false

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
        personReference: promptData.value.personReference,
        aspectRatio: promptData.value.aspectRatio,
        mood: promptData.value.mood,
        adType: promptData.value.adType,
        model: promptData.value.model || 'google/veo-3.1',
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
          personReference: promptData.value.personReference,
          aspectRatio: promptData.value.aspectRatio,
          mood: promptData.value.mood,
          adType: promptData.value.adType,
          model: promptData.value.model || 'google/veo-3.1',
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
    
    // Extract error message and retryable flag from response
    const errorData = err.data || {}
    error.value = errorData.message || err.data?.message || err.message || 'Failed to generate stories'
    isRetryable.value = errorData.retryable !== false // Default to true if not explicitly false
    
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
      // Clear all old storyboard state from localStorage
      Object.keys(localStorage)
        .filter(key => key.startsWith('storyboard-state-'))
        .forEach(key => localStorage.removeItem(key))
      
      // Clear old storyboard-related sessionStorage
      sessionStorage.removeItem('selectedStory')
      sessionStorage.removeItem('promptData')
      sessionStorage.removeItem('generationMode')
      sessionStorage.removeItem('editorClips')
      sessionStorage.removeItem('editorComposedVideo')
      
      // Now set the NEW story data
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

<style scoped>
.story-card {
  border: 2px solid transparent;
}

.story-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.story-card.selected {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.story-card.selected:hover {
  transform: translateY(-2px);
}
</style>
