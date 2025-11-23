<template>
  <UButton
    v-if="mounted"
    :icon="colorModeIcon"
    variant="ghost"
    color="neutral"
    :aria-label="colorModeLabel"
    class="text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white"
    @click="toggleColorMode"
  />
  <div v-else class="w-10 h-10" />
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
})

const colorModeIcon = computed(() => {
  return colorMode.value === 'dark' 
    ? 'i-heroicons-sun' 
    : 'i-heroicons-moon'
})

const colorModeLabel = computed(() => {
  return colorMode.value === 'dark'
    ? 'Switch to light mode'
    : 'Switch to dark mode'
})

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

