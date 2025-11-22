import type { Meta, StoryObj } from '@storybook/vue3'
import SectionHeader from './SectionHeader.vue'

const meta: Meta<typeof SectionHeader> = {
  title: 'Landing/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  argTypes: {
    align: {
      control: 'select',
      options: ['left', 'center'],
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Create Your Video',
    description: 'Just describe your product. We\'ll handle the rest.',
    align: 'center',
  },
}

export const LeftAligned: Story = {
  args: {
    title: 'Why Choose AdUbun?',
    description: 'Everything you need to create professional videos at scale.',
    align: 'left',
  },
}

export const LongTitle: Story = {
  args: {
    title: 'Try These Examples and Get Inspired',
    description: 'Get inspired with these ready-to-use templates that showcase the power of AI-generated video content.',
    align: 'center',
  },
}



