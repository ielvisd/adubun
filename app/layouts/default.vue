<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <!-- Header - Minimalist Mendo Style -->
    <header class="w-full border-b-2 border-brand-blue-light/20 dark:border-brand-cream/20 bg-gradient-to-r from-brand-cream/30 via-white to-brand-blue-light/20 dark:from-brand-blue-dark dark:via-brand-blue-dark/95 dark:to-brand-blue-dark sticky top-0 z-50 backdrop-blur-sm">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="py-4 sm:py-5 flex justify-between items-center">
          <NuxtLink to="/" class="flex items-center gap-2">
            <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-blue-dark dark:text-brand-cream uppercase tracking-tight">ADUBUN</h1>
          </NuxtLink>
          <nav class="flex gap-4 sm:gap-6 items-center">
            <UButton to="/" variant="ghost" color="gray" class="text-brand-blue-dark hover:text-brand-blue-light dark:text-secondary dark:hover:text-brand-cream text-sm sm:text-base font-medium hidden sm:inline-flex">Home</UButton>
            <UButton to="/history" variant="ghost" color="gray" class="text-brand-blue-dark hover:text-brand-blue-light dark:text-secondary dark:hover:text-brand-cream text-sm sm:text-base font-medium hidden sm:inline-flex">History</UButton>
            <UButton 
              to="/editor" 
              variant="ghost" 
              color="gray" 
              class="text-brand-blue-dark hover:text-brand-blue-light dark:text-secondary dark:hover:text-brand-cream text-sm sm:text-base font-medium hidden sm:inline-flex"
            >
              Editor
            </UButton>
            <UButton 
              to="/frame-match" 
              variant="ghost" 
              color="gray" 
              class="text-brand-blue-dark hover:text-brand-blue-light dark:text-secondary dark:hover:text-brand-cream text-sm sm:text-base font-medium hidden md:inline-flex"
            >
              Frame Match
            </UButton>
            <ColorModeButton />
            <UButton 
              to="/generate" 
              variant="solid"
              class="!bg-brand-blue-dark hover:!bg-brand-blue-light !text-white dark:!bg-brand-blue-dark dark:hover:!bg-brand-blue-light dark:!text-brand-cream font-semibold text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg transition-all duration-300 shadow-lg"
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
    <footer class="w-full bg-gradient-to-br from-brand-blue-dark to-brand-blue-dark/90 dark:from-brand-blue-dark dark:to-brand-blue-dark/90 text-white py-8 sm:py-10 md:py-12">
      <UContainer class="max-w-7xl px-4 sm:px-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-[#FFDA9B]">Platform</h3>
            <ul class="space-y-2 text-[#8FABD4] text-sm sm:text-base">
              <li><NuxtLink to="/" class="hover:text-[#FFDA9B] transition-colors">Home</NuxtLink></li>
              <li><NuxtLink to="/generate" class="hover:text-[#FFDA9B] transition-colors">Generate</NuxtLink></li>
              <li><NuxtLink to="/history" class="hover:text-[#FFDA9B] transition-colors">History</NuxtLink></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-[#FFDA9B]">Resources</h3>
            <ul class="space-y-2 text-[#8FABD4] text-sm sm:text-base">
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">Documentation</a></li>
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">API Reference</a></li>
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-[#FFDA9B]">Company</h3>
            <ul class="space-y-2 text-[#8FABD4] text-sm sm:text-base">
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">About</a></li>
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">Contact</a></li>
              <li><a href="#" class="hover:text-[#FFDA9B] transition-colors">Privacy</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-3 sm:mb-4 text-base sm:text-lg text-[#FFDA9B]">Connect</h3>
            <div class="flex gap-4 text-[#8FABD4] text-sm sm:text-base">
              <a href="#" class="hover:text-[#FFDA9B] transition-colors">Twitter</a>
              <a href="#" class="hover:text-[#FFDA9B] transition-colors">LinkedIn</a>
              <a href="#" class="hover:text-[#FFDA9B] transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div class="border-t border-[#FFDA9B]/20 pt-6 sm:pt-8 text-center text-[#8FABD4] text-xs sm:text-sm">
          <p>© AdUbun 2025, all rights reserved</p>
        </div>
      </UContainer>
    </footer>
  </div>
</template>

