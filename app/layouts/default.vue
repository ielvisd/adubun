<template>
  <div class="min-h-screen bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white transition-colors duration-300">
    <!-- Header -->
    <LayoutAppHeader />

    <main>
      <slot />
    </main>

    <!-- Footer -->
    <LayoutAppFooter />

    <!-- Mobile Menu -->
    <MobileMenuSlideover />
  </div>
</template>
