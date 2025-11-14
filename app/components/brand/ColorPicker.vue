<template>
  <UFormField label="Brand Color" name="color">
    <div class="flex gap-2">
      <input
        v-model="selectedColor"
        type="color"
        class="w-16 h-10 rounded border"
        @change="handleColorChange"
      />
      <UInput
        v-model="selectedColor"
        placeholder="#134686"
        class="flex-1"
        @input="handleColorChange"
      />
    </div>
    <p class="text-xs text-gray-500 mt-1">
      Select your brand's primary color
    </p>
  </UFormField>
</template>

<script setup lang="ts">
const selectedColor = ref('#134686')

const emit = defineEmits<{
  change: [color: string]
}>()

const handleColorChange = () => {
  emit('change', selectedColor.value)
}
</script>

