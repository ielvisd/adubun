<template>
  <div
    :class="cardClasses"
    @click="clickable && $emit('click', example)"
  >
    <div class="flex items-start justify-between mb-4">
      <div class="w-12 h-12 rounded-xl bg-mendo-white dark:bg-black flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform">
        {{ example.icon }}
      </div>
      <UIcon
        v-if="clickable"
        name="i-heroicons-arrow-up-right"
        class="w-5 h-5 text-gray-400 group-hover:text-mendo-black dark:group-hover:text-mendo-white transition-colors"
      />
    </div>
    
    <h3 class="font-bold text-xl text-mendo-black dark:text-mendo-white mb-2">{{ example.title }}</h3>
    <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">
      {{ example.description }}
    </p>
    
    <div class="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-500">
      <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.duration }}s</span>
      <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.aspectRatio }}</span>
      <span class="bg-white dark:bg-black px-2 py-1 rounded">{{ example.style }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Example {
  title: string
  description: string
  icon: string
  duration: number
  aspectRatio: string
  style: string
  prompt: string
  adType?: string
  [key: string]: any
}

interface Props {
  example: Example
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  clickable: true,
})

defineEmits<{
  click: [example: Example]
}>()

const cardClasses = computed(() => {
  const baseClasses = 'group bg-mendo-light-grey dark:bg-gray-900 rounded-2xl p-6 border border-transparent transition-all duration-300'
  const clickableClasses = props.clickable
    ? 'cursor-pointer hover:bg-white dark:hover:bg-gray-800 hover:shadow-xl hover:border-gray-200 dark:hover:border-gray-700'
    : ''
  return `${baseClasses} ${clickableClasses}`.trim()
})
</script>
