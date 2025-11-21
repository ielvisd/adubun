<template>
  <div :class="['text-center mb-12', align === 'left' && 'text-left']">
    <h2 class="text-4xl md:text-5xl font-bold mb-6 text-mendo-black dark:text-mendo-white">
      {{ title }}
    </h2>
    <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl" :class="align === 'center' && 'mx-auto'">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  description: string
  align?: 'left' | 'center'
}

withDefaults(defineProps<Props>(), {
  align: 'center',
})
</script>

