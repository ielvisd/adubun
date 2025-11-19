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
        // Brand Palette
        primary: {
          DEFAULT: '#4A70A9', // Dark Blue
          50: '#f4f7fb',
          100: '#e8eff6',
          200: '#c5d8eb',
          300: '#a3c0e0',
          400: '#8fabd4', // Light Blue reference
          500: '#4A70A9', // Dark Blue DEFAULT
          600: '#385a8a',
          700: '#2e486e',
          800: '#263b59',
          900: '#233248',
        },
        secondary: {
          DEFAULT: '#8FABD4', // Light Blue
          50: '#f4f8fc',
          100: '#e8f1f8',
          200: '#c5dced',
          300: '#a2c7e2',
          400: '#8FABD4', // Light Blue DEFAULT
          500: '#6a8fb8',
          600: '#4f739c',
          700: '#405d80',
          800: '#364d68',
          900: '#2e4056',
        },
        accent: {
          DEFAULT: '#E8C8A7', // Cream
          50: '#fcfaf7',
          100: '#f9f4ee',
          200: '#f3e5d5',
          300: '#edd6bd',
          400: '#E8C8A7', // Cream DEFAULT
          500: '#deae82',
          600: '#d4955d',
          700: '#c97d3d',
          800: '#a86630',
          900: '#885328',
        },
        // Brand specific colors
        'brand-cream': {
          DEFAULT: '#E8C8A7',
          50: '#fcfaf7',
          100: '#f9f4ee',
          200: '#f3e5d5',
          300: '#edd6bd',
          400: '#E8C8A7',
          500: '#deae82',
          600: '#d4955d',
          700: '#c97d3d',
          800: '#a86630',
          900: '#885328',
        },
        'brand-blue-light': {
          DEFAULT: '#8FABD4',
        },
        'brand-blue-dark': {
          DEFAULT: '#4A70A9',
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
        sans: ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', ...defaultTheme.fontFamily.sans],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

