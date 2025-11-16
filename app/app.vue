<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style>
/* Page Transitions - Metropolis Style */
.page-enter-active,
.page-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  filter: blur(0.5rem);
  transform: translateY(10px);
}

/* Layout Transitions */
.layout-enter-active,
.layout-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.layout-enter-from,
.layout-leave-to {
  opacity: 0;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active,
  .layout-enter-active,
  .layout-leave-active {
    transition: none;
  }
  
  .page-enter-from,
  .page-leave-to,
  .layout-enter-from,
  .layout-leave-to {
    opacity: 1;
    filter: none;
    transform: none;
  }
}
</style>
