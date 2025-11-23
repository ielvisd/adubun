import type { Preview } from '@storybook/vue3'
import { ref, computed, h, defineComponent, getCurrentInstance } from 'vue'
// Import all necessary CSS - this includes Tailwind and Nuxt UI styles
import '../app/assets/css/main.css'

// Nuxt UI has Node.js dependencies (jiti, node:os, etc.) that don't work in browser/Storybook
// So we need to use mocks instead of importing the real package
// Create mock Nuxt UI components that match the API
// Export them so they can be imported in story files if needed
export const UButton = defineComponent({
  name: 'UButton',
  props: {
    to: [String, Object],
    variant: { type: String, default: 'solid' },
    color: { type: String, default: 'primary' },
    size: { type: String, default: 'md' },
    icon: String,
    loading: Boolean,
    disabled: Boolean,
    class: String,
  },
  setup(props, { slots, attrs }) {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
    const variantClasses = {
      solid: props.color === 'gray' 
        ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
        : 'bg-black text-white hover:opacity-90 dark:bg-gray-200 dark:text-black',
      ghost: props.color === 'gray'
        ? 'bg-transparent text-gray-700 hover:bg-gray-100/50 dark:text-gray-300 dark:hover:bg-white/10'
        : 'bg-transparent hover:bg-gray-100/50 dark:hover:bg-white/10',
      outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800 dark:text-gray-300',
    }
    const sizeClasses = {
      sm: 'px-2.5 py-1.5 text-sm',
      md: 'px-3 py-2 text-sm',
      lg: 'px-4 py-2.5 text-base',
      xl: 'px-6 py-3 text-lg',
    }
    const classes = `${baseClasses} ${variantClasses[props.variant as keyof typeof variantClasses] || variantClasses.solid} ${sizeClasses[props.size as keyof typeof sizeClasses] || sizeClasses.md} ${props.class || ''}`
    
    return () => {
      const iconElement = props.icon ? h('svg', {
        class: 'w-5 h-5',
        fill: 'none',
        stroke: 'currentColor',
        viewBox: '0 0 24 24',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true'
      }, [
        h('path', {
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: props.icon.includes('bars') 
            ? 'M4 6h16M4 12h16M4 18h16'
            : props.icon.includes('moon')
            ? 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
            : 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
        })
      ]) : null
      
      const slotContent = slots.default ? slots.default() : null
      const normalizedContent: any[] = []
      if (slotContent) {
        if (Array.isArray(slotContent)) {
          slotContent.forEach(item => {
            if (item != null && item !== '') {
              normalizedContent.push(item)
            }
          })
        } else if (slotContent !== null && slotContent !== '') {
          normalizedContent.push(slotContent)
        }
      }
      
      const content: any[] = []
      if (iconElement) content.push(iconElement)
      normalizedContent.forEach(item => {
        if (item != null && item !== '') {
          content.push(item)
        }
      })
      
      if (props.to) {
        return h('a', { 
          href: typeof props.to === 'string' ? props.to : '#',
          class: classes,
          role: 'button',
          tabindex: '0',
          ...attrs 
        }, content.length > 0 ? content : undefined)
      }
      
      return h('button', {
        class: classes,
        disabled: props.disabled || props.loading,
        type: 'button',
        ...attrs
      }, content.length > 0 ? content : undefined)
    }
  },
})

export const UContainer = defineComponent({
  name: 'UContainer',
  props: { class: String },
  setup(props, { slots, attrs }) {
    return () => h('div', {
      class: `max-w-7xl mx-auto px-4 sm:px-6 ${props.class || ''}`,
      ...attrs
    }, slots.default?.())
  },
})

export const USlideover = defineComponent({
  name: 'USlideover',
  props: {
    open: Boolean,
    side: { type: String, default: 'right' },
    portal: Boolean,
  },
  emits: ['update:open'],
  setup(props, { slots }) {
    return () => {
      if (!props.open) return null
      return h('div', {
        class: 'fixed inset-0 z-50 flex',
      }, [
        h('div', {
          class: `fixed ${props.side === 'right' ? 'right-0' : 'left-0'} top-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-900 shadow-xl`,
        }, [
          slots.header && h('div', { class: 'p-4 border-b' }, slots.header()),
          slots.body && h('div', { class: 'p-4' }, slots.body()),
        ])
      ])
    }
  },
})

export const UIcon = defineComponent({
  name: 'UIcon',
  props: { name: String, class: String },
  setup(props) {
    return () => h('span', {
      class: `inline-block ${props.class || ''}`,
      innerHTML: '●'
    })
  },
})

// Mock Nuxt's useState for Storybook
// This makes useState available globally in Storybook context
function useState<T>(key: string, init?: () => T) {
  // In Storybook, we just return a ref since we don't need shared state
  // Use a Map to store state per key for consistency
  if (!(globalThis as any).__storybookState) {
    (globalThis as any).__storybookState = new Map()
  }
  const stateMap = (globalThis as any).__storybookState as Map<string, any>
  
  if (!stateMap.has(key)) {
    stateMap.set(key, ref(init ? init() : null))
  }
  
  return stateMap.get(key)
}

// Mock useColorMode composable that syncs with Storybook's background selector
function useColorMode() {
  // Get current background from Storybook context
  const getCurrentBackground = () => {
    if (typeof window !== 'undefined' && (window as any).__STORYBOOK_STORY_STORE__) {
      const store = (window as any).__STORYBOOK_STORY_STORE__
      const globals = store?.getCurrentStory?.()?.globals || {}
      const background = globals.backgrounds?.value || 'light'
      return background === 'dark' ? 'dark' : 'light'
    }
    return 'light'
  }

  const colorMode = ref<'light' | 'dark'>(getCurrentBackground())

  // Watch for background changes
  if (typeof window !== 'undefined') {
    const observer = new MutationObserver(() => {
      const newMode = getCurrentBackground()
      if (colorMode.value !== newMode) {
        colorMode.value = newMode
      }
    })

    // Observe body class changes (Storybook might add dark class)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Also check periodically
    const interval = setInterval(() => {
      const newMode = getCurrentBackground()
      if (colorMode.value !== newMode) {
        colorMode.value = newMode
      }
    }, 100)
  }

  return {
    value: colorMode,
    preference: computed({
      get: () => colorMode.value,
      set: (val: 'light' | 'dark') => {
        colorMode.value = val
        // Try to update Storybook background
        if (typeof window !== 'undefined' && (window as any).__STORYBOOK_STORY_STORE__) {
          const store = (window as any).__STORYBOOK_STORY_STORE__
          store?.updateGlobals?.({ backgrounds: { value: val } })
        }
      },
    }),
  }
}

// Mock NuxtLink component
export const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  setup(props, { slots, attrs }) {
    return () => {
      // Use a simple anchor tag for Storybook
      const href = typeof props.to === 'string' ? props.to : '#'
      return h('a', { href, ...attrs }, slots.default?.())
    }
  },
})

// Mock ClientOnly component - just renders children
export const ClientOnly = defineComponent({
  name: 'ClientOnly',
  setup(_, { slots }) {
    return () => slots.default?.()
  },
})

// Define process object for browser compatibility
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  ;(window as any).process = {
    env: { NODE_ENV: 'development' },
    client: true,
    server: false,
    dev: true,
    prod: false,
  }
}

// Mock Nuxt composables that Nuxt UI needs
if (typeof globalThis !== 'undefined') {
  (globalThis as any).useState = useState
  (globalThis as any).useColorMode = useColorMode
  // Mock useRuntimeConfig that Nuxt UI uses internally
  ;(globalThis as any).useRuntimeConfig = () => ({
    public: {},
    app: {},
  })
}

// Import ColorModeButton component
import ColorModeButton from '../app/components/ColorModeButton.vue'

// Global setup function to register components
// This runs once when Storybook initializes
const preview: Preview = {
  setup: (app) => {
    // Register Nuxt UI mock components
    app.component('UButton', UButton)
    app.component('UContainer', UContainer)
    app.component('USlideover', USlideover)
    app.component('UIcon', UIcon)
    
    // Register Nuxt-specific mocks
    app.component('NuxtLink', NuxtLink)
    app.component('ClientOnly', ClientOnly)
    
    // Register app components
    app.component('ColorModeButton', ColorModeButton)
  },
  
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        light: {
          name: 'light',
          value: '#FFFFFF',
        },

        dark: {
          name: 'dark',
          value: '#000000',
        },

        "mendo-light-blue": {
          name: 'mendo-light-blue',
          value: '#E8F0F5',
        }
      }
    },
    viewport: {
      options: {
        mobile: {
          name: 'Mobile',
          styles: {
            width: '375px',
            height: '667px',
          },
        },
        tablet: {
          name: 'Tablet',
          styles: {
            width: '768px',
            height: '1024px',
          },
        },
        desktop: {
          name: 'Desktop',
          styles: {
            width: '1280px',
            height: '720px',
          },
        },
      },
    },
  },

  decorators: [
    (story, context) => {
      // For fullscreen layouts (like AppHeader), don't add padding
      const isFullscreen = context.parameters?.layout === 'fullscreen'
      const wrapperClass = isFullscreen 
        ? 'bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white min-h-screen'
        : 'bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white min-h-screen p-4'
      
      return {
        components: { 
          story,
        },
        template: `<div class="${wrapperClass}"><story /></div>`,
        setup() {
          // Provide composables to the component instance
          // This makes them available for auto-imports
          return {
            useState,
            useColorMode,
          }
        },
      }
    },
  ],

  initialGlobals: {
    backgrounds: {
      value: 'light'
    }
  }
}

export default preview

