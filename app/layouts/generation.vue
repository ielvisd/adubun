<template>
  <div class="min-h-screen bg-brand-cream">
    <UContainer>
      <header class="py-6 border-b border-primary-200 bg-white">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold gradient-text">AdUbun</h1>
          <UButton to="/" variant="ghost" color="primary">Cancel</UButton>
        </div>
      </header>

      <main class="py-8">
        <slot />
      </main>
    </UContainer>
  </div>
</template>

