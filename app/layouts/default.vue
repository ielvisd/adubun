<template>
  <div class="min-h-screen bg-white">
    <!-- Header - Full Width -->
    <header class="w-full border-b border-gray-200 bg-white sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <UContainer class="max-w-7xl">
        <div class="py-4 flex justify-between items-center">
          <NuxtLink to="/" class="flex items-center gap-2">
            <h1 class="text-2xl font-bold text-black">AdUbun</h1>
          </NuxtLink>
          <nav class="flex gap-2 items-center">
            <UButton to="/" variant="ghost" color="gray" class="text-gray-700 hover:text-black">Home</UButton>
            <UButton to="/history" variant="ghost" color="gray" class="text-gray-700 hover:text-black">History</UButton>
            <UButton 
              to="/generate" 
              color="secondary" 
              variant="solid"
              class="bg-secondary-500 hover:bg-secondary-600 text-white font-semibold"
            >
              Get Started
            </UButton>
          </nav>
        </div>
      </UContainer>
    </header>

    <main>
      <slot />
    </main>

    <!-- Footer - Letsignit Style -->
    <footer class="w-full bg-black text-white py-12 mt-20">
      <UContainer class="max-w-7xl">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 class="font-semibold mb-4">Platform</h3>
            <ul class="space-y-2 text-gray-400">
              <li><NuxtLink to="/" class="hover:text-white transition-colors">Home</NuxtLink></li>
              <li><NuxtLink to="/generate" class="hover:text-white transition-colors">Generate</NuxtLink></li>
              <li><NuxtLink to="/history" class="hover:text-white transition-colors">History</NuxtLink></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Resources</h3>
            <ul class="space-y-2 text-gray-400">
              <li><a href="#" class="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" class="hover:text-white transition-colors">API Reference</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Company</h3>
            <ul class="space-y-2 text-gray-400">
              <li><a href="#" class="hover:text-white transition-colors">About</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Privacy</a></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Connect</h3>
            <div class="flex gap-4">
              <a href="#" class="text-gray-400 hover:text-white transition-colors">Twitter</a>
              <a href="#" class="text-gray-400 hover:text-white transition-colors">LinkedIn</a>
              <a href="#" class="text-gray-400 hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div class="border-t border-gray-800 pt-8 text-center text-gray-400 text-sm">
          <p>© AdUbun 2025, all rights reserved</p>
        </div>
      </UContainer>
    </footer>
  </div>
</template>

