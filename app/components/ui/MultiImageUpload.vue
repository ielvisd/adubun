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
        @click="handleClick"
        @dragover.prevent
        @dragenter.prevent
        @drop.prevent="handleMultipleDrop"
      >
        <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto text-gray-400 mb-2" />
        <p class="text-sm text-gray-600 mb-2">
          Click to select multiple images or drag and drop multiple files
        </p>
        <UButton variant="outline" color="primary" size="sm" @click.stop="handleClick">
          Select Multiple Files
        </UButton>
      </div>
    </div>

    <!-- Image previews and management -->
    <div v-if="images.filter(img => img !== null).length > 0" class="space-y-3">
      <template v-for="(image, index) in images" :key="index">
        <div
          v-if="image !== null"
          class="border-2 border-gray-200 rounded-lg p-4 bg-white"
        >
          <div class="flex items-center gap-4">
            <div v-if="previews[index]" class="flex-shrink-0">
              <NuxtImg :src="previews[index]" alt="Image preview" class="w-20 h-20 object-cover rounded shadow-sm" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-700 truncate">
                {{ isFile(image) ? image.name : 'Image URL' }}
              </p>
              <p v-if="typeof image === 'string'" class="text-xs text-gray-500 truncate mt-1">{{ image }}</p>
            </div>
            <UButton
              variant="ghost"
              color="red"
              size="sm"
              @click="removeImage(index)"
            >
              Remove
            </UButton>
          </div>
        </div>
      </template>
    </div>
    
    <UButton
      v-if="images.filter(img => img !== null).length < maxImages"
      variant="outline"
      size="sm"
      @click="handleClick"
    >
      + Add More Images
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
const images = ref<(File | string | null)[]>(props.modelValue && props.modelValue.length > 0 ? [...props.modelValue] : [])
const multipleFileInput = ref<HTMLInputElement | null>(null)
const previews = ref<(string | undefined)[]>([])

// Initialize previews array
if (images.value.length > 0) {
  previews.value = new Array(images.value.length).fill(undefined)
} else {
  previews.value = []
}

const emitUpdate = () => {
  const filtered = images.value.filter(img => img !== null)
  emit('update:modelValue', filtered)
  emit('upload', filtered)
}

const updatePreviews = () => {
  // Ensure previews array is properly sized
  while (previews.value.length < images.value.length) {
    previews.value.push(undefined)
  }
  
  // Update previews for each image
  previews.value = images.value.map((img, idx) => {
    if (img instanceof File) {
      // Will be set by FileReader below
      return previews.value[idx] || undefined
    } else if (typeof img === 'string' && img) {
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


// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (newValue && Array.isArray(newValue) && newValue.length > 0) {
    images.value = [...newValue]
  } else {
    images.value = []
  }
  updatePreviews()
}, { deep: true })

// Initialize previews on mount
onMounted(() => {
  updatePreviews()
})

const isFile = (item: File | string | null): item is File => {
  return item instanceof File
}

const handleClick = () => {
  if (multipleFileInput.value) {
    multipleFileInput.value.click()
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
    // Max images reached
    return
  }

  // Take only as many files as we have slots for
  const filesToAdd = files.slice(0, availableSlots)
  
  // Add files directly to the images array
  for (const file of filesToAdd) {
    if (images.value.length < maxImages.value) {
      images.value.push(file)
      previews.value.push(undefined)
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        const index = images.value.length - 1
        previews.value[index] = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }
  
  emitUpdate()
}


const removeImage = (index: number) => {
  images.value.splice(index, 1)
  previews.value.splice(index, 1)
  emitUpdate()
}
</script>

