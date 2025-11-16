export default defineNuxtPlugin({
  name: 'auto-animate-ssr',
  enforce: 'pre', // Run early to ensure directive is available during SSR
  setup(nuxtApp) {
    // Register a no-op directive for SSR to prevent warnings
    // Include all lifecycle hooks to match the real directive interface
    nuxtApp.vueApp.directive('auto-animate', {
      created: () => {},
      beforeMount: () => {},
      mounted: () => {},
      beforeUpdate: () => {},
      updated: () => {},
      beforeUnmount: () => {},
      unmounted: () => {},
      getSSRProps: () => ({}),
    })
  },
})

