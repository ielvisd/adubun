import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import type { FirebaseOptions } from 'firebase/app'

let app: FirebaseApp | null = null
let authInstance: Auth | null = null

function getFirebaseApp(): FirebaseApp {
  if (app) {
    return app
  }

  // Get config inside function to ensure it's called in Nuxt context
  const config = useRuntimeConfig()

  const firebaseConfig: FirebaseOptions = {
    apiKey: config.public.firebaseApiKey,
    authDomain: config.public.firebaseAuthDomain,
    projectId: config.public.firebaseProjectId,
    storageBucket: config.public.firebaseStorageBucket,
    messagingSenderId: config.public.firebaseMessagingSenderId,
    appId: config.public.firebaseAppId,
  }

  // Validate that all required config values are present
  const missingFields: string[] = []
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === '') missingFields.push('FIREBASE_API_KEY')
  if (!firebaseConfig.authDomain || firebaseConfig.authDomain === '') missingFields.push('FIREBASE_AUTH_DOMAIN')
  if (!firebaseConfig.projectId || firebaseConfig.projectId === '') missingFields.push('FIREBASE_PROJECT_ID')
  if (!firebaseConfig.storageBucket || firebaseConfig.storageBucket === '') missingFields.push('FIREBASE_STORAGE_BUCKET')
  if (!firebaseConfig.messagingSenderId || firebaseConfig.messagingSenderId === '') missingFields.push('FIREBASE_MESSAGING_SENDER_ID')
  if (!firebaseConfig.appId || firebaseConfig.appId === '') missingFields.push('FIREBASE_APP_ID')

  if (missingFields.length > 0) {
    const errorMessage = `Firebase configuration is missing. Please set the following environment variables in your .env file:\n${missingFields.join('\n')}\n\nGet these values from Firebase Console > Project Settings > Your apps > Web app config`
    console.error('[Firebase]', errorMessage)
    throw new Error(errorMessage)
  }

  // Initialize Firebase
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig)
  } else {
    app = getApps()[0]
  }

  return app
}

function getFirebaseAuth(): Auth {
  if (authInstance) {
    return authInstance
  }

  const firebaseApp = getFirebaseApp()
  authInstance = getAuth(firebaseApp)
  return authInstance
}

// Export functions that initialize lazily
export const getAuthInstance = () => getFirebaseAuth()
export const getAppInstance = () => getFirebaseApp()

// Export auth as a getter function for backward compatibility
export const auth = getFirebaseAuth

export default getFirebaseApp


