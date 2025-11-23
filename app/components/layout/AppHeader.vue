<script setup lang="ts">
const mobileMenuOpen = useState('mobileMenuOpen', () => false)
</script>

<template>
  <header class="w-full bg-mendo-white dark:bg-mendo-black border-b border-mendo-light-grey dark:border-white/10 sticky top-0 z-50 backdrop-blur-sm transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
      <div class="py-4 sm:py-5 flex justify-between items-center">
        <NuxtLink to="/" class="flex items-center gap-2 group">
          <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-mendo-black dark:text-mendo-white uppercase tracking-tight group-hover:opacity-80 transition-opacity">ADUBUN</h1>
        </NuxtLink>
        <nav class="flex gap-4 sm:gap-6 items-center">
          <div class="hidden sm:flex gap-4 sm:gap-6 items-center">
            <UButton to="/" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium">Home</UButton>
            <UButton to="/history" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium">History</UButton>
            <UButton to="/editor" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium">Editor</UButton>
            <UButton to="/frame-match" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium hidden md:inline-flex">Frame Match</UButton>
          </div>
          <ClientOnly>
            <ColorModeButton />
            <template #fallback>
              <UButton
                icon="i-heroicons-moon"
                variant="ghost"
                color="gray"
                class="text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white"
                aria-label="Color mode"
              />
            </template>
          </ClientOnly>
          <UButton 
            to="/create" 
            variant="solid"
            class="!bg-mendo-black hover:!opacity-90 !text-mendo-white dark:!bg-mendo-cream dark:!text-mendo-black font-semibold text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg transition-all duration-300 shadow-lg"
          >
            <span class="hidden sm:inline">Get Started</span>
            <span class="sm:hidden">Start</span>
          </UButton>
          <UButton
            icon="i-heroicons-bars-3"
            variant="ghost"
            color="gray"
            class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 sm:hidden"
            @click="mobileMenuOpen = true"
            aria-label="Open menu"
          />
        </nav>
      </div>
    </div>
  </header>
</template>

