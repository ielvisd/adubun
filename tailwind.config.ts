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
    './server/**/*.ts', // Include server files that might use Tailwind classes
  ],
  theme: {
    extend: {
      colors: {
        // Letsignit-Inspired Color Palette
        letsignit: {
          black: '#000000',
          white: '#FFFFFF',
          red: {
            DEFAULT: '#E63946',
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#E63946',
            600: '#dc2626',
            700: '#b91c1c',
            800: '#991b1b',
            900: '#7f1d1d',
          },
          blue: {
            DEFAULT: '#457B9D',
            50: '#e8f4f8',
            100: '#c5e0ed',
            200: '#9bc9e0',
            300: '#6fb0d3',
            400: '#4d9bc9',
            500: '#457B9D',
            600: '#3a6b8a',
            700: '#2f5a77',
            800: '#244964',
            900: '#1a3851',
          },
          'light-yellow': '#FFF9E6',
          'light-pink': '#FFE5E5',
          'light-blue': '#A8DADC',
          'light-purple': '#F0E6FF',
          'light-teal': '#E0F7FA',
          gray: '#F5F5F5',
        },
        // Primary brand color (Blue) - mapped to primary
        primary: {
          DEFAULT: '#457B9D',
          50: '#e8f4f8',
          100: '#c5e0ed',
          200: '#9bc9e0',
          300: '#6fb0d3',
          400: '#4d9bc9',
          500: '#457B9D',
          600: '#3a6b8a',
          700: '#2f5a77',
          800: '#244964',
          900: '#1a3851',
        },
        // Secondary brand color (Red) - for CTAs
        secondary: {
          DEFAULT: '#E63946',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#E63946',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // Accent brand color (Red) - same as secondary for consistency
        accent: {
          DEFAULT: '#E63946',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#E63946',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // Success (Green) - for success states
        success: {
          DEFAULT: '#10b981',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Error (Red) - for error states
        error: {
          DEFAULT: '#ef4444',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

