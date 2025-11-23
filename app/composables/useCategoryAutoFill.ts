export interface CategoryAutoFill {
  category: string
  problemPhrase: string
  timePeriod: string
  emotionalAdjective: string
  salesNumber: number
  salesNumberFormatted: string
  timeFrame: string
  discount: number
  background: string
  character: {
    age: string
    gender: string
  }
  voiceTone: string
  voiceSpeed: string
  priceRange: {
    min: number
    max: number
  }
  benefitSuggestions: string[]
}

export interface CategoryConfig {
  id: string
  name: string
  icon: string
  description: string
  problemPhrase: string
  timePeriod: string
  emotionalAdjectives: string[]
  salesRange: {
    min: number
    max: number
  }
  timeFrames: string[]
  discountOptions: number[]
  background: string
  character: {
    age: string
    gender: string
  }
  voiceTone: string
  voiceSpeed: string
  priceRange: {
    min: number
    max: number
  }
  benefitSuggestions: string[]
  avatarId: string // Default avatar ID for this category
}

// Category configurations with smart ranges
const categoryConfigs: Record<string, CategoryConfig> = {
  skincare: {
    id: 'skincare',
    name: 'Skincare / Acne',
    icon: '✨',
    description: 'Skincare products, acne treatments, beauty',
    problemPhrase: 'wake up with acne',
    timePeriod: 'morning',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 87_000, max: 287_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60, 70],
    background: 'bathroom, natural lighting, clean aesthetic',
    character: { age: '20-35', gender: 'unspecified' },
    voiceTone: 'conversational, relatable',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 39 },
    benefitSuggestions: [
      'clears acne overnight',
      'removes wrinkles fast',
      'glows in 7 days',
      'fades dark spots',
      'smooths skin instantly',
    ],
    avatarId: 'mia',
  },
  clothing: {
    id: 'clothing',
    name: 'Clothing stain / spill',
    icon: '👕',
    description: 'Stain removers, laundry products',
    problemPhrase: 'spill coffee every morning',
    timePeriod: 'morning',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 67_000, max: 187_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60],
    background: 'home, kitchen, laundry room',
    character: { age: '25-45', gender: 'unspecified' },
    voiceTone: 'energetic, problem-solving',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 34 },
    benefitSuggestions: [
      'removes stains instantly',
      'works on everything',
      'no scrubbing needed',
      'one spray solution',
    ],
    avatarId: 'sophie',
  },
  phone: {
    id: 'phone',
    name: 'Phone case / protection',
    icon: '📱',
    description: 'Phone cases, screen protectors',
    problemPhrase: 'drop phone constantly',
    timePeriod: 'day',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 67_000, max: 187_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60],
    background: 'modern, tech aesthetic, clean',
    character: { age: '18-40', gender: 'unspecified' },
    voiceTone: 'confident, tech-savvy',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 34 },
    benefitSuggestions: [
      'indestructible protection',
      'military grade drop',
      'crystal clear display',
      'fits perfectly always',
    ],
    avatarId: 'alex',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen gadget',
    icon: '🍳',
    description: 'Kitchen tools, cooking gadgets',
    problemPhrase: 'cooking takes forever',
    timePeriod: 'evening',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 97_000, max: 257_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [60, 70],
    background: 'kitchen, home, warm lighting',
    character: { age: '25-50', gender: 'unspecified' },
    voiceTone: 'friendly, helpful',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 39 },
    benefitSuggestions: [
      'cooks in minutes',
      'one button magic',
      'perfect every time',
      'saves hours daily',
    ],
    avatarId: 'sophie',
  },
  fitness: {
    id: 'fitness',
    name: 'Fitness / gym',
    icon: '💪',
    description: 'Fitness equipment, gym gear',
    problemPhrase: 'gym is too crowded',
    timePeriod: 'morning',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 87_000, max: 287_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60, 70],
    background: 'home gym, modern space',
    character: { age: '20-40', gender: 'unspecified' },
    voiceTone: 'motivational, energetic',
    voiceSpeed: 'slightly fast',
    priceRange: { min: 27, max: 39 },
    benefitSuggestions: [
      'full body workout',
      'fits anywhere',
      'builds muscle fast',
      'no gym needed',
    ],
    avatarId: 'jay',
  },
  jewelry: {
    id: 'jewelry',
    name: 'Jewelry / accessories',
    icon: '💍',
    description: 'Jewelry, accessories, fashion',
    problemPhrase: 'jewelry tarnishes quickly',
    timePeriod: 'day',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 67_000, max: 187_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60],
    background: 'elegant, lifestyle, natural lighting',
    character: { age: '20-50', gender: 'unspecified' },
    voiceTone: 'sophisticated, aspirational',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 34 },
    benefitSuggestions: [
      'never tarnishes ever',
      'waterproof for life',
      'hypoallergenic material',
      'luxury look affordable',
    ],
    avatarId: 'jamie',
  },
  pet: {
    id: 'pet',
    name: 'Pet product',
    icon: '🐾',
    description: 'Pet supplies, toys, accessories',
    problemPhrase: 'pet makes mess everywhere',
    timePeriod: 'day',
    emotionalAdjectives: ['tiny', 'weird', 'magic', 'stupid-looking', 'insane', 'random'],
    salesRange: { min: 87_000, max: 287_000 },
    timeFrames: ['last 30 days', 'this month', 'past 2 weeks', 'in December'],
    discountOptions: [50, 60, 70],
    background: 'home, pet-friendly space',
    character: { age: '25-50', gender: 'unspecified' },
    voiceTone: 'warm, caring',
    voiceSpeed: 'normal',
    priceRange: { min: 19, max: 39 },
    benefitSuggestions: [
      'keeps pets happy',
      'easy to clean',
      'safe for pets',
      'lasts forever',
    ],
    avatarId: 'james',
  },
}

// Helper function to randomize within range, rounded to nearest 5-10k
function randomRound(min: number, max: number, roundTo: number = 5000): number {
  const random = Math.floor(Math.random() * (max - min + 1)) + min
  return Math.round(random / roundTo) * roundTo
}

// Helper function to format sales number (e.g., 127000 -> "127k")
function formatSalesNumber(num: number): string {
  if (num >= 1000) {
    const k = Math.floor(num / 1000)
    return `${k}k`
  }
  return num.toString()
}

// Helper function to random choice from array
function randomChoice<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot choose from empty array')
  }
  // TypeScript doesn't know that array access is safe after length check
  // but we've verified the array is not empty, so this is safe
  return array[Math.floor(Math.random() * array.length)]!
}

export const useCategoryAutoFill = () => {
  /**
   * Get auto-fill data for a category with smart randomization
   */
  const getAutoFillData = (categoryId: string): CategoryAutoFill | null => {
    const config = categoryConfigs[categoryId]
    if (!config) return null

    // Randomize sales number within range, rounded to nearest 5k
    const salesNumber = randomRound(config.salesRange.min, config.salesRange.max, 5000)
    const salesNumberFormatted = formatSalesNumber(salesNumber)
    // Add optional "+" (50% chance)
    const salesDisplay = Math.random() > 0.5 ? `${salesNumberFormatted}+` : salesNumberFormatted

    // Randomize discount from options
    const discount = randomChoice(config.discountOptions)

    // Randomize time frame
    const timeFrame = randomChoice(config.timeFrames)

    // Randomize emotional adjective
    const emotionalAdjective = randomChoice(config.emotionalAdjectives)

    return {
      category: config.id,
      problemPhrase: config.problemPhrase,
      timePeriod: config.timePeriod,
      emotionalAdjective,
      salesNumber,
      salesNumberFormatted: salesDisplay,
      timeFrame,
      discount,
      background: config.background,
      character: config.character,
      voiceTone: config.voiceTone,
      voiceSpeed: config.voiceSpeed,
      priceRange: config.priceRange,
      benefitSuggestions: config.benefitSuggestions,
    }
  }

  /**
   * Generate natural language prompt from category + user inputs
   */
  const generatePrompt = (
    categoryId: string,
    productName: string,
    magicBenefit: string,
    salePrice: number
  ): string => {
    const autoFill = getAutoFillData(categoryId)
    if (!autoFill) {
      throw new Error(`Invalid category: ${categoryId}`)
    }

    // Calculate original price (2.8x - 4.2x sale price, randomized)
    const multiplier = 2.8 + Math.random() * (4.2 - 2.8)
    const originalPrice = Math.round(salePrice * multiplier)

    // Build natural language prompt
    const prompt = `Create a 16-second TikTok ad for ${productName}. ${autoFill.problemPhrase}. This ${autoFill.emotionalAdjective} $${salePrice} product ${magicBenefit}. Over ${autoFill.salesNumberFormatted} sold ${autoFill.timeFrame}. Now only $${salePrice} (was $${originalPrice}) - ${autoFill.discount}% off!`

    return prompt
  }

  /**
   * Get all available categories
   */
  const getCategories = (): CategoryConfig[] => {
    return Object.values(categoryConfigs)
  }

  /**
   * Get category config by ID
   */
  const getCategoryConfig = (categoryId: string): CategoryConfig | null => {
    return categoryConfigs[categoryId] || null
  }

  /**
   * Get default avatar ID for a category
   */
  const getAvatarIdForCategory = (categoryId: string): string | null => {
    const config = categoryConfigs[categoryId]
    return config?.avatarId || null
  }

  return {
    getAutoFillData,
    generatePrompt,
    getCategories,
    getCategoryConfig,
    getAvatarIdForCategory,
  }
}


