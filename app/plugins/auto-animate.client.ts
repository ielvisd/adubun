export default defineNuxtPlugin((nuxtApp) => {
  // Dynamically import and register the real directive on client
  import('@formkit/auto-animate/vue').then(({ vAutoAnimate }) => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!prefersReducedMotion) {
      // Register the actual v-auto-animate directive
      nuxtApp.vueApp.directive('auto-animate', vAutoAnimate)
    } else {
      // Register no-op if user prefers reduced motion
      nuxtApp.vueApp.directive('auto-animate', {
        mounted: () => {},
        updated: () => {},
      })
    }
  }).catch(() => {
    // Fallback to no-op if import fails
    nuxtApp.vueApp.directive('auto-animate', {
      mounted: () => {},
      updated: () => {},
    })
  })
})

