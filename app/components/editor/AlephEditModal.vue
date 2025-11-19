<template>
  <UModal v-model:open="isOpen" title="Edit Video with AI" :ui="{ width: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Use AI to modify this {{ formatDuration(clipDuration) }} video clip. 
            Describe the changes you want to make.
          </p>
        </div>

        <UFormField label="Edit Instructions" name="prompt" required>
          <UTextarea
            v-model="editPrompt"
            placeholder="e.g., 'add rain and thunder', 'change to sunset lighting', 'remove background people'"
            :rows="4"
            :maxlength="500"
          />
          <template #description>
            <span class="text-xs text-gray-500">
              {{ editPrompt.length }} / 500
            </span>
          </template>
        </UFormField>

        <UFormField label="Reference Image (Optional)" name="referenceImage">
          <div
            @click="triggerFileInput"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleFileDrop"
            class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
            :class="isDragging ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'"
          >
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleFileSelect"
            />
            
            <div v-if="!referenceImageFile && !referenceImagePreview">
              <UIcon name="i-heroicons-photo" class="w-12 h-12 mx-auto text-gray-400 mb-2" />
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Click to upload or drag and drop
              </p>
              <p class="text-xs text-gray-500 mt-1">
                PNG, JPG, GIF up to 10MB
              </p>
            </div>
            
            <div v-else class="relative">
              <img
                :src="referenceImagePreview"
                alt="Reference preview"
                class="max-h-32 mx-auto rounded"
              />
              <button
                @click.stop="clearReferenceImage"
                class="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                title="Remove image"
              >
                <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
              </button>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
                {{ referenceImageFile?.name }}
              </p>
            </div>
          </div>
          <template #description>
            <span class="text-xs text-gray-500">
              Optional: Upload a reference image for style guidance
            </span>
          </template>
        </UFormField>

        <UAlert color="blue" variant="soft">
          <template #title>Processing Time</template>
          <template #description>
            AI video editing typically takes 2-5 minutes. The edited clip will replace the original in your timeline.
          </template>
        </UAlert>

        <!-- Example prompts -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Example prompts:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="example in examplePrompts"
              :key="example"
              @click="editPrompt = example"
              class="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              {{ example }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton 
          variant="ghost" 
          @click="close"
          :disabled="isProcessing"
        >
          Cancel
        </UButton>
        <UButton
          color="purple"
          :disabled="!editPrompt.trim() || isProcessing"
          :loading="isProcessing"
          @click="handleSubmit"
        >
          <UIcon v-if="!isProcessing" name="i-heroicons-sparkles" class="mr-2" />
          {{ isProcessing ? 'Processing...' : 'Edit Video' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface EditorClip {
  id: string
  videoId: string
  sourceUrl: string
  originalDuration: number
  startOffset: number
  endOffset: number
  inTimelineStart: number
  name: string
  file?: File
}

const props = defineProps<{
  clip: EditorClip | null
  isProcessing?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [data: { clip: EditorClip; prompt: string; referenceImageFile?: File }]
}>()

const isOpen = defineModel<boolean>('open', { required: true })
const editPrompt = ref('')
const referenceImageFile = ref<File | null>(null)
const referenceImagePreview = ref<string>('')
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement>()

const examplePrompts = [
  'add dramatic rain and lightning',
  'change to sunset lighting',
  'remove background people',
  'add falling snow',
  'make it look like a vintage film',
  'add fog and mist',
]

const clipDuration = computed(() => {
  if (!props.clip) return 0
  return props.clip.originalDuration - props.clip.startOffset - props.clip.endOffset
})

const formatDuration = (seconds: number) => {
  return `${seconds.toFixed(1)}s`
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processFile(file)
  }
}

const handleFileDrop = (event: DragEvent) => {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    processFile(file)
  }
}

const processFile = (file: File) => {
  if (file.size > 10 * 1024 * 1024) {
    // 10MB limit
    alert('File size must be less than 10MB')
    return
  }
  
  referenceImageFile.value = file
  
  // Create preview
  const reader = new FileReader()
  reader.onload = (e) => {
    referenceImagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const clearReferenceImage = () => {
  referenceImageFile.value = null
  referenceImagePreview.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const close = () => {
  if (props.isProcessing) return // Prevent closing while processing
  isOpen.value = false
  emit('close')
}

const handleSubmit = () => {
  if (!props.clip || !editPrompt.value.trim() || props.isProcessing) return
  
  emit('submit', {
    clip: props.clip,
    prompt: editPrompt.value.trim(),
    referenceImageFile: referenceImageFile.value || undefined,
  })
}

watch(isOpen, (open) => {
  if (!open) {
    editPrompt.value = ''
    clearReferenceImage()
  }
})
</script>








