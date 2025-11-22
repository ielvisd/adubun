import type { Meta, StoryObj } from '@storybook/vue3'
import HeroSection from './HeroSection.vue'

const meta: Meta<typeof HeroSection> = {
  title: 'Landing/HeroSection',
  component: HeroSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    headlineLine1: 'Transform Prompts',
    headlineLine2: 'into Professional Ads',
    subheadline: 'Create stunning, high-converting video content in minutes with our AI-powered platform. No editing skills required.',
    primaryCta: {
      label: 'Get Started Free',
      action: () => console.log('Get Started clicked'),
    },
    secondaryCta: {
      label: 'View Examples',
      action: () => console.log('View Examples clicked'),
    },
  },
}

export const CustomHeadline: Story = {
  args: {
    headlineLine1: 'Create Amazing Videos',
    headlineLine2: 'With AI Power',
    subheadline: 'Transform your ideas into professional video content instantly.',
    primaryCta: {
      label: 'Start Creating',
      action: () => console.log('Start Creating clicked'),
    },
    secondaryCta: {
      label: 'Learn More',
      action: () => console.log('Learn More clicked'),
    },
  },
}

export const SingleCTA: Story = {
  args: {
    headlineLine1: 'Transform Prompts',
    headlineLine2: 'into Professional Ads',
    subheadline: 'Create stunning, high-converting video content in minutes with our AI-powered platform.',
    primaryCta: {
      label: 'Get Started Free',
      action: () => console.log('Get Started clicked'),
    },
  },
}

export const WithoutBadge: Story = {
  args: {
    headlineLine1: 'Transform Prompts',
    headlineLine2: 'into Professional Ads',
    subheadline: 'Create stunning, high-converting video content in minutes with our AI-powered platform.',
    showVideoBadge: false,
    primaryCta: {
      label: 'Get Started Free',
      action: () => console.log('Get Started clicked'),
    },
    secondaryCta: {
      label: 'View Examples',
      action: () => console.log('View Examples clicked'),
    },
  },
}



