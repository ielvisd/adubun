import type { Meta, StoryObj } from '@storybook/vue3'
import TrustIndicators from './TrustIndicators.vue'

const meta: Meta<typeof TrustIndicators> = {
  title: 'Landing/TrustIndicators',
  component: TrustIndicators,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { TrustIndicators },
    template: '<TrustIndicators />',
  }),
}

export const LightMode: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
  render: () => ({
    components: { TrustIndicators },
    template: '<div class="bg-mendo-white p-8"><TrustIndicators /></div>',
  }),
}

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  render: () => ({
    components: { TrustIndicators },
    template: '<div class="bg-mendo-black p-8"><TrustIndicators /></div>',
  }),
}

