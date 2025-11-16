<template>
  <ClientOnly>
    <UButton
      :icon="colorModeIcon"
      variant="ghost"
      color="gray"
      :aria-label="colorModeLabel"
      class="text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white"
      @click="toggleColorMode"
    />
    <template #fallback>
      <UButton
        icon="i-heroicons-moon"
        variant="ghost"
        color="gray"
        aria-label="Color mode toggle"
        class="text-gray-700 hover:text-black"
      />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
const colorMode = useColorMode()

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

