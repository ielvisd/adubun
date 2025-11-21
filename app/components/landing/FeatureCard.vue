<template>
  <div class="bg-mendo-light-grey dark:bg-white/5 rounded-2xl p-8 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
    <div class="text-4xl mb-4">{{ icon }}</div>
    <h3 class="text-xl font-bold mb-2 text-mendo-black dark:text-mendo-cream">{{ title }}</h3>
    <p class="text-gray-600 dark:text-gray-400">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  icon: string
  title: string
  description: string
}

defineProps<Props>()
</script>

