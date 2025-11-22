import type { Meta, StoryObj } from '@storybook/vue3'
import FeatureCard from './FeatureCard.vue'

const meta: Meta<typeof FeatureCard> = {
  title: 'Landing/FeatureCard',
  component: FeatureCard,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const FastGeneration: Story = {
  args: {
    icon: '⚡',
    title: 'Fast Generation',
    description: 'Generate professional ad videos with fully automated AI-powered pipeline.',
  },
}

export const CostEffective: Story = {
  args: {
    icon: '💰',
    title: 'Cost Effective',
    description: 'Less than $2 per minute of video content. No hidden fees.',
  },
}

export const AIPowered: Story = {
  args: {
    icon: '🤖',
    title: 'AI-Powered',
    description: 'Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs.',
  },
}

export const AllFeatures: Story = {
  render: () => ({
    components: { FeatureCard },
    template: `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 p-8">
        <FeatureCard
          icon="⚡"
          title="Fast Generation"
          description="Generate professional ad videos with fully automated AI-powered pipeline."
        />
        <FeatureCard
          icon="💰"
          title="Cost Effective"
          description="Less than $2 per minute of video content. No hidden fees."
        />
        <FeatureCard
          icon="🤖"
          title="AI-Powered"
          description="Leveraging cutting-edge AI models including GPT-4, Replicate, and ElevenLabs."
        />
      </div>
    `,
  }),
}



