import type { Meta, StoryObj } from '@storybook/vue3'
import ExampleCard from './ExampleCard.vue'

const meta: Meta<typeof ExampleCard> = {
  title: 'Landing/ExampleCard',
  component: ExampleCard,
  tags: ['autodocs'],
  argTypes: {
    clickable: {
      control: 'boolean',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

const exampleLuxuryWatch = {
  title: 'Luxury Watch Ad',
  description: 'Create a 30s Instagram ad for luxury watches with elegant gold aesthetics, slow-motion close-ups, and sophisticated background music',
  icon: '⌚',
  duration: 30,
  aspectRatio: '9:16',
  style: 'Elegant',
}

export const Default: Story = {
  args: {
    example: exampleLuxuryWatch,
    clickable: true,
  },
}

export const NotClickable: Story = {
  args: {
    example: exampleLuxuryWatch,
    clickable: false,
  },
}

export const FitnessProduct: Story = {
  args: {
    example: {
      title: 'Fitness Product Launch',
      description: 'Generate a high-energy 60s YouTube ad showcasing a new fitness product with dynamic workout scenes and motivational voiceover',
      icon: '💪',
      duration: 60,
      aspectRatio: '16:9',
      style: 'Energetic',
    },
  },
}

export const CoffeeBrand: Story = {
  args: {
    example: {
      title: 'Coffee Brand Story',
      description: 'Produce a cinematic 45s ad telling the story of artisanal coffee, from bean to cup, with warm lighting and ambient sounds',
      icon: '☕',
      duration: 45,
      aspectRatio: '16:9',
      style: 'Cinematic',
    },
  },
}

export const Grid: Story = {
  render: () => ({
    components: { ExampleCard },
    template: `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
        <ExampleCard :example="{
          title: 'Luxury Watch Ad',
          description: 'Create a 30s Instagram ad for luxury watches',
          icon: '⌚',
          duration: 30,
          aspectRatio: '9:16',
          style: 'Elegant',
        }" />
        <ExampleCard :example="{
          title: 'Fitness Product Launch',
          description: 'Generate a high-energy 60s YouTube ad',
          icon: '💪',
          duration: 60,
          aspectRatio: '16:9',
          style: 'Energetic',
        }" />
        <ExampleCard :example="{
          title: 'Coffee Brand Story',
          description: 'Produce a cinematic 45s ad telling the story',
          icon: '☕',
          duration: 45,
          aspectRatio: '16:9',
          style: 'Cinematic',
        }" />
      </div>
    `,
  }),
}



