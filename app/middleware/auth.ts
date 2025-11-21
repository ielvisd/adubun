export default defineNuxtRouteMiddleware((to, from) => {
  const { user, loading } = useAuth()

  // Allow access to auth pages without authentication
  if (to.path.startsWith('/auth/')) {
    return
  }

  // In dev mode, allow demo login bypass
  if (process.dev) {
    // Check if user is authenticated or if we're in dev mode
    // The demo login will set a mock user
    if (user.value || process.dev) {
      return
    }
  }

  // Wait for auth to load, then check
  if (loading.value) {
    // Wait a bit for auth to initialize
    return new Promise((resolve) => {
      const unwatch = watch(loading, (isLoading) => {
        if (!isLoading) {
          unwatch()
          if (!user.value && !process.dev) {
            // return navigateTo('/auth/login')
          }
          resolve(undefined)
        }
      })
      
      // Timeout after 2 seconds
      setTimeout(() => {
        unwatch()
        if (!user.value && !process.dev) {
          // return navigateTo('/auth/login')
        }
        resolve(undefined)
      }, 2000)
    })
  }

  // If not authenticated and not in dev mode, redirect to login
  // if (!user.value && !process.dev) {
  //   return navigateTo('/auth/login')
  // }
})


