export interface Avatar {
  id: string
  name: string
  displayName: string
  gender: 'male' | 'female'
  ageRange: string
  vibe: string
  lookAndStyle: string
  primaryCategories: string[]
  secondaryCategories: string[]
  thumbnailPath: string // Path to thumbnail in public/avatars/
  referenceImagePath: string // Path to reference image (will be in S3)
  description: string // For prompt generation
}

export const avatars: Avatar[] = [
  {
    id: 'mia',
    name: 'Mia',
    displayName: 'Mia',
    gender: 'female',
    ageRange: '24-28',
    vibe: 'relatable girl-next-door',
    lookAndStyle: 'Light brown wavy hair, casual hoodie or clean white tee, soft smile, natural makeup',
    primaryCategories: ['skincare', 'jewelry', 'clothing'],
    secondaryCategories: ['fitness', 'pet'],
    thumbnailPath: '/avatars/mia/thumbnail.png',
    referenceImagePath: '', // Will be set when uploaded to S3
    description: 'a 24-28 year old female with light brown wavy hair, wearing casual hoodie or clean white tee, soft smile, natural makeup, relatable girl-next-door vibe',
  },
  {
    id: 'jay',
    name: 'Jay',
    displayName: 'Jay',
    gender: 'male',
    ageRange: '28-34',
    vibe: 'cool but approachable dude',
    lookAndStyle: 'Short fade, trimmed beard, plain black or grey tee, confident half-smile',
    primaryCategories: ['phone', 'fitness'],
    secondaryCategories: ['clothing', 'jewelry'],
    thumbnailPath: '/avatars/jay/thumbnail.png',
    referenceImagePath: '',
    description: 'a 28-34 year old male with short fade, trimmed beard, plain black or grey tee, confident half-smile, cool but approachable vibe',
  },
  {
    id: 'sophie',
    name: 'Sophie',
    displayName: 'Sophie',
    gender: 'female',
    ageRange: '30-35',
    vibe: 'polished mom / young professional',
    lookAndStyle: 'Blonde straight hair in ponytail or loose, minimal makeup, bright sweater or blouse',
    primaryCategories: ['kitchen', 'clothing', 'pet'],
    secondaryCategories: ['skincare', 'fitness'],
    thumbnailPath: '/avatars/sophie/thumbnail.png',
    referenceImagePath: '',
    description: 'a 30-35 year old female with blonde straight hair in ponytail or loose, minimal makeup, bright sweater or blouse, polished mom/young professional vibe',
  },
  {
    id: 'alex',
    name: 'Alex',
    displayName: 'Alex',
    gender: 'male',
    ageRange: '22-27',
    vibe: 'Gen-Z energy',
    lookAndStyle: 'Messy curly hair, streetwear hoodie, big friendly grin',
    primaryCategories: ['phone', 'fitness'],
    secondaryCategories: ['jewelry', 'clothing'],
    thumbnailPath: '/avatars/alex/thumbnail.png',
    referenceImagePath: '',
    description: 'a 22-27 year old male with messy curly hair, streetwear hoodie, big friendly grin, Gen-Z energy vibe',
  },
  {
    id: 'emma',
    name: 'Emma',
    displayName: 'Emma',
    gender: 'female',
    ageRange: '35-42',
    vibe: 'premium / luxury vibe',
    lookAndStyle: 'Sleek dark hair, subtle jewelry, silk blouse or cashmere, calm confident smile',
    primaryCategories: ['skincare', 'jewelry'],
    secondaryCategories: ['kitchen'],
    thumbnailPath: '/avatars/emma/thumbnail.png',
    referenceImagePath: '',
    description: 'a 35-42 year old female with sleek dark hair, subtle jewelry, silk blouse or cashmere, calm confident smile, premium/luxury vibe',
  },
]

// Category to avatar mapping (locked - never change this)
const categoryAvatarMap: Record<string, string> = {
  skincare: 'mia',
  phone: 'jay',
  kitchen: 'sophie',
  clothing: 'sophie',
  fitness: 'jay',
  jewelry: 'mia',
  pet: 'sophie',
}

/**
 * Get the default avatar for a category
 */
export function getAvatarForCategory(categoryId: string): Avatar | null {
  const avatarId = categoryAvatarMap[categoryId]
  if (!avatarId) return null
  
  return avatars.find(a => a.id === avatarId) || null
}

/**
 * Get avatar by ID
 */
export function getAvatarById(avatarId: string): Avatar | null {
  return avatars.find(a => a.id === avatarId) || null
}

/**
 * Get all avatars
 */
export function getAllAvatars(): Avatar[] {
  return avatars
}

/**
 * Get avatar reference image URL (from S3 or placeholder)
 */
export function getAvatarReferenceImageUrl(avatar: Avatar): string {
  // If reference image path is set (S3 URL), use it
  if (avatar.referenceImagePath && avatar.referenceImagePath.startsWith('http')) {
    return avatar.referenceImagePath
  }
  
  // Otherwise, use placeholder from public folder
  return `/avatars/${avatar.id}/reference.jpg`
}

