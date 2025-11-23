<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black py-8 sm:py-12">
    <UContainer class="max-w-2xl px-4 sm:px-6">
      <!-- Header -->
      <div class="mb-8">
        <UButton
          variant="ghost"
          color="neutral"
          @click="router.push('/create/details')"
          class="mb-4"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-2" />
          Back
        </UButton>
        <h1 class="text-3xl sm:text-4xl font-bold text-mendo-black dark:text-mendo-white mb-3">
          Finalize Your Ad
        </h1>
        <p class="text-lg text-mendo-black/70 dark:text-mendo-white/70">
          Review and generate your video
        </p>
      </div>

      <!-- Preview Card -->
      <div class="bg-mendo-white dark:bg-mendo-black rounded-3xl shadow-xl border border-mendo-light-grey dark:border-mendo-light-grey/30 p-6 sm:p-10 mb-6">
        <!-- Live Preview Thumbnail -->
        <div class="mb-6">
          <div class="aspect-[9/16] w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-mendo-light-grey dark:bg-mendo-light-grey/20 border-2 border-mendo-light-grey dark:border-mendo-light-grey/30">
            <img
              v-if="previewImageUrl"
              :src="previewImageUrl"
              alt="Video preview"
              class="w-full h-full object-cover"
              @error="handlePreviewImageError"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-mendo-black/40 dark:text-mendo-white/40">
              <UIcon name="i-heroicons-video-camera" class="w-16 h-16" />
            </div>
          </div>
        </div>

        <!-- Avatar Picker Section - Only shown for custom/power users -->
        <div v-if="selectedAvatar && isCustomCategory" class="flex items-center justify-center gap-2 mb-4">
          <span class="text-xs text-mendo-black/70 dark:text-mendo-white/70 opacity-70">Presented by</span>
          
          <!-- Tiny tap target - only power users will discover this -->
          <button
            @click="showAvatarPicker = true"
            class="flex items-center gap-1 text-xs text-mendo-black/70 dark:text-mendo-white/70 hover:text-mendo-black dark:hover:text-mendo-white transition-colors"
            type="button"
          >
            <span>{{ selectedAvatar.displayName }}</span>
            <UIcon name="i-heroicons-chevron-down" class="w-3 h-3" />
          </button>
        </div>
        
        <!-- For normal users, just show the avatar name without picker -->
        <div v-else-if="selectedAvatar && !isCustomCategory" class="flex items-center justify-center gap-2 mb-4">
          <span class="text-xs text-mendo-black/70 dark:text-mendo-white/70 opacity-70">Presented by</span>
          <span class="text-xs text-mendo-black/70 dark:text-mendo-white/70">{{ selectedAvatar.displayName }}</span>
        </div>

        <!-- Photo Upload Section -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold text-mendo-black dark:text-mendo-white mb-3 text-center">
            Want me to hold YOUR exact product?
          </h3>
          <p class="text-sm text-mendo-black/70 dark:text-mendo-white/70 mb-4 text-center">
            (takes 2 seconds)
          </p>

          <!-- Multi Image Upload Component -->
          <MultiImageUpload
            v-model="productImages"
            :max-images="10"
            @upload="handleProductImageUpload"
          />

          <!-- Skip Button -->
          <div class="mt-4 text-center">
            <UButton
              :disabled="generating || uploading"
              size="lg"
              :variant="hasSkippedUpload ? 'soft' : 'outline'"
              :color="hasSkippedUpload ? 'success' : 'neutral'"
              class="cursor-pointer transition-all"
              @click="handleSkipUpload"
            >
              <span v-if="hasSkippedUpload" class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
                No thanks – looks great anyway
              </span>
              <span v-else>No thanks – looks great anyway</span>
            </UButton>
          </div>
        </div>
      </div>

      <!-- Generate Button -->
      <UButton
        :disabled="generating || uploading || (!hasUploadedImage && !hasSkippedUpload)"
        :loading="generating"
        size="xl"
        color="secondary"
        class="w-full bg-secondary-500 hover:bg-secondary-600 text-white font-semibold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all min-h-[56px] disabled:opacity-50 disabled:cursor-not-allowed"
        @click="handleGenerate"
      >
        <span v-if="!generating">Generate Video</span>
        <span v-else>Generating your video...</span>
      </UButton>

      <!-- Generation Progress (if generating) -->
      <UCard v-if="generating" class="mt-6 bg-mendo-white dark:bg-mendo-black border border-mendo-light-grey dark:border-mendo-light-grey/30">
        <div class="text-center py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-secondary-500 animate-spin mx-auto mb-2" />
          <p class="text-sm text-mendo-black/70 dark:text-mendo-white/70">
            Creating your ad video... This may take a minute.
          </p>
        </div>
      </UCard>

      <!-- Avatar Picker Modal - Only for custom/power users -->
      <AvatarPicker
        v-if="isCustomCategory"
        v-model="showAvatarPicker"
        :current-avatar-id="selectedAvatar?.id"
        @select="handleAvatarSelect"
      />
    </UContainer>
  </div>
</template>

<script setup lang="ts">
import MultiImageUpload from '~/components/ui/MultiImageUpload.vue'
import AvatarPicker from '~/components/create/AvatarPicker.vue'
import { getAvatarById, getAvatarReferenceImageUrl, type Avatar } from '~/config/avatars'

const router = useRouter()
const toast = useToast()

const productImages = ref<(File | string | null)[]>([])
const uploadedImageUrl = ref<string | null>(null)

// Computed to check if user has uploaded an image
const hasUploadedImage = computed(() => {
  return uploadedImageUrl.value !== null && uploadedImageUrl.value !== undefined && uploadedImageUrl.value !== ''
})
const uploading = ref(false)
const generating = ref(false)
const selectedAvatar = ref<Avatar | null>(null)
const showAvatarPicker = ref(false)
const previewImageUrl = ref<string | null>(null)
const avatarImageError = ref(false)
const isCustomCategory = ref(false)
const hasSkippedUpload = ref(false)

// Load selected avatar and update preview on mount
onMounted(() => {
  if (import.meta.client) {
    // Check if this is a custom/power user category
    const selectedCategory = sessionStorage.getItem('selectedCategory')
    isCustomCategory.value = selectedCategory === 'custom'
    console.log('[Finalize] Category check:', { selectedCategory, isCustomCategory: isCustomCategory.value })
    
    // Load selected avatar - check both selectedAvatarId and promptData.avatarId
    let selectedAvatarId = sessionStorage.getItem('selectedAvatarId')
    
    // If no selectedAvatarId, check promptData for category flow
    if (!selectedAvatarId) {
      const promptDataStr = sessionStorage.getItem('promptData')
      if (promptDataStr) {
        try {
          const promptData = JSON.parse(promptDataStr)
          if (promptData.avatarId) {
            selectedAvatarId = promptData.avatarId
            console.log('[Finalize] Loaded avatarId from promptData:', selectedAvatarId)
          }
        } catch (error) {
          console.error('Error loading promptData:', error)
        }
      }
    }
    
    if (selectedAvatarId) {
      const avatar = getAvatarById(selectedAvatarId)
      if (avatar) {
        selectedAvatar.value = avatar
        updatePreviewImage()
        console.log('[Finalize] Loaded avatar:', avatar.id, avatar.displayName)
      } else {
        console.warn('[Finalize] Avatar not found for ID:', selectedAvatarId)
      }
    } else {
      console.warn('[Finalize] No avatar ID found in sessionStorage')
    }
    
    // Load uploaded images if exists
    const promptDataStr = sessionStorage.getItem('promptData')
    if (promptDataStr) {
      try {
        const promptData = JSON.parse(promptDataStr)
        if (promptData.productImages && promptData.productImages.length > 0) {
          // Load all images, not just the first one
          const allImageUrls = promptData.productImages.filter((url: any): url is string => typeof url === 'string')
          uploadedImageUrl.value = allImageUrls[0] ?? null // First URL for preview
          productImages.value = allImageUrls // All images for the component
          console.log('[Finalize] Loaded', allImageUrls.length, 'product image(s) from promptData')
        }
      } catch (error) {
        console.error('Error loading promptData:', error)
      }
    }
  }
})

// Update preview image when avatar changes
const updatePreviewImage = () => {
  if (selectedAvatar.value) {
    // Use static placeholder: /avatars/{avatarId}/preview.jpg
    // This will be a pre-rendered image of the avatar holding a generic product
    previewImageUrl.value = `/avatars/${selectedAvatar.value.id}/preview.jpg`
  }
}

const handleProductImageUpload = async (files: (File | string | null)[]) => {
  // Filter out null values
  const validFiles = files.filter((f): f is File | string => f !== null)
  
  if (validFiles.length === 0) {
    uploadedImageUrl.value = null
    productImages.value = []
    updatePromptDataImages([])
    return
  }

  // Separate files and URLs
  const filesToUpload = validFiles.filter((f): f is File => f instanceof File)
  const existingUrls = validFiles.filter((f): f is string => typeof f === 'string')
  
  // Upload new files if any
  if (filesToUpload.length > 0) {
    uploading.value = true
    try {
      const formData = new FormData()
      filesToUpload.forEach(file => {
        formData.append('images', file)
      })
      
      const result = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
        method: 'POST',
        body: formData,
      })
      
      if (result.urls && result.urls.length > 0) {
        // Combine uploaded URLs with existing URLs
        const allUrls = [...existingUrls, ...result.urls]
        uploadedImageUrl.value = allUrls[0] ?? null // Keep first URL for preview
        productImages.value = allUrls
        hasSkippedUpload.value = false // Reset skip flag when image is uploaded
        updatePromptDataImages(allUrls)
        
        toast.add({
          title: 'Images Uploaded',
          description: `${result.urls.length} image${result.urls.length > 1 ? 's' : ''} uploaded successfully`,
          color: 'success',
        })
      }
    } catch (error: any) {
      console.error('Error uploading images:', error)
      toast.add({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload images. Please try again.',
        color: 'error',
      })
      // Keep existing URLs if upload fails
      if (existingUrls.length > 0) {
        productImages.value = existingUrls
        uploadedImageUrl.value = existingUrls[0] || null
      } else {
        productImages.value = []
        uploadedImageUrl.value = null
      }
    } finally {
      uploading.value = false
    }
  } else if (existingUrls.length > 0) {
    // Only URLs, no new files to upload
    uploadedImageUrl.value = existingUrls[0] || null
    productImages.value = existingUrls
    hasSkippedUpload.value = false
    updatePromptDataImages(existingUrls)
  }
}

const updatePromptDataImages = (urls: string[]) => {
  if (import.meta.client) {
    const promptDataStr = sessionStorage.getItem('promptData')
    if (promptDataStr) {
      try {
        const promptData = JSON.parse(promptDataStr)
        promptData.productImages = urls
        sessionStorage.setItem('promptData', JSON.stringify(promptData))
      } catch (error) {
        console.error('Error updating promptData:', error)
      }
    }
  }
}

const handleSkipUpload = () => {
  // User skipped upload - mark as skipped so they can generate
  hasSkippedUpload.value = true
  uploadedImageUrl.value = null
  productImages.value = []
  updatePromptDataImages([])
}

const handleAvatarSelect = (avatarId: string) => {
  if (!isCustomCategory.value) return // Only allow selection for custom users
  
  const avatar = getAvatarById(avatarId)
  if (avatar) {
    selectedAvatar.value = avatar
    if (import.meta.client) {
      sessionStorage.setItem('selectedAvatarId', avatarId)
    }
    updatePreviewImage()
  }
  showAvatarPicker.value = false
}

const handleGenerate = async () => {
  if (generating.value) return
  
  generating.value = true
  
  try {
    // Get promptData from sessionStorage
    if (!import.meta.client) {
      throw new Error('Client-side only operation')
    }
    
    const promptDataStr = sessionStorage.getItem('promptData')
    
    if (!promptDataStr) {
      throw new Error('No prompt data found')
    }
    
    const promptData = JSON.parse(promptDataStr)
    
    // Update avatar reference in promptData if avatar is selected
    if (selectedAvatar.value) {
      const avatarReferenceUrl = getAvatarReferenceImageUrl(selectedAvatar.value)
      if (avatarReferenceUrl) {
        const previewUrl = `/avatars/${selectedAvatar.value.id}/preview.jpg`
        promptData.avatarReference = [avatarReferenceUrl, previewUrl]
        promptData.avatarId = selectedAvatar.value.id
        // Also update selectedAvatarId in sessionStorage
        sessionStorage.setItem('selectedAvatarId', selectedAvatar.value.id)
      }
    }
    
    // Update promptData with current product images
    if (productImages.value.length > 0) {
      const imageUrls = productImages.value.filter((img): img is string => typeof img === 'string')
      promptData.productImages = imageUrls
    }
    
    // Save updated promptData back to sessionStorage
    sessionStorage.setItem('promptData', JSON.stringify(promptData))
    
    // Clear all old storyboard and video data before navigating (new session)
    // This ensures only incoming data is used for storyboard generation
    const keysToRemove = [
      'selectedStory',
      'generateStoryboard',
      'generateFrames',
      'generateVideoJobId',
      'videoResult',
      'generateJobState',
      'editorClips',
      'editorComposedVideo',
    ]
    
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key)
    })
    
    // Clear all storyboard state from localStorage (old sessions)
    if (process.client) {
      Object.keys(localStorage)
        .filter(key => key.startsWith('storyboard-state-'))
        .forEach(key => localStorage.removeItem(key))
    }
    
    // Set flag to indicate this is a new navigation (not a refresh)
    sessionStorage.setItem('isNewNavigation', 'true')
    
    // Navigate to preview page (which will show the storyboard)
    await router.push('/preview')
  } catch (error: any) {
    console.error('Error preparing for storyboard:', error)
    toast.add({
      title: 'Error',
      description: error.message || 'Failed to prepare storyboard. Please try again.',
      color: 'error',
    })
  } finally {
    generating.value = false
  }
}

const handlePreviewImageError = (event: Event) => {
  // Fallback to avatar reference image if preview fails
  const img = event.target as HTMLImageElement
  if (selectedAvatar.value) {
    img.src = getAvatarReferenceImageUrl(selectedAvatar.value)
  } else {
    img.src = '/avatars/placeholder.png'
  }
}

const handleAvatarImageError = (event: Event) => {
  // Mark that avatar image failed to load, so fallback UI shows
  avatarImageError.value = true
  console.warn('[Finalize] Avatar reference image failed to load:', getAvatarReferenceImageUrl(selectedAvatar.value!))
}

const handleAvatarThumbnailError = (event: Event) => {
  // Fallback to placeholder if avatar thumbnail fails to load
  const img = event.target as HTMLImageElement
  img.src = '/avatars/placeholder.png'
}
</script>

