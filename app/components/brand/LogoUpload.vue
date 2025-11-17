<template>
  <UFormField label="Upload Logo" name="logo">
    <div class="border-2 border-dashed border-primary-300 rounded-lg p-6 text-center bg-gray-50 dark:bg-gray-800">
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleFileChange"
      />
      <UIcon name="i-heroicons-photo" class="w-12 h-12 mx-auto text-gray-400 mb-2" />
      <p class="text-sm text-gray-500 mb-2">
        Click to upload or drag and drop
      </p>
      <UButton variant="outline" color="primary" @click="fileInput?.click()">
        Select File
      </UButton>
      <div v-if="preview" class="mt-4">
        <img :src="preview" alt="Logo preview" class="max-h-32 mx-auto rounded" />
      </div>
    </div>
  </UFormField>
</template>

<script setup lang="ts">
const fileInput = ref<HTMLInputElement>()
const preview = ref<string>()

const emit = defineEmits<{
  upload: [file: File]
}>()

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      preview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
    emit('upload', file)
  }
}
</script>

