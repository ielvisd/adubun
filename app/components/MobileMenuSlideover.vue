<template>
  <USlideover 
    v-model:open="mobileMenuOpen" 
    side="right" 
    :portal="true"
    aria-label="Navigation menu"
  >
    <template #header>
      <div class="flex items-center justify-between bg-mendo-cream dark:bg-mendo-black">
        <h2 id="mobile-menu-title" class="text-xl font-bold text-mendo-black dark:text-mendo-white">Menu</h2>
      </div>
    </template>
    <template #body>
      <div class="bg-mendo-cream dark:bg-mendo-black h-full">
        <nav class="flex flex-col gap-2">
        <UButton
          to="/"
          variant="ghost"
          color="gray"
          class="w-full justify-start text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-base font-medium"
          @click="mobileMenuOpen = false"
        >
          Home
        </UButton>
        <UButton
          to="/history"
          variant="ghost"
          color="gray"
          class="w-full justify-start text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-base font-medium"
          @click="mobileMenuOpen = false"
        >
          History
        </UButton>
        <UButton
          to="/editor"
          variant="ghost"
          color="gray"
          class="w-full justify-start text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-base font-medium"
          @click="mobileMenuOpen = false"
        >
          Editor
        </UButton>
        <UButton
          to="/frame-match"
          variant="ghost"
          color="gray"
          class="w-full justify-start text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-base font-medium"
          @click="mobileMenuOpen = false"
        >
          Frame Match
        </UButton>
      </nav>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
const mobileMenuOpen = useState('mobileMenuOpen', () => false)

// Close menu on ESC key press
const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && mobileMenuOpen.value) {
    mobileMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped>
/* Target the slideover panel to limit width and apply theme colors */
:deep([data-headlessui-state]),
:deep(.fixed.right-0),
:deep(.fixed.left-0) {
  max-width: 20rem !important;
  width: 20rem !important;
}

/* Apply theme color background to the slideover panel */
:deep([data-headlessui-state] > div),
:deep(.fixed.right-0 > div),
:deep(.fixed.left-0 > div) {
  background-color: var(--mendo-cream) !important;
}

.dark :deep([data-headlessui-state] > div),
.dark :deep(.fixed.right-0 > div),
.dark :deep(.fixed.left-0 > div) {
  background-color: var(--mendo-black) !important;
}
</style>

