import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth'
import { getAuthInstance } from '~/utils/firebase'
import { getCurrentInstance } from 'vue'

export const useAuth = () => {
  const user = useState<User | null>('firebase-user', () => null)
  const loading = useState<boolean>('auth-loading', () => true)
  const error = useState<string | null>('auth-error', () => null)

  // Demo login for development
  const demoLogin = async () => {
    if (process.dev) {
      // In dev mode, set a mock user (works even if Firebase isn't configured)
      user.value = {
        uid: 'demo-user-id',
        email: 'demo@adubun.com',
        emailVerified: true,
        displayName: 'Demo User',
      } as User
      loading.value = false
      return { user: user.value, error: null }
    }
    throw new Error('Demo login only available in development mode')
  }

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      error.value = null
      const authInstance = getAuthInstance()
      const userCredential = await signInWithEmailAndPassword(authInstance, email, password)
      user.value = userCredential.user
      return { user: userCredential.user, error: null }
    } catch (err: any) {
      // Provide more helpful error messages
      let errorMessage = err.message || 'Failed to sign in'
      
      if (err.code === 'auth/configuration-not-found') {
        errorMessage = 'Firebase configuration error. Please check your .env file and restart the dev server.'
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/Password authentication is not enabled in Firebase Console.'
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.'
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.'
      }
      
      error.value = errorMessage
      console.error('[useAuth] Sign in error:', err.code, err.message)
      return { user: null, error: error.value }
    }
  }

  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    try {
      error.value = null
      const authInstance = getAuthInstance()
      const userCredential = await createUserWithEmailAndPassword(authInstance, email, password)
      user.value = userCredential.user
      return { user: userCredential.user, error: null }
    } catch (err: any) {
      // Provide more helpful error messages
      let errorMessage = err.message || 'Failed to sign up'
      
      if (err.code === 'auth/configuration-not-found') {
        errorMessage = 'Firebase configuration error. Please check your .env file and restart the dev server.'
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/Password authentication is not enabled in Firebase Console. Please enable it in Authentication > Sign-in method.'
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.'
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.'
      }
      
      error.value = errorMessage
      console.error('[useAuth] Sign up error:', err.code, err.message)
      return { user: null, error: error.value }
    }
  }

  // Sign out
  const logout = async () => {
    try {
      const authInstance = getAuthInstance()
      await signOut(authInstance)
      user.value = null
      return { error: null }
    } catch (err: any) {
      error.value = err.message || 'Failed to sign out'
      return { error: error.value }
    }
  }

  // Watch auth state (only if Firebase is configured)
  // Only use lifecycle hooks if we're in a component context
  if (process.client) {
    const instance = getCurrentInstance()
    if (instance) {
      // We're in a component, safe to use lifecycle hooks
      onMounted(() => {
        loading.value = true
        try {
          const authInstance = getAuthInstance()
          const unsubscribe = onAuthStateChanged(authInstance, (firebaseUser) => {
            user.value = firebaseUser
            loading.value = false
          })
          onUnmounted(() => {
            unsubscribe()
          })
        } catch (err: any) {
          // If Firebase isn't configured, just set loading to false
          // Demo login will still work
          console.warn('[useAuth] Firebase not configured, using demo mode only:', err.message)
          loading.value = false
        }
      })
    } else {
      // Not in a component context (e.g., middleware), initialize auth directly
      // This will be called synchronously, so we need to handle it differently
      loading.value = true
      try {
        const authInstance = getAuthInstance()
        onAuthStateChanged(authInstance, (firebaseUser) => {
          user.value = firebaseUser
          loading.value = false
        })
      } catch (err: any) {
        console.warn('[useAuth] Firebase not configured, using demo mode only:', err.message)
        loading.value = false
      }
    }
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    error: readonly(error),
    signIn,
    signUp,
    logout,
    demoLogin,
  }
}


