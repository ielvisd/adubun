import type { StorybookConfig } from '@storybook/vue3-vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

const config: StorybookConfig = {
  stories: [
    '../app/components/**/*.stories.@(js|jsx|ts|tsx|vue)',
  ],

  addons: ['@storybook/addon-links', '@storybook/addon-docs'],

  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },

  viteFinal: async (config) => {
    // Ensure compatibility with Nuxt's path resolution
    const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app')
    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    
    // Plugin to provide useState for Storybook via auto-import
    const mockUseStatePlugin: Plugin = {
      name: 'storybook-mock-usestate',
      enforce: 'pre', // Run before Vue plugin processes SFCs
      resolveId(id) {
        // Provide virtual modules for useState - use Storybook-specific path
        if (id === '#storybook/composables/useState' || id === '~/composables/useState' || id === '#app/composables' || id === '#app') {
          return '\0virtual:nuxt-usestate'
        }
        return null
      },
      load(id) {
        if (id === '\0virtual:nuxt-usestate') {
          return `
            import { ref } from 'vue'
            
            // State storage for Storybook (shared across components)
            const stateMap = new Map()
            
            export function useState(key, init) {
              // In Storybook, useState returns a ref with shared state per key
              if (!stateMap.has(key)) {
                stateMap.set(key, ref(init ? init() : null))
              }
              return stateMap.get(key)
            }
          `
        }
        return null
      },
      transform(code, id) {
        // Only process Vue SFC files
        if (!id.endsWith('.vue')) {
          return null
        }
        
        // Check if useState is used in script setup without import
        const scriptSetupMatch = code.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/)
        if (scriptSetupMatch) {
          const scriptContent = scriptSetupMatch[1]
          const hasUseState = /useState\s*\(/.test(scriptContent)
          const hasImport = /import.*useState|from\s+['"]#app['"]|from\s+['"]#storybook\/composables|from\s+['"]~\/composables/.test(scriptContent)
          
          if (hasUseState && !hasImport) {
            // Inject import at the beginning of script setup block
            // Use Storybook-specific path to avoid conflicts with Nuxt
            const useStateImport = `import { useState } from '#storybook/composables/useState'\n`
            return {
              code: code.replace(
                /(<script\s+setup[^>]*>)/,
                `$1\n${useStateImport}`
              ),
              map: null
            }
          }
        }
        
        return null
      }
    }
    
    // Plugin to handle component auto-imports (like ColorModeButton)
    // This allows components to be used without explicit imports
    const componentAutoImportPlugin: Plugin = {
      name: 'storybook-component-auto-import',
      enforce: 'pre',
      resolveId(id) {
        // Handle component imports from app/components
        if (id.startsWith('~/components/') || id.startsWith('@/components/')) {
          const componentName = id.split('/').pop()?.replace(/\.vue$/, '')
          if (componentName) {
            // Resolve to actual file path
            const componentPath = path.join(appDir, 'components', `${componentName}.vue`)
            return componentPath
          }
        }
        return null
      },
    }
    
    // Ensure Vue plugin is explicitly included
    // Check if Vue plugin already exists in plugins array
    const vuePluginName = 'vite:vue'
    const hasVuePlugin = config.plugins?.some((plugin) => {
      if (!plugin) return false
      // Handle both direct plugin objects and array-wrapped plugins
      const pluginObj = Array.isArray(plugin) ? plugin[0] : plugin
      return pluginObj?.name === vuePluginName
    })
    
    // If Vue plugin is not found, add it at the beginning of the plugins array
    // This ensures Vue files are processed correctly
    if (!hasVuePlugin) {
      config.plugins = [vue(), ...(config.plugins || [])]
    } else {
      // Ensure Vue plugin is early in the chain by moving it to the front if needed
      const vuePluginIndex = config.plugins.findIndex((plugin) => {
        if (!plugin) return false
        const pluginObj = Array.isArray(plugin) ? plugin[0] : plugin
        return pluginObj?.name === vuePluginName
      })
      if (vuePluginIndex > 0) {
        const vuePlugin = config.plugins[vuePluginIndex]
        config.plugins = [vuePlugin, ...config.plugins.filter((_, i) => i !== vuePluginIndex)]
      }
    }
    
    if (!config.resolve) {
      config.resolve = {}
    }
    
    // Configure path aliases for Nuxt-style imports
    // Merge with existing aliases to avoid breaking Storybook's defaults
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '~': appDir,
      '@': appDir,
      '~~': rootDir,
      '@@': rootDir,
    }
    
    // Ensure proper module resolution
    config.resolve.extensions = [
      ...(config.resolve.extensions || []),
      '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'
    ].filter((ext, index, arr) => arr.indexOf(ext) === index) // Remove duplicates
    
    // Use relative base path for proper dynamic imports
    config.base = './'
    
    // Configure server options for proper path resolution
    config.server = {
      ...config.server,
      fs: {
        ...config.server?.fs,
        // Allow serving files from the app directory
        allow: [
          ...(config.server?.fs?.allow || []),
          appDir,
          rootDir,
        ],
      },
    }
    
    // Improve build configuration for better module resolution
    config.build = {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        output: {
          ...config.build?.rollupOptions?.output,
          // Ensure proper chunking for dynamic imports
          manualChunks: undefined,
        },
      },
      // Transpile Nuxt UI and its dependencies for Storybook
      commonjsOptions: {
        ...config.build?.commonjsOptions,
        include: [/node_modules/],
      },
    }
    
    // Exclude native dependencies and Node.js-only modules that can't be bundled
    if (!config.optimizeDeps) {
      config.optimizeDeps = {}
    }
    config.optimizeDeps.exclude = [
      ...(config.optimizeDeps.exclude || []),
      'lightningcss',
      '@tailwindcss/oxide',
      '@tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide-darwin-x64',
      '@tailwindcss/oxide-linux-arm64',
      '@tailwindcss/oxide-linux-x64',
      '@tailwindcss/oxide-win32-x64',
      '@nuxt/ui', // Exclude Nuxt UI from optimization - it has Node.js dependencies
      'jiti', // jiti uses Node.js modules
    ]
    
    // Configure SSR to handle native modules
    if (!config.ssr) {
      config.ssr = {}
    }
    config.ssr.noExternal = [
      ...(config.ssr?.noExternal || []),
      '@nuxt/ui',
    ]
    
    // Exclude native modules from SSR
    config.ssr.external = [
      ...(config.ssr?.external || []),
      'lightningcss',
      '@tailwindcss/oxide',
      '@tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide-darwin-x64',
      '@tailwindcss/oxide-linux-arm64',
      '@tailwindcss/oxide-linux-x64',
      '@tailwindcss/oxide-win32-x64',
    ]
    
    // Add plugins for Nuxt compatibility
    config.plugins = [
      ...(config.plugins || []),
      mockUseStatePlugin,
      componentAutoImportPlugin,
    ]
    
    // Define globals for browser compatibility
    if (!config.define) {
      config.define = {}
    }
    
    // Define process.env for components that check process.client, process.dev, etc.
    config.define['process.env'] = JSON.stringify({
      NODE_ENV: 'development',
    })
    config.define['process.client'] = 'true'
    config.define['process.server'] = 'false'
    config.define['process.dev'] = 'true'
    config.define['process.prod'] = 'false'
    
    // Also define global process object for runtime access
    if (!config.resolve) {
      config.resolve = {}
    }
    
    return config
  }
}

export default config


