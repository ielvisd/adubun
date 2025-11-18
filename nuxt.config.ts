// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-15',
  
  srcDir: 'app',
  
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxt/fonts',
    '@nuxt/image',
    '@nuxtjs/color-mode',
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
      { name: 'Poppins', provider: 'google', weights: [400, 500, 600, 700] },
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
    layoutTransition: { name: 'layout', mode: 'out-in' },
    head: {
      title: 'AdUbun - AI Video Generation',
      meta: [
        { name: 'description', content: 'Transform prompts into professional ad videos with AI' },
      ],
      link: [
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

  devtools: { enabled: true },
  typescript: { strict: true },
  
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
})
