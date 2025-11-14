// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-11-13',
  
  srcDir: 'app',
  
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxt/fonts',
  ],

  fonts: {
    families: [
      { name: 'Nunito', provider: 'google' },
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
    },
  },

  app: {
    head: {
      title: 'AdUbun - AI Video Generation',
      meta: [
        { name: 'description', content: 'Transform prompts into professional ad videos with AI' },
      ],
    },
  },

  devtools: { enabled: true },
  typescript: { strict: true },
})
