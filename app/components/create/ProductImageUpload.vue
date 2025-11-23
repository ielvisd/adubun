<template>
  <div class="space-y-4">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileSelect"
    />
    
    <!-- Upload Preview Area -->
    <div class="space-y-4">
      <!-- Preview when image is uploaded -->
      <div v-if="previewUrl" class="relative aspect-square w-full max-w-md mx-auto rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700">
        <img
          :src="previewUrl"
          alt="Product preview"
          class="w-full h-full object-contain"
        />
        <button
          @click="clearImage"
          class="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
          type="button"
        >
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
        </button>
      </div>
      
      <!-- Upload area shown when no image (but this is handled by parent buttons) -->
      <div v-else class="hidden"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const uploadedUrl = ref<string | null>(null)
const uploading = ref(false)
const toast = useToast()

const emit = defineEmits<{
  (e: 'uploaded', url: string): void
  (e: 'cleared'): void
}>()

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFile = async (file: File) => {
  if (!file) return
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    toast.add({
      title: 'Invalid File',
      description: 'Please select an image file',
      color: 'red',
    })
    return
  }
  
  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    toast.add({
      title: 'File Too Large',
      description: 'Please select an image smaller than 10MB',
      color: 'red',
    })
    return
  }
  
  // Create preview
  const reader = new FileReader()
  reader.onload = (e) => {
    previewUrl.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
  
  // Wait a bit for preview to load
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // Upload to S3
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('images', file)
    
    const result = await $fetch<{ urls: string[]; count: number }>('/api/upload-images-s3', {
      method: 'POST',
      body: formData,
    })
    
    if (result.urls && result.urls.length > 0) {
      uploadedUrl.value = result.urls[0]
      emit('uploaded', result.urls[0])
      
      toast.add({
        title: 'Image Uploaded',
        description: 'Your product image has been uploaded successfully',
        color: 'green',
      })
    } else {
      throw new Error('No URL returned from upload')
    }
  } catch (error: any) {
    console.error('Error uploading image:', error)
    toast.add({
      title: 'Upload Failed',
      description: error.message || 'Failed to upload image. Please try again.',
      color: 'red',
    })
    previewUrl.value = null
  } finally {
    uploading.value = false
    // Reset input
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (!file) return
  
  await handleFile(file)
}

const clearImage = () => {
  previewUrl.value = null
  uploadedUrl.value = null
  emit('cleared')
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const handleDroppedFile = async (file: File) => {
  await handleFile(file)
}

defineExpose({
  triggerFileInput,
  handleDroppedFile,
  uploadedUrl: computed(() => uploadedUrl.value),
  previewUrl: computed(() => previewUrl.value),
})
</script>

