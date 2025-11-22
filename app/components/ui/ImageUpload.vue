<template>
  <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 hover:border-primary-400 transition-colors">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileChange"
    />
    <div
      class="cursor-pointer"
      @click="fileInput?.click()"
      @dragover.prevent
      @dragenter.prevent
      @drop.prevent="handleDrop"
    >
      <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto text-gray-400 mb-2" />
      <p class="text-sm text-gray-600 mb-2">
        Click to upload, drag and drop, or enter URL
      </p>
      <UButton variant="outline" color="primary" size="sm" @click.stop="fileInput?.click()">
        Select File
      </UButton>
      <div class="mt-3 relative">
        <UInput
          ref="urlInputRef"
          v-model="urlInput"
          placeholder="Or enter image URL"
          size="sm"
          class="pr-10"
          @blur="handleUrlInput"
          @keyup.enter="handleUrlInput"
        />
        <div class="absolute right-2 top-1/2 -translate-y-1/2">
          <UiVoiceInputButton
            :is-supported="urlVoiceInput.isSupported.value"
            :is-listening="urlVoiceInput.isListening.value"
            :error="urlVoiceInput.error.value"
            @click="handleUrlVoiceInput"
          />
        </div>
      </div>
      <div v-if="preview" class="mt-4">
        <NuxtImg :src="preview" alt="Image preview" class="max-h-40 mx-auto rounded shadow-sm" />
        <UButton
          variant="ghost"
          color="red"
          size="xs"
          class="mt-2"
          @click.stop="clearImage"
        >
          Remove
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: File | string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: File | string | null]
  upload: [file: File | string | null]
}>()

const fileInput = ref<HTMLInputElement>()
const preview = ref<string>()
const urlInput = ref<string>('')
const urlInputRef = ref<HTMLInputElement | null>(null)

// Voice input for URL
const urlVoiceInput = useVoiceInput((text: string) => {
  urlInput.value = urlInput.value.trim() ? `${urlInput.value} ${text}` : text
})

const handleUrlVoiceInput = async () => {
  if (urlVoiceInput.isListening.value) {
    urlVoiceInput.stopListening()
  } else {
    try {
      await urlVoiceInput.startListening()
    } catch (err) {
      // Error is handled by the composable
    }
  }
}

// Keyboard shortcut handler
const handleKeyDown = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? event.metaKey : event.ctrlKey
  
  if (modifier && event.shiftKey && event.key === 'V') {
    const activeElement = document.activeElement
    if (activeElement === urlInputRef.value) {
      event.preventDefault()
      handleUrlVoiceInput()
    }
  }
}

onMounted(() => {
  if (process.client) {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  if (process.client) {
    window.removeEventListener('keydown', handleKeyDown)
    urlVoiceInput.stopListening()
  }
})

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (newValue instanceof File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      preview.value = e.target?.result as string
    }
    reader.readAsDataURL(newValue)
  } else if (typeof newValue === 'string' && newValue) {
    preview.value = newValue
    urlInput.value = newValue
  } else {
    preview.value = undefined
    urlInput.value = ''
  }
}, { immediate: true })

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      preview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
    emit('update:modelValue', file)
    emit('upload', file)
    urlInput.value = ''
  }
}

const handleDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      preview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
    emit('update:modelValue', file)
    emit('upload', file)
    urlInput.value = ''
  }
}

const handleUrlInput = () => {
  const url = urlInput.value.trim()
  if (url) {
    // Basic URL validation
    try {
      new URL(url)
      preview.value = url
      emit('update:modelValue', url)
      emit('upload', url)
    } catch {
      // Invalid URL, ignore
    }
  }
}

const clearImage = () => {
  preview.value = undefined
  urlInput.value = ''
  emit('update:modelValue', null)
  emit('upload', null)
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

