import type { Meta, StoryObj } from '@storybook/vue3'
import AIGeneratedBadge from './AIGeneratedBadge.vue'

const meta: Meta<typeof AIGeneratedBadge> = {
  title: 'Landing/AIGeneratedBadge',
  component: AIGeneratedBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { AIGeneratedBadge },
    template: `
      <div class="relative w-96 h-64 bg-mendo-cream rounded-3xl p-4">
        <AIGeneratedBadge />
      </div>
    `,
  }),
}

export const OnVideo: Story = {
  render: () => ({
    components: { AIGeneratedBadge },
    template: `
      <div class="relative w-96 h-64 bg-mendo-black rounded-2xl overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-gray-800 to-black"></div>
        <AIGeneratedBadge />
      </div>
    `,
  }),
}

