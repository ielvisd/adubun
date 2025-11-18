<template>
  <div class="space-y-3">
    <div class="grid grid-cols-3 gap-3 sm:gap-4">
      <!-- Instagram Story / Vertical -->
      <button
        type="button"
        @click="select('9:16')"
        :class="[
          'format-card relative p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 text-center',
          modelValue === '9:16'
            ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 shadow-lg'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
        ]"
        :disabled="disabled"
      >
        <div class="flex flex-col items-center gap-2">
          <!-- Vertical Phone Icon -->
          <div class="w-8 h-12 sm:w-10 sm:h-14 rounded-lg border-2 border-current flex items-center justify-center"
               :class="modelValue === '9:16' ? 'text-secondary-600 dark:text-secondary-400' : 'text-gray-400'">
            <UIcon name="i-heroicons-device-phone-mobile" class="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p class="font-semibold text-sm sm:text-base" :class="modelValue === '9:16' ? 'text-secondary-700 dark:text-secondary-300' : 'text-gray-900 dark:text-white'">
              Instagram Story
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Vertical (9:16)</p>
          </div>
        </div>
        <div v-if="modelValue === '9:16'" class="absolute top-2 right-2">
          <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-secondary-500" />
        </div>
      </button>

      <!-- YouTube / Horizontal -->
      <button
        type="button"
        @click="select('16:9')"
        :class="[
          'format-card relative p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 text-center',
          modelValue === '16:9'
            ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 shadow-lg'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
        ]"
        :disabled="disabled"
      >
        <div class="flex flex-col items-center gap-2">
          <!-- Horizontal Monitor Icon -->
          <div class="w-12 h-8 sm:w-14 sm:h-10 rounded-lg border-2 border-current flex items-center justify-center"
               :class="modelValue === '16:9' ? 'text-secondary-600 dark:text-secondary-400' : 'text-gray-400'">
            <UIcon name="i-heroicons-computer-desktop" class="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p class="font-semibold text-sm sm:text-base" :class="modelValue === '16:9' ? 'text-secondary-700 dark:text-secondary-300' : 'text-gray-900 dark:text-white'">
              YouTube
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Horizontal (16:9)</p>
          </div>
        </div>
        <div v-if="modelValue === '16:9'" class="absolute top-2 right-2">
          <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-secondary-500" />
        </div>
      </button>

      <!-- Instagram Feed / Square -->
      <button
        type="button"
        @click="select('1:1')"
        :class="[
          'format-card relative p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 text-center',
          modelValue === '1:1'
            ? 'border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20 shadow-lg'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
        ]"
        :disabled="disabled"
      >
        <div class="flex flex-col items-center gap-2">
          <!-- Square Icon -->
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg border-2 border-current flex items-center justify-center"
               :class="modelValue === '1:1' ? 'text-secondary-600 dark:text-secondary-400' : 'text-gray-400'">
            <UIcon name="i-heroicons-square-3-stack-3d" class="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p class="font-semibold text-sm sm:text-base" :class="modelValue === '1:1' ? 'text-secondary-700 dark:text-secondary-300' : 'text-gray-900 dark:text-white'">
              Instagram Feed
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Square (1:1)</p>
          </div>
        </div>
        <div v-if="modelValue === '1:1'" class="absolute top-2 right-2">
          <UIcon name="i-heroicons-check-circle-solid" class="w-5 h-5 text-secondary-500" />
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: '16:9' | '9:16' | '1:1'
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: '16:9' | '9:16' | '1:1']
}>()

const select = (value: '16:9' | '9:16' | '1:1') => {
  if (!props.disabled) {
    emit('update:modelValue', value)
  }
}
</script>

