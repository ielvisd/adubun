// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-15',
  
  srcDir: 'app',
  
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxt/fonts',
    '@nuxt/image',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
  ],

  colorMode: {
    preference: 'system', // default value of $colorMode.preference
    fallback: 'light', // fallback value if no preference is stored
    hid: 'nuxt-color-mode-script',
    globalName: '__NUXT_COLOR_MODE__',
    componentName: 'ColorScheme',
    classPrefix: '',
    classSuffix: '',
    storageKey: 'nuxt-color-mode',
  },

  fonts: {
    families: [
      { name: 'Nunito Sans', provider: 'google', weights: [400, 500, 600, 700] },
    ],
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Private keys (server-only)
    replicateApiKey: process.env.REPLICATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    // AWS S3 credentials (server-only)
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION,
    awsS3BucketName: process.env.AWS_S3_BUCKET_NAME,
    awsS3PublicAccess: process.env.AWS_S3_PUBLIC_ACCESS,
    
    // Public keys (client-accessible)
    public: {
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      // Firebase config (public)
      firebaseApiKey: process.env.FIREBASE_API_KEY || '',
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      firebaseAppId: process.env.FIREBASE_APP_ID || '',
    },
  },

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: false,
    head: {
      title: 'AdUbun - AI Video Generation',
      meta: [
        { name: 'description', content: 'Transform prompts into professional ad videos with AI' },
        { name: 'theme-color', content: '#000000' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'AdUbun' },
      ],
      link: [
        // PWA Manifest
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // SVG favicon (modern browsers)
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // PNG favicon (fallback)
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        // ICO favicon (older browsers)
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        // Apple touch icon (iOS devices)
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },

  devtools: { 
    enabled: true,
  },
  typescript: { strict: true },
  
  vite: {
    server: {
      watch: {
        ignored: ['**/.nuxt/**', '**/.nuxt'],
      },
    },
  },
  
  router: {
    options: {
      // Ignore service worker requests to prevent router warnings
      strict: false,
    },
  },
  
  image: {
    // Use IPX as the default provider for optimization
    providers: {
      ipx: {
        maxAge: 60 * 60 * 24 * 7, // 7 days
      },
    },
    // Allow external domains for image optimization
    domains: [
      'source.unsplash.com',
      'unsplash.com',
      'images.unsplash.com',
      'lh3.googleusercontent.com',
      'googleusercontent.com',
      'encrypted-tbn0.gstatic.com',
      'encrypted-tbn1.gstatic.com',
      'encrypted-tbn2.gstatic.com',
      'encrypted-tbn3.gstatic.com',
    ],
    // Default quality and format settings
    quality: 80,
    format: ['webp', 'avif'],
    // Responsive breakpoints
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    strategies: 'generateSW',
    manifest: {
      name: 'AdUbun - AI Video Generation',
      short_name: 'AdUbun',
      description: 'Transform prompts into professional ad videos with AI',
      theme_color: '#000000',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      lang: 'en',
      icons: [
        {
          src: '/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any',
        },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,webp,woff,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          urlPattern: /^https:\/\/.*\.(?:jpg|jpeg|png|gif|webp|svg|ico|woff|woff2)\.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images-cache',
            expiration: {
              maxEntries: 60,
              maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            },
          },
        },
        {
          urlPattern: /^https:\/\/.*\.(?:mp4|webm|mov)\.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'videos-cache',
            expiration: {
              maxEntries: 20,
              maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            },
          },
        },
        {
          urlPattern: /\/api\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 10,
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 5, // 5 minutes
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          urlPattern: /^https:\/\/.*\.(?:js|css)\.*/i,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'static-resources',
          },
        },
      ],
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 20,
    },
    devOptions: {
      enabled: false, // Disable PWA in dev to avoid service worker file errors
      suppressWarnings: true,
      navigateFallback: '/',
      navigateFallbackAllowlist: [/^\/$/],
      type: 'module',
    },
  },
})