<template>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Product Images
        <span class="text-red-500">*</span>
        <span class="text-xs text-gray-500 font-normal ml-1">(1-10 images required)</span>
      </label>
      
      <!-- Upload area -->
      <div
        class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
        :class="[
          productImages.length === 0 ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50',
          'hover:border-primary-400'
        ]"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="handleFileChange"
        />
        <div
          class="cursor-pointer"
          @click="handleClick"
          @dragover.prevent
          @dragenter.prevent
          @drop.prevent="handleDrop"
        >
          <UIcon name="i-heroicons-photo" class="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p class="text-sm text-gray-700 font-medium mb-2">
            Upload product images
          </p>
          <p class="text-xs text-gray-500 mb-3">
            Click to select or drag and drop
          </p>
          <p class="text-xs text-gray-400 mb-3">
            JPG, PNG, WEBP (recommended: 1024×1024px or higher)
          </p>
          <UButton variant="outline" color="primary" size="sm" @click.stop="handleClick">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4 mr-1" />
            Select Images
          </UButton>
        </div>
      </div>

      <!-- Validation message -->
      <p v-if="productImages.length === 0" class="text-xs text-red-500 mt-2">
        ⚠️ At least 1 product image is required to generate stories
      </p>
      <p v-else class="text-xs text-gray-600 mt-2">
        {{ productImages.length }} / 10 images uploaded
      </p>
    </div>

    <!-- Image grid preview -->
    <div v-if="productImages.length > 0" class="space-y-3">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="(image, index) in productImages"
          :key="index"
          class="relative group border-2 border-gray-200 rounded-lg overflow-hidden bg-white hover:border-primary-400 transition-colors"
        >
          <!-- Image preview -->
          <div class="aspect-square">
            <img
              v-if="previews[index]"
              :src="previews[index]"
              :alt="`Product image ${index + 1}`"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center bg-gray-100">
              <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <!-- Image overlay with actions -->
          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <UButton
              variant="solid"
              color="white"
              size="xs"
              @click="removeImage(index)"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              Remove
            </UButton>
          </div>

          <!-- Image number badge -->
          <div class="absolute top-2 left-2 bg-white/90 rounded-full px-2 py-0.5 text-xs font-medium text-gray-700">
            {{ index + 1 }}
          </div>
        </div>

        <!-- Add more button (if under max) -->
        <button
          v-if="productImages.length < 10"
          type="button"
          class="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-primary-400 hover:bg-gray-50 transition-colors"
          @click="handleClick"
        >
          <UIcon name="i-heroicons-plus-circle" class="w-8 h-8 text-gray-400 mb-1" />
          <span class="text-xs text-gray-500">Add more</span>
        </button>
      </div>

      <!-- Helpful tips -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p class="text-xs text-blue-700">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 inline-block mr-1" />
          <strong>Tips for best results:</strong>
        </p>
        <ul class="text-xs text-blue-600 mt-2 ml-4 list-disc space-y-1">
          <li>Include different angles and close-ups of your product</li>
          <li>Show product packaging, branding, and labels clearly</li>
          <li>Include lifestyle shots showing the product in use (if available)</li>
          <li>Ensure good lighting and clear focus</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: (File | string)[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: (File | string)[]]
}>()

const productImages = ref<(File | string)[]>(props.modelValue || [])
const fileInput = ref<HTMLInputElement | null>(null)
const previews = ref<string[]>([])

// Initialize previews
const updatePreviews = async () => {
  previews.value = await Promise.all(
    productImages.value.map(async (img) => {
      if (img instanceof File) {
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(img)
        })
      } else if (typeof img === 'string') {
        return img
      }
      return ''
    })
  )
}

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (newValue && Array.isArray(newValue)) {
    productImages.value = [...newValue]
    updatePreviews()
  } else {
    productImages.value = []
    previews.value = []
  }
}, { deep: true })

// Initialize on mount
onMounted(() => {
  updatePreviews()
})

const emitUpdate = () => {
  emit('update:modelValue', productImages.value)
}

const handleClick = () => {
  fileInput.value?.click()
}

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    addFiles(Array.from(files))
    target.value = '' // Reset input
  }
}

const handleDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      addFiles(imageFiles)
    }
  }
}

const addFiles = async (files: File[]) => {
  const currentCount = productImages.value.length
  const availableSlots = 10 - currentCount

  if (availableSlots <= 0) {
    // Show toast notification
    console.warn('Maximum 10 product images allowed')
    return
  }

  // Take only as many files as we have slots
  const filesToAdd = files.slice(0, availableSlots)
  productImages.value.push(...filesToAdd)

  await updatePreviews()
  emitUpdate()
}

const removeImage = (index: number) => {
  productImages.value.splice(index, 1)
  previews.value.splice(index, 1)
  emitUpdate()
}
</script>

