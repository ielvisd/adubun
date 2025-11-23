<template>
  <div class="space-y-4">
    <!-- Quick Price Buttons -->
    <div class="grid grid-cols-4 gap-3">
      <button
        v-for="price in quickPrices"
        :key="price"
        :class="[
          'px-4 py-3 rounded-lg border-2 font-semibold transition-all',
          'text-gray-900 dark:text-white',
          modelValue === price
            ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 text-secondary-700 dark:text-secondary-300'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800',
          'active:scale-95',
        ]"
        @click="handlePriceSelect(price)"
      >
        ${{ price }}
      </button>
    </div>

    <!-- Custom Price Input -->
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Or enter custom price
      </label>
      <UInput
        :model-value="customPrice"
        type="number"
        placeholder="e.g., 25"
        :min="1"
        :max="999"
        class="w-full"
        @update:model-value="handleCustomPrice"
        @blur="handleCustomPriceBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

const quickPrices = [19, 27, 34, 39]
const customPrice = ref<string>('')

const handlePriceSelect = (price: number) => {
  customPrice.value = ''
  emit('update:modelValue', price)
}

const handleCustomPrice = (value: string) => {
  customPrice.value = value
  const numValue = parseInt(value, 10)
  if (!isNaN(numValue) && numValue > 0) {
    emit('update:modelValue', numValue)
  } else if (value === '') {
    emit('update:modelValue', null)
  }
}

const handleCustomPriceBlur = () => {
  if (customPrice.value && props.modelValue) {
    // Keep the custom price if it's valid
    return
  }
  // If no valid price, clear custom input
  if (!props.modelValue) {
    customPrice.value = ''
  }
}

// Watch for external changes to modelValue (e.g., from quick buttons)
watch(() => props.modelValue, (newValue) => {
  if (newValue && !quickPrices.includes(newValue)) {
    customPrice.value = newValue.toString()
  } else if (newValue && quickPrices.includes(newValue)) {
    customPrice.value = ''
  }
})
</script>


