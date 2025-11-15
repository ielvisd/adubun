<template>
  <div class="space-y-3">
    <!-- Multiple file selection button -->
    <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 hover:border-primary-400 transition-colors">
      <input
        ref="multipleFileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="handleMultipleFileChange"
      />
      <div
        class="cursor-pointer"
        @click="multipleFileInput?.click()"
        @dragover.prevent
        @dragenter.prevent
        @drop.prevent="handleMultipleDrop"
      >
        <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto text-gray-400 mb-2" />
        <p class="text-sm text-gray-600 mb-2">
          Click to select multiple images, drag and drop multiple files, or add images one by one below
        </p>
        <UButton variant="outline" color="primary" size="sm" @click.stop="multipleFileInput?.click()">
          Select Multiple Files
        </UButton>
      </div>
    </div>

    <!-- Individual image slots -->
    <div
      v-for="(image, index) in images"
      :key="index"
      class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 hover:border-primary-400 transition-colors"
    >
      <input
        :ref="(el) => setFileInputRef(el, index)"
        type="file"
        accept="image/*"
        class="hidden"
        @change="(e) => handleFileChange(e, index)"
      />
      <div
        class="cursor-pointer"
        @click="fileInputs[index]?.click()"
        @dragover.prevent
        @dragenter.prevent
        @drop.prevent="(e) => handleDrop(e, index)"
      >
        <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto text-gray-400 mb-2" />
        <p class="text-sm text-gray-600 mb-2">
          {{ index === 0 ? 'Click to upload, drag and drop, or enter URL' : `Reference Image ${index + 1}` }}
        </p>
        <UButton variant="outline" color="primary" size="sm" @click.stop="fileInputs[index]?.click()">
          Select File
        </UButton>
        <div class="mt-3">
          <UInput
            v-model="urlInputs[index]"
            :placeholder="index === 0 ? 'Or enter image URL' : 'Or enter image URL'"
            size="sm"
            @blur="() => handleUrlInput(index)"
            @keyup.enter="() => handleUrlInput(index)"
          />
        </div>
        <div v-if="previews[index]" class="mt-4">
          <img :src="previews[index]" alt="Image preview" class="max-h-40 mx-auto rounded shadow-sm" />
          <UButton
            variant="ghost"
            color="red"
            size="xs"
            class="mt-2"
            @click.stop="removeImage(index)"
          >
            Remove
          </UButton>
        </div>
      </div>
    </div>
    
    <UButton
      v-if="images.length < maxImages"
      variant="outline"
      size="sm"
      @click="addImage"
    >
      + Add Another Image
    </UButton>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: (File | string | null)[]
  maxImages?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: (File | string | null)[]]
  upload: [files: (File | string | null)[]]
}>()

const maxImages = computed(() => props.maxImages || 3)
const images = ref<(File | string | null)[]>(props.modelValue && props.modelValue.length > 0 ? [...props.modelValue] : [null])
const fileInputs = ref<(HTMLInputElement | null)[]>([])
const multipleFileInput = ref<HTMLInputElement | null>(null)
const previews = ref<(string | undefined)[]>([])
const urlInputs = ref<string[]>([])

// Initialize arrays to match images length
if (images.value.length > 0) {
  previews.value = new Array(images.value.length).fill(undefined)
  urlInputs.value = new Array(images.value.length).fill('')
} else {
  previews.value = [undefined]
  urlInputs.value = ['']
}

const emitUpdate = () => {
  const filtered = images.value.filter(img => img !== null)
  emit('update:modelValue', filtered.length > 0 ? filtered : [null])
  emit('upload', filtered.length > 0 ? filtered : [])
}

const updatePreviews = () => {
  // Ensure arrays are properly sized
  while (previews.value.length < images.value.length) {
    previews.value.push(undefined)
  }
  while (urlInputs.value.length < images.value.length) {
    urlInputs.value.push('')
  }
  
  previews.value = images.value.map((img, idx) => {
    if (img instanceof File) {
      // Will be set by FileReader
      return undefined
    } else if (typeof img === 'string' && img) {
      urlInputs.value[idx] = img
      return img
    }
    return undefined
  })
  
  // Load file previews
  images.value.forEach((img, idx) => {
    if (img instanceof File && !previews.value[idx]) {
      const reader = new FileReader()
      reader.onload = (e) => {
        previews.value[idx] = e.target?.result as string
      }
      reader.readAsDataURL(img)
    }
  })
}

const setFileInputRef = (el: any, index: number) => {
  if (el) {
    fileInputs.value[index] = el
  }
}

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (newValue && Array.isArray(newValue) && newValue.length > 0) {
    images.value = [...newValue]
  } else if (!newValue || newValue.length === 0) {
    images.value = [null]
  }
  updatePreviews()
}, { deep: true })

// Initialize previews on mount
onMounted(() => {
  updatePreviews()
})

const handleFileChange = (event: Event, index: number) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      previews.value[index] = e.target?.result as string
    }
    reader.readAsDataURL(file)
    images.value[index] = file
    urlInputs.value[index] = ''
    emitUpdate()
  }
}

const handleDrop = (event: DragEvent, index: number) => {
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      previews.value[index] = e.target?.result as string
    }
    reader.readAsDataURL(file)
    images.value[index] = file
    urlInputs.value[index] = ''
    emitUpdate()
  }
}

const handleMultipleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    addMultipleFiles(Array.from(files))
    // Reset the input so the same files can be selected again if needed
    target.value = ''
  }
}

const handleMultipleDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      addMultipleFiles(imageFiles)
    }
  }
}

const addMultipleFiles = (files: File[]) => {
  // Calculate how many slots we can fill
  const currentCount = images.value.filter(img => img !== null).length
  const availableSlots = maxImages.value - currentCount
  
  if (availableSlots <= 0) {
    // Show a message that max images reached
    return
  }

  // Take only as many files as we have slots for
  const filesToAdd = files.slice(0, availableSlots)
  
  // Find empty slots or create new ones
  let fileIndex = 0
  for (let i = 0; i < images.value.length && fileIndex < filesToAdd.length; i++) {
    if (images.value[i] === null) {
      const file = filesToAdd[fileIndex]
      images.value[i] = file
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        previews.value[i] = e.target?.result as string
      }
      reader.readAsDataURL(file)
      
      urlInputs.value[i] = ''
      fileIndex++
    }
  }
  
  // If we still have files and slots available, add new slots
  while (fileIndex < filesToAdd.length && images.value.length < maxImages.value) {
    const file = filesToAdd[fileIndex]
    images.value.push(file)
    previews.value.push(undefined)
    urlInputs.value.push('')
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      previews.value[previews.value.length - 1] = e.target?.result as string
    }
    reader.readAsDataURL(file)
    
    fileIndex++
  }
  
  emitUpdate()
}

const handleUrlInput = (index: number) => {
  const url = urlInputs.value[index]?.trim()
  if (url) {
    try {
      new URL(url)
      previews.value[index] = url
      images.value[index] = url
      emitUpdate()
    } catch {
      // Invalid URL, ignore
    }
  }
}

const removeImage = (index: number) => {
  images.value.splice(index, 1)
  previews.value.splice(index, 1)
  urlInputs.value.splice(index, 1)
  fileInputs.value.splice(index, 1)
  emitUpdate()
}

const addImage = () => {
  if (images.value.length < maxImages.value) {
    images.value.push(null)
    previews.value.push(undefined)
    urlInputs.value.push('')
  }
}
</script>

