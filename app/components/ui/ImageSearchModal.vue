<template>
  <UModal 
    v-model:open="isOpen" 
    title="Select Product Images"
    description="Search and select product images for your ad. You need to select at least 3 images."
    :ui="{ width: 'w-full sm:max-w-4xl' }"
  >
    <template #body>
      <div class="space-y-4">
            <div v-if="!hasSearched && !isSearching" class="text-center py-8">
              <p class="text-gray-600 mb-4">Searching for images based on your ad description...</p>
            </div>

        <div v-if="isSearching" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-500 animate-spin mr-3" />
          <span class="text-gray-600">Searching for images...</span>
        </div>

        <div v-else-if="hasSearched && searchResults.length > 0" class="space-y-4">
          <div class="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 mb-4">
            <p class="text-base font-semibold text-gray-900 mb-1">
              Found {{ searchResults.length }} image{{ searchResults.length !== 1 ? 's' : '' }}
            </p>
            <p class="text-sm font-medium text-gray-800">
              Select at least {{ minImages - selectedCount }} more image{{ minImages - selectedCount !== 1 ? 's' : '' }} from the search results below.
            </p>
          </div>
          
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
            <div
              v-for="(image, index) in searchResults"
              :key="index"
              class="relative aspect-square cursor-pointer group"
              :class="{
                'ring-2 ring-primary-500': isSelected(image.url),
                'opacity-50': isSelected(image.url) && selectedCount >= minImages
              }"
              @click="toggleSelection(image)"
            >
                    <NuxtImg
                      :src="image.url"
                      :alt="image.title || 'Search result'"
                      class="w-full h-full object-cover rounded-lg"
                      loading="lazy"
                      width="800"
                      height="1422"
                      fit="cover"
                      quality="90"
                      format="webp"
                      @error="handleImageError"
                      @load="handleImageLoad"
                    />
              <div
                v-if="isSelected(image.url)"
                class="absolute inset-0 bg-primary-500/20 rounded-lg flex items-center justify-center"
              >
                <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-primary-600" />
              </div>
              <div
                class="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors"
              />
            </div>
          </div>
        </div>

        <div v-else-if="hasSearched && searchResults.length === 0 && !searchError" class="text-center py-8">
          <p class="text-gray-600 mb-4">No images found. Please try searching again with a different query.</p>
          <UButton @click="searchImages">Try Again</UButton>
        </div>
        
        <div v-else-if="searchError" class="text-center py-8">
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p class="text-red-800 font-semibold mb-2">Search Error</p>
            <p class="text-red-600 text-sm">{{ searchError }}</p>
                  <p v-if="searchError.includes('API credentials')" class="text-red-600 text-xs mt-2">
                    Please configure GOOGLE_IMAGE_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.
                  </p>
          </div>
          <UButton @click="searchImages">Try Again</UButton>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-600">
          {{ selectedCount }} of {{ minImages }} minimum images selected
        </p>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="close">Cancel</UButton>
          <UButton
            color="primary"
            :disabled="selectedCount < minImages"
            @click="confirmSelection"
          >
            Confirm Selection ({{ selectedCount }}/{{ minImages }})
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface ImageResult {
  url: string
  thumbnailUrl?: string
  title?: string
  width?: number
  height?: number
  contextUrl?: string
}

const props = defineProps<{
  modelValue: boolean
  searchQuery: string
  minImages: number
  existingImages?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [images: string[]]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const selectedImages = ref<string[]>(props.existingImages || [])
const searchResults = ref<ImageResult[]>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)
const hasSearched = ref(false)

const selectedCount = computed(() => selectedImages.value.length)

const isSelected = (url: string) => selectedImages.value.includes(url)

const toggleSelection = (image: ImageResult) => {
  const index = selectedImages.value.indexOf(image.url)
  if (index > -1) {
    selectedImages.value.splice(index, 1)
  } else {
    selectedImages.value.push(image.url)
  }
}

const searchImages = async () => {
  if (!props.searchQuery) {
    searchError.value = 'No search query provided'
    return
  }

  isSearching.value = true
  searchError.value = null
  hasSearched.value = true

  try {
    const result = await $fetch('/api/google-image-search', {
      method: 'POST',
      body: {
        query: props.searchQuery,
      },
    })

    const images = result.images || []
    searchResults.value = images
    
    if (images.length === 0) {
      searchError.value = 'No images found for your search query. Please try a different search term.'
    } else {
      searchError.value = null
    }
  } catch (error: any) {
    // Extract error message from response if available
    let errorMessage = 'Failed to search images. Please try again.'
    
    if (error.data?.message) {
      errorMessage = error.data.message
    } else if (error.message) {
      errorMessage = error.message
    } else if (error.statusMessage) {
      errorMessage = `${error.statusMessage}: ${error.message || 'Unknown error'}`
    }
    
    searchError.value = errorMessage
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

const confirmSelection = () => {
  if (selectedCount.value >= props.minImages) {
    emit('confirm', selectedImages.value)
    close()
  }
}

const close = () => {
  isOpen.value = false
  selectedImages.value = props.existingImages || []
}

      const handleImageError = (event: Event) => {
        const img = event.target as HTMLImageElement
        // Prevent infinite loop if error handler already ran
        if (img && !img.dataset.errorHandled) {
          img.dataset.errorHandled = 'true'
          // We're already using the full URL, so just create a placeholder
          const currentSrc = img.src
          const imageData = searchResults.value.find((r: any) => 
            r.url === currentSrc || r.thumbnailUrl === currentSrc
          )
          
          if (imageData && imageData.url && imageData.url !== currentSrc && !currentSrc.includes('data:')) {
            // Try the full URL if we somehow got a different URL
            img.src = imageData.url
          } else {
      // Create a better placeholder with the image title
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 711
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#374151'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const title = img.alt || 'Image'
        const maxWidth = 350
        const words = title.split(' ')
        let line = ''
        let y = canvas.height / 2 - 20
        words.forEach((word) => {
          const testLine = line + word + ' '
          const metrics = ctx.measureText(testLine)
          if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line, canvas.width / 2, y)
            line = word + ' '
            y += 25
          } else {
            line = testLine
          }
        })
        ctx.fillText(line, canvas.width / 2, y)
      }
      img.src = canvas.toDataURL()
    }
  }
}

const handleImageLoad = () => {
  // Image loaded successfully - no action needed
}

// Automatically search when modal opens (if we have a query)
watch(isOpen, (open) => {
  if (open && props.searchQuery && !hasSearched.value) {
    // Automatically trigger search when modal opens
    searchImages()
  } else if (!open) {
    // Reset search state when modal closes
    hasSearched.value = false
    searchResults.value = []
    searchError.value = null
    selectedImages.value = props.existingImages || []
  }
})

// Also watch for searchQuery changes when modal is open
watch(() => props.searchQuery, (newQuery) => {
  if (isOpen.value && newQuery && !hasSearched.value) {
    searchImages()
  }
})

// Initialize with existing images
watch(() => props.existingImages, (images) => {
  if (images) {
    selectedImages.value = [...images]
  }
}, { immediate: true })
</script>

