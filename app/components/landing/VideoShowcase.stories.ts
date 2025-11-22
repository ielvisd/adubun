import type { Meta, StoryObj } from '@storybook/vue3'
import VideoShowcase from './VideoShowcase.vue'

const meta: Meta<typeof VideoShowcase> = {
  title: 'Landing/VideoShowcase',
  component: VideoShowcase,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['mobile', 'desktop'],
    },
    showBadge: {
      control: 'boolean',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Desktop: Story = {
  args: {
    variant: 'desktop',
    showBadge: true,
    videoSrc: '/cameraguy',
  },
  parameters: {
    viewport: {
      defaultViewport: 'desktop',
    },
  },
}

export const Mobile: Story = {
  args: {
    variant: 'mobile',
    showBadge: true,
    videoSrc: '/cameraguy',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile',
    },
  },
}

export const WithoutBadge: Story = {
  args: {
    variant: 'desktop',
    showBadge: false,
    videoSrc: '/cameraguy',
  },
}

export const CustomVideo: Story = {
  args: {
    variant: 'desktop',
    showBadge: true,
    videoSrc: '/custom-video',
  },
}



