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
        // Primary brand color (Black) - Mendo-inspired minimalist
        primary: {
          DEFAULT: '#000000',
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#d4d4d4',
          300: '#a3a3a3',
          400: '#737373',
          500: '#000000',
          600: '#000000',
          700: '#000000',
          800: '#000000',
          900: '#000000',
        },
        // Secondary brand color (Black for CTAs) - Mendo style
        secondary: {
          DEFAULT: '#000000',
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#d4d4d4',
          300: '#a3a3a3',
          400: '#737373',
          500: '#000000',
          600: '#000000',
          700: '#000000',
          800: '#000000',
          900: '#000000',
        },
        // Accent brand color (Black) - Mendo minimalist
        accent: {
          DEFAULT: '#000000',
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#d4d4d4',
          300: '#a3a3a3',
          400: '#737373',
          500: '#000000',
          600: '#000000',
          700: '#000000',
          800: '#000000',
          900: '#000000',
        },
        // Light Blue - for hero right section (Mendo style)
        'light-blue': {
          DEFAULT: '#E8F0F5',
          50: '#f0f7fa',
          100: '#E8F0F5',
          200: '#d0e0eb',
          300: '#b8d0e1',
          400: '#a0c0d7',
          500: '#E8F0F5',
          600: '#88b0cd',
          700: '#70a0c3',
          800: '#5890b9',
          900: '#4080af',
        },
        // Bright Green - for footer (Mendo style)
        'mendo-green': {
          DEFAULT: '#00FF88',
          50: '#e6fff5',
          100: '#ccffeb',
          200: '#99ffd7',
          300: '#66ffc3',
          400: '#33ffaf',
          500: '#00FF88',
          600: '#00cc6d',
          700: '#009952',
          800: '#006638',
          900: '#00331d',
        },
        // Light Grey - for backgrounds
        'light-grey': {
          DEFAULT: '#F5F5F5',
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#f0f0f0',
          300: '#EEEEEE',
          400: '#e0e0e0',
          500: '#F5F5F5',
          600: '#d5d5d5',
          700: '#bcbcbc',
          800: '#a3a3a3',
          900: '#8a8a8a',
        },
        // Success (Green) - for success states
        success: {
          DEFAULT: '#22c55e',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Error (Red) - for error states
        error: {
          DEFAULT: '#dc2626',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#dc2626',
          600: '#b91c1c',
          700: '#991b1b',
          800: '#7f1d1d',
          900: '#6b1d1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', ...defaultTheme.fontFamily.sans],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

