import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  stories: [
    '../app/components/**/*.stories.@(js|jsx|ts|tsx|vue)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-links',
    '@storybook/addon-viewport',
  ],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  core: {
    builder: '@storybook/builder-vite',
  },
  viteFinal: async (config) => {
    // Ensure compatibility with Nuxt's path resolution
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '~': new URL('../app', import.meta.url).pathname,
        '@': new URL('../app', import.meta.url).pathname,
      }
    }
    return config
  },
}

export default config

