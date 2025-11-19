<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <!-- Top Black Bar - Mendo Style -->
    <div class="w-full bg-black text-white py-2 text-center text-xs sm:text-sm uppercase tracking-wide">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <span>AI-Powered Video Generation in Minutes</span>
      </UContainer>
    </div>
    
    <!-- Header - Minimalist Mendo Style -->
    <header class="w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50 backdrop-blur-sm bg-white/95 dark:bg-gray-900/95">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="py-4 sm:py-5 flex justify-between items-center">
          <NuxtLink to="/" class="flex items-center gap-2">
            <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-black dark:text-white uppercase tracking-tight">ADUBUN</h1>
          </NuxtLink>
          <nav class="flex gap-4 sm:gap-6 items-center">
            <UButton to="/" variant="ghost" color="gray" class="text-black hover:text-gray-700 dark:text-white dark:hover:text-gray-300 text-sm sm:text-base font-medium hidden sm:inline-flex">Home</UButton>
            <UButton to="/history" variant="ghost" color="gray" class="text-black hover:text-gray-700 dark:text-white dark:hover:text-gray-300 text-sm sm:text-base font-medium hidden sm:inline-flex">History</UButton>
            <UButton 
              to="/editor" 
              variant="ghost" 
              color="gray" 
              class="text-black hover:text-gray-700 dark:text-white dark:hover:text-gray-300 text-sm sm:text-base font-medium hidden sm:inline-flex"
            >
              Editor
            </UButton>
            <UButton 
              to="/frame-match" 
              variant="ghost" 
              color="gray" 
              class="text-black hover:text-gray-700 dark:text-white dark:hover:text-gray-300 text-sm sm:text-base font-medium hidden md:inline-flex"
            >
              Frame Match
            </UButton>
            <ColorModeButton />
            <UButton 
              to="/generate" 
              variant="solid"
              class="bg-brand-blue-dark hover:bg-brand-blue-light text-white font-semibold text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-2.5 rounded-none transition-colors duration-300"
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

    <!-- Footer - Professional Dark Blue -->
    <footer class="w-full bg-brand-blue-dark text-white py-8 sm:py-10 md:py-12">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-white">Platform</h3>
            <ul class="space-y-2 text-gray-200 text-sm sm:text-base">
              <li><NuxtLink to="/" class="hover:text-white transition-colors">Home</NuxtLink></li>
              <li><NuxtLink to="/generate" class="hover:text-white transition-colors">Generate</NuxtLink></li>
              <li><NuxtLink to="/history" class="hover:text-white transition-colors">History</NuxtLink></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-white">Resources</h3>
            <ul class="space-y-2 text-gray-200 text-sm sm:text-base">
              <li><a href="#" class="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" class="hover:text-white transition-colors">API Reference</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-white">Company</h3>
            <ul class="space-y-2 text-gray-200 text-sm sm:text-base">
              <li><a href="#" class="hover:text-white transition-colors">About</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Privacy</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-white">Connect</h3>
            <div class="flex gap-4 text-gray-200 text-sm sm:text-base">
              <a href="#" class="hover:text-white transition-colors">Twitter</a>
              <a href="#" class="hover:text-white transition-colors">LinkedIn</a>
              <a href="#" class="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div class="border-t border-brand-blue-light/30 pt-6 sm:pt-8 text-center text-gray-300 text-xs sm:text-sm">
          <p>© AdUbun 2025, all rights reserved</p>
        </div>
      </UContainer>
    </footer>
  </div>
</template>

