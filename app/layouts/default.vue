<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white transition-colors duration-300">
    <!-- Header -->
    <header class="w-full bg-mendo-white dark:bg-mendo-black border-b border-mendo-light-grey dark:border-white/10 sticky top-0 z-50 backdrop-blur-sm transition-colors duration-300">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="py-4 sm:py-5 flex justify-between items-center">
          <NuxtLink to="/" class="flex items-center gap-2 group">
            <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-mendo-black dark:text-mendo-white uppercase tracking-tight group-hover:opacity-80 transition-opacity">ADUBUN</h1>
          </NuxtLink>
          <nav class="flex gap-4 sm:gap-6 items-center">
            <UButton to="/" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium hidden sm:inline-flex">Home</UButton>
            <UButton to="/history" variant="ghost" color="gray" class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium hidden sm:inline-flex">History</UButton>
            <UButton 
              to="/editor" 
              variant="ghost" 
              color="gray" 
              class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium hidden sm:inline-flex"
            >
              Editor
            </UButton>
            <UButton 
              to="/frame-match" 
              variant="ghost" 
              color="gray" 
              class="text-mendo-black hover:bg-mendo-light-grey dark:text-mendo-white dark:hover:bg-white/10 text-sm sm:text-base font-medium hidden md:inline-flex"
            >
              Frame Match
            </UButton>
            <ColorModeButton />
            <UButton 
              to="/generate" 
              variant="solid"
              class="!bg-mendo-black hover:!opacity-90 !text-mendo-white dark:!bg-mendo-cream dark:!text-mendo-black font-semibold text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg transition-all duration-300 shadow-lg"
            >
              <span class="hidden sm:inline">Get Started</span>
              <span class="sm:hidden">Start</span>
            </UButton>
          </nav>
        </div>
      </UContainer>
    </header>

    <main>
      <slot />
    </main>

    <!-- Footer -->
    <footer class="w-full bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white py-8 sm:py-10 md:py-12 border-t border-gray-200 dark:border-white/10 transition-colors duration-300">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-mendo-black dark:text-mendo-cream">Platform</h3>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              <li><NuxtLink to="/" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Home</NuxtLink></li>
              <li><NuxtLink to="/generate" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Generate</NuxtLink></li>
              <li><NuxtLink to="/history" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">History</NuxtLink></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-mendo-black dark:text-mendo-cream">Resources</h3>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Documentation</a></li>
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">API Reference</a></li>
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-mendo-black dark:text-mendo-cream">Company</h3>
            <ul class="space-y-2 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">About</a></li>
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Contact</a></li>
              <li><a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Privacy</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-mendo-black dark:text-mendo-cream">Connect</h3>
            <div class="flex gap-4 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
              <a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">Twitter</a>
              <a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">LinkedIn</a>
              <a href="#" class="hover:text-mendo-black dark:hover:text-mendo-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div class="border-t border-gray-200 dark:border-white/10 pt-6 sm:pt-8 text-center text-gray-600 dark:text-gray-500 text-xs sm:text-sm">
          <p>© AdUbun 2025, all rights reserved</p>
        </div>
      </UContainer>
    </footer>
  </div>
</template>
