import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: [
    './app/components/**/*.{js,vue,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/plugins/**/*.{js,ts}',
    './app/app.vue',
    './app/**/*.{js,vue,ts}',
    './server/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        'mendo-black': '#000000',
        'mendo-white': '#FFFFFF',
        'mendo-light-blue': '#E8F0F5',
        'mendo-light-grey': '#F5F5F5',
        'mendo-cream': '#E8C8A7',
        // Map legacy names to new colors to avoid breaking immediately, 
        // but we will replace usages in next steps.
        // 'brand-blue': '#000000', // broken mapping
        // 'brand-orange': '#E8C8A7', // broken mapping
      },
      fontFamily: {
        sans: ['Nunito Sans', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
} satisfies Config
