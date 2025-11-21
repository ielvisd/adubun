import type { Preview } from '@storybook/vue3'
import '../app/assets/css/main.css'

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#FFFFFF',
        },
        {
          name: 'dark',
          value: '#000000',
        },
        {
          name: 'mendo-light-blue',
          value: '#E8F0F5',
        },
      ],
    },
    viewport: {
      viewports: {
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
    (story) => {
      return {
        components: { story },
        template: '<div class="bg-mendo-white dark:bg-mendo-black text-mendo-black dark:text-mendo-white min-h-screen p-4"><story /></div>',
      }
    },
  ],
}

export default preview

