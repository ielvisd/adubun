# PRD: Image-Guided Video Generation Pipeline

**Version:** 1.0  
**Date:** November 16, 2025  
**Status:** Draft  
**Owner:** Engineering Team

---

## Executive Summary

**Current State:** Text-to-video generation with optional reference images and post-generation frame extraction  
**Proposed State:** Image-first pipeline with AI-generated keyframes using Nano-banana + Seedream before video generation  
**Goal:** Improve video continuity, consistency, and quality by pre-generating precise visual keyframes  
**Cost Impact:** +22% per generation ($0.13 increase)  
**Timeline:** 9 weeks

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Proposed Solution](#2-proposed-solution)
3. [Context Flow & Prompt Architecture](#3-context-flow--prompt-architecture)
4. [Technical Requirements](#4-technical-requirements)
5. [Architecture Changes](#5-architecture-changes)
6. [Implementation Plan](#6-implementation-plan)
7. [Cost Analysis](#7-cost-analysis)
8. [Success Metrics](#8-success-metrics)
9. [Risks & Mitigations](#9-risks--mitigations)

---

## 1. Problem Statement

### Current Limitations

**Text-Only Pipeline Issues:**
- Inconsistent visual continuity between segments
- No preview capability before expensive video generation
- Limited control over specific visual composition
- Single storyboard option (no alternatives)
- Reactive frame extraction (after video, not planned)

**Impact:**
- Lower quality outputs with jarring transitions
- High regeneration rate (increased costs)
- Poor user experience with limited creative control
- Unpredictable results from text prompts alone

### Current Flow
```
User Prompt → Parse → Generate 1 Storyboard → Generate Videos → Extract Last Frames → Compose
                                    ↓
                              (Text prompts only)
```

---

## 2. Proposed Solution

### New Pipeline Overview

```
User Prompt + Product Images (1-10) 
    ↓
Parse Prompt 
    ↓
Generate 3 Story Options 
    ↓
User Selects Story 
    ↓
Generate Storyboard (Hook, Body1, Body2, CTA)
    ↓
Generate Keyframes for Each Segment
    ├─ Hook: Generate first frame + last frame
    ├─ Body1: Use Hook's last frame + generate last frame  
    ├─ Body2: Use Body1's last frame + generate last frame
    └─ CTA: Use Body2's last frame + generate last frame
    ↓
Preview Keyframes (User approval)
    ↓
Generate Videos (with first/last frame constraints)
    ↓
Compose Final Video
```

### Key Features

1. **Multiple Story Options:** 3 complete narratives for selection
2. **AI Keyframe Generation:** Nano-banana + Seedream pipeline
3. **Visual Preview:** See all keyframes before video generation
4. **Required Product Images:** 1-10 images for consistency
5. **Frame-to-Frame Continuity:** Planned transitions

---

## 3. Context Flow & Prompt Architecture

### 3.1 Full Context Stack

Every keyframe generation receives:

```
┌─────────────────────────────────────────────┐
│ 1. Full Story Narrative                     │
│    "A busy professional's morning routine   │
│     transformed by artisanal coffee..."     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Current Segment Context                  │
│    - Type: hook/body/cta                    │
│    - Description: paragraph                 │
│    - Visual Prompt: detailed cinematography │
│    - Timing: start/end                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Adjacent Segment Context                 │
│    - Previous segment (for continuity)      │
│    - Next segment (for transitions)         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Storyboard System Context                │
│    - Total segments & structure             │
│    - Duration, aspect ratio                 │
│    - Style guidelines                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. Product Images (1-10)                    │
│    - Multiple angles                        │
│    - Brand consistency reference            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 6. Frame Type & Purpose                     │
│    - First frame (segment start)            │
│    - Last frame (transition target)         │
└─────────────────────────────────────────────┘
```

### 3.2 Two-Stage Generation

#### Stage 1: Nano-banana Enhancement

**Input:** All context above + enhancement instructions  
**Output:** Technical composition specification  
**Purpose:** Transform creative vision into technical specifications

#### Stage 2: Seedream Generation

**Input:** Nano-banana output + product consistency requirements  
**Output:** High-quality keyframe image  
**Purpose:** Generate photorealistic image matching specifications

---

### 3.3 Example: Hook First Frame Generation

**Story Context:**
```
"A busy professional's morning routine is transformed by our artisanal 
coffee. The story follows their journey from groggy awakening to energized 
productivity, showcasing how premium coffee elevates everyday experience."
```

**Hook Segment:**
```json
{
  "type": "hook",
  "description": "Close-up of hands pouring steaming coffee from vintage 
                  copper kettle into ceramic cup on marble countertop",
  "visualPrompt": "Cinematic close-up shot of skilled hands gently pouring 
                   dark, aromatic coffee from ornate copper kettle into 
                   handcrafted ceramic cup. Steam rises elegantly. Soft 
                   morning light from left, warm highlights on marble 
                   countertop. Shallow depth of field.",
  "startTime": 0,
  "endTime": 5
}
```

**Storyboard Context:**
```
Segments: Hook → Body1 (brewing process) → Body2 (first sip) → CTA (product)
Duration: 30s | Aspect: 16:9 | Style: Cinematic, warm tones
```

**Product Images:** 10 images of artisanal coffee packaging (different angles)

---

#### Nano-banana Prompt (Hook First Frame)

```typescript
const nanoBananaPrompt = `
TASK: Create enhanced image composition for first frame of video segment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORY NARRATIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A busy professional's morning routine is transformed by our artisanal 
coffee. The story follows their journey from groggy awakening to energized 
productivity, showcasing how premium coffee elevates everyday experience.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT SEGMENT: Hook (Opening Shot)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type: hook
Duration: 5 seconds (0s → 5s)

Description:
Close-up of hands pouring steaming coffee from vintage copper kettle 
into ceramic cup on marble countertop

Detailed Visual Requirements:
Cinematic close-up shot of skilled hands gently pouring dark, aromatic 
coffee from ornate copper kettle into handcrafted ceramic cup. Steam 
rises elegantly. Soft morning light from left, warm highlights on marble 
countertop. Shallow depth of field.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT SEGMENT: Body1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Close-up of coffee brewing apparatus with bubbling water and aromatic 
steam rising. Camera slowly pulls back to reveal full brewing station.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORYBOARD CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Structure: Hook → Body1 → Body2 → CTA (4 segments)
Total Duration: 30 seconds
Aspect Ratio: 16:9
Visual Style: Cinematic with warm, inviting tones
Target: Premium artisanal coffee brand positioning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Product: Artisanal Coffee Beans
Brand Style: Premium, handcrafted, authentic
Reference: 10 product images provided showing:
  - Packaging (kraft paper with hand-drawn labels)
  - Coffee beans (medium-dark roast)
  - Brand typography (serif font, earth tones)
  - Quality level: Small-batch, professional

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENHANCEMENT INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create a HIGHLY DETAILED technical composition including:

1. CAMERA SPECIFICATIONS
   - Exact angle (degrees from horizontal)
   - Lens focal length and aperture
   - Field of view and framing

2. LIGHTING SETUP
   - Key light: direction, intensity, color temperature (Kelvin)
   - Fill light and rim light specifications
   - Ambient lighting characteristics
   - Shadow quality and direction

3. DEPTH & FOCUS
   - Focus point and depth of field range
   - Bokeh characteristics
   - Foreground/background treatment

4. COLOR PALETTE
   - Specific color values (hex codes preferred)
   - Color grading approach
   - Tonal relationships

5. COMPOSITION DETAILS
   - Subject placement (rule of thirds, golden ratio)
   - Spatial relationships between elements
   - Leading lines and visual flow

6. MATERIAL & TEXTURE
   - Surface properties (reflectivity, roughness)
   - Material characteristics (metal, ceramic, liquid)
   - Tactile qualities

7. ATMOSPHERE & MOOD
   - Emotional tone
   - Cinematic qualities
   - Professional photography standards

8. CONTINUITY PREPARATION
   - Elements that support transition to next segment
   - Motion vectors or implied movement
   - Visual bridges for seamless flow

OUTPUT REQUIREMENTS:
- Maximum 300 words
- Photorealistic, cinematographic quality
- Commercial product photography standards
- Technical precision suitable for image generation AI

OUTPUT FORMAT EXAMPLE:
"[Camera spec] at [angle]. [Primary subject] positioned [location]. 
[Lighting setup] from [direction] at [temperature], creating [effect]. 
[Material details] with [texture]. [Color palette] with [values]. 
[Depth specs]. [Atmospheric qualities]. [Technical notes]."
`
```

#### Nano-banana Expected Output

```
Low-angle close-up at 30° elevation, 85mm lens equivalent (f/2.8 aperture, 
35mm format). Weathered masculine hands (visible skin texture, fine lines) 
center-left frame, gripping antique copper kettle (oxidized patina, warm 
metallic sheen, 18th century Dutch style). Dark arabica coffee streams in 
parabolic arc (laminar flow, 150ml/s rate) into white ceramic cup (hand-thrown 
texture, 8oz capacity, positioned lower-right third). Wispy steam rises 
vertically with natural turbulent dispersion. 

Key light 45° camera-left at 3200K (soft morning sun through sheer curtain), 
1000 lux intensity, creating defined but soft shadows. Rim light camera-right 
at 4500K, 300 lux, highlighting steam and copper edges. Polished Carrara marble 
countertop (cool gray veining) in sharp focus 30cm depth, then rapid gaussian 
blur (CoC 50mm). Background hints stainless steel appliances and white oak 
cabinets at 2-stop underexposure.

Color palette: warm amber (#D4A574) highlights, deep coffee brown (#3E2723) 
liquid, cream white (#F5F5DC) cup, copper accent (#B87333), cool marble gray 
(#E8E8E8). Tonal range: 80% mid-tones, gentle S-curve contrast. Atmospheric 
haze from steam creates subtle volumetric lighting (god rays through steam).

Composition: subject at intersecting thirds. Leading line from kettle spout 
to cup follows golden spiral. Negative space upper-right allows breathing room. 
Copper kettle texture: hammered finish with subtle tarnish. Ceramic: matte glaze 
with minimal reflection. Coffee liquid: high surface tension, minimal foam.

Mood: intimate, luxurious morning ritual. Commercial product photography with 
editorial narrative quality. Cinematic color grading (teal-orange complementary 
balance). Photorealistic rendering, 8K quality downsampled to 1280x720.

Transition prep: Cup filling implies forward progression. Background blur allows 
reveal of brewing equipment in next frame. Lighting setup consistent for 
sequential continuity.
```

---

#### Seedream Prompt (Hook First Frame)

```typescript
const seedreamPrompt = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENHANCED COMPOSITION (from Nano-banana)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${nanoBananaOutput}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT CONSISTENCY REQUIREMENTS (10 reference images)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: Match reference images exactly on:

1. Coffee Bean Appearance
   - Roast level: Medium-dark (#4A3728)
   - Bean size and texture consistency
   - Sheen and surface properties

2. Brand Packaging (if visible)
   - Kraft paper material (#C19A6B)
   - Hand-drawn label aesthetic
   - Serif typography (Georgia/Garamond style)
   - Earth tone color palette

3. Quality Level
   - Premium, artisanal positioning
   - Small-batch, handcrafted feel
   - Professional commercial photography standard

4. Visual Identity
   - Warm, inviting color temperature
   - Natural, organic aesthetic
   - Authentic, not overly polished
   - Tactile, sensory focus

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECHNICAL SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resolution: 1280x720 pixels
Aspect Ratio: 16:9
Color Space: sRGB
Format: High-quality JPEG (90% quality)
DPI: 72 (digital display optimized)

Intended Use: First frame keyframe for video generation
Requirements: Static composition, supports smooth interpolation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIDEO CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segment Type: Hook (opening shot)
Duration: 5 seconds
Frame Position: First frame (0s)
Next Frame: Continuation of pouring action → coffee streaming into cup
Transition: Smooth interpolation required

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Sharp focus on primary subject (hands, kettle, cup)
✓ Professional color grading matching specifications
✓ No artifacts, distortions, or AI generation tells
✓ Realistic material properties:
  - Metal: specular highlights, realistic patina
  - Ceramic: appropriate surface texture and reflection
  - Liquid: correct fluid dynamics, realistic sheen
  - Steam: natural turbulent flow, volumetric properties
✓ Proper depth of field with natural bokeh
✓ Cinematic lighting quality
✓ Commercial product photography standards

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STYLE ALIGNMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reference the 10 product images for:
- Lighting style and color temperature
- Material treatment and texture
- Product presentation standards
- Brand visual identity
- Quality and finish level

Output must feel like part of the same photo shoot as reference images.
`
```

---

### 3.4 Last Frame Generation (Hook → Body1 Transition)

For generating Hook's **last frame** to transition into Body1:

#### Nano-banana Prompt (Hook Last Frame)

```typescript
const hookLastFramePrompt = `
TASK: Create enhanced composition for LAST FRAME of Hook segment that 
      transitions seamlessly into Body1 segment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORY NARRATIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${storyNarrative}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT SEGMENT: Hook (FINAL FRAME)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hookSegment.visualPrompt}
Duration: 5s | Current Time: 5s (final frame)
Action: End of pouring motion

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT SEGMENT: Body1 (OPENING FRAME)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Description: Close-up of coffee brewing apparatus with bubbling water and 
aromatic steam rising. Camera slowly pulls back to reveal full brewing station.

Visual Prompt: Extreme close-up of glass pour-over coffee maker with hot water 
creating agitation in coffee grounds. Steam rises in delicate wisps. Copper 
kettle visible edge-of-frame. Warm backlighting creating amber glow through 
brewing coffee.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIRST FRAME REFERENCE (Hook First Frame)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hookFirstFrameUrl}

This frame started with: Hands actively pouring from kettle into cup
Camera: Low-angle close-up, 85mm, f/2.8
Lighting: 3200K key light from left, warm morning tone

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSITION REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This frame must BRIDGE:
FROM: "Hands pouring coffee into cup" (Hook action complete)
TO: "Coffee brewing in pour-over apparatus" (Body1 opening)

CONTINUITY ELEMENTS:
✓ Maintain same lighting setup (3200K morning light from left)
✓ Keep warm color palette consistent (#D4A574, #3E2723, #B87333)
✓ Show completed pour (cup 7/8 full, kettle lifted slightly)
✓ Steam still visible but transitioning toward brewing apparatus
✓ Begin revealing brewing equipment in background
✓ Copper kettle moving toward edge of frame (exit)
✓ Visual flow directing eye toward background (brewing station)

COMPOSITIONAL TRANSITION:
- Primary focus: Filled coffee cup (completion of pour)
- Secondary focus: Background starting to reveal brewing equipment
- Copper kettle: Upper-left, beginning to exit frame
- Hands: Relaxed grip, motion complete
- Camera: Same angle but depth-of-field adjusting to reveal background
- Prepare visual elements that lead into next shot's focus

ENHANCEMENT INSTRUCTIONS:
Create detailed specification for this transitional moment:
1. Show completion of Hook action (successful pour)
2. Maintain Hook's visual language and lighting
3. Introduce subtle elements that preview Body1 (brewing equipment)
4. Adjust depth of field to allow background reveal
5. Keep copper kettle visible but de-emphasized (moving out)
6. Steam patterns leading eye toward brewing station
7. Maintain product consistency and premium feel

OUTPUT: Technical composition (max 300 words) for seamless transition.
`
```

---

## 4. Technical Requirements

### 4.1 New Models Integration

#### Nano-banana Model
- **Provider:** Replicate (TBD - need to confirm availability)
- **Purpose:** Image composition enhancement and technical specification
- **Input:** Prompt + context + reference images
- **Output:** Enhanced technical composition description
- **Cost Estimate:** $0.01-0.05 per generation
- **Fallback:** If unavailable, use GPT-4 Vision for composition refinement

#### Seedream 4 (bytedance/seedream-4)
- **Provider:** Replicate (already integrated)
- **Current Use:** Standalone image generation at `/image-creator`
- **New Use:** Keyframe generation for video segments
- **Input:** Enhanced prompt + reference images
- **Output:** 1280x720 or 720x1280 keyframe image
- **Cost:** ~$0.02 per generation
- **Parameters:**
  - `size`: '2K'
  - `aspect_ratio`: '16:9' | '9:16' | '1:1'
  - `image_input`: Product reference images (1-10)
  - `enhance_prompt`: false (already enhanced by Nano-banana)
  - `sequential_image_generation`: 'disabled'
  - `max_images`: 1

### 4.2 API Endpoints

#### New Endpoints

**`POST /api/generate-stories`**
```typescript
Request: {
  parsed: ParsedPrompt
  duration: number
  style: string
  productImages: string[]  // 1-10 images required
}

Response: {
  stories: Story[]  // Array of 3 stories
  metadata: {
    generationTime: number
    model: string
    cost: number
  }
}
```

**`POST /api/generate-keyframes`**
```typescript
Request: {
  storyboard: Storyboard
  selectedStory: Story
  productImages: string[]
}

Response: {
  segments: Array<{
    segmentId: number
    firstFrameUrl: string
    firstFrameGenerated: boolean  // false if inherited
    lastFrameUrl: string
    nanobananaOutputUrl: string
    generationTime: number
    cost: number
  }>
  totalCost: number
  totalTime: number
}
```

**Modified: `POST /api/plan-storyboard`**
```typescript
Request: {
  parsed: ParsedPrompt
  selectedStory: Story  // NEW - user's selected story
  duration: number
  style: string
  productImages: string[]  // NEW - required
}

Response: {
  storyboard: Storyboard
  storyId: string  // NEW - reference to selected story
}
```

**Modified: `POST /api/generate-assets`**
```typescript
Request: {
  storyboard: StoryboardWithKeyframes  // Now includes firstFrameUrl, lastFrameUrl
}

// Video generation now uses pre-generated keyframes
// No longer extracts frames post-generation
```

### 4.3 Database Schema Changes

```typescript
// app/types/generation.ts

interface Story {
  id: string
  narrative: string  // Complete story text (2-3 paragraphs)
  tone: string  // e.g., "Energetic and uplifting"
  visualStyle: string  // e.g., "Cinematic with warm tones"
  keyMoments: string[]  // Important story beats ["morning routine", "brewing", "first sip"]
  segments: Array<{
    type: 'hook' | 'body' | 'cta'
    description: string
    timing: { start: number, end: number }
  }>
  createdAt: number
}

interface Segment {
  // Existing fields
  type: 'hook' | 'body' | 'cta'
  description: string
  startTime: number
  endTime: number
  visualPrompt: string
  visualPromptAlternatives?: string[]
  audioNotes?: string
  
  // NEW FIELDS for keyframes
  firstFrameUrl: string  // Pre-generated keyframe image URL
  lastFrameUrl: string   // Pre-generated keyframe image URL
  firstFrameGenerated: boolean  // true if AI-generated, false if inherited
  lastFrameGenerated: boolean   // true if AI-generated
  nanobananaOutputUrl?: string  // Intermediate enhancement output
  keyframeGenerationCost: number
  keyframeGenerationTime: number
  
  // Existing optional fields
  selectedPromptIndex?: number
  status?: 'pending' | 'processing' | 'completed' | 'failed'
}

interface Storyboard {
  // Existing fields
  id: string
  segments: Segment[]
  meta: {
    duration: number
    aspectRatio: '16:9' | '9:16' | '1:1'
    style: string
    mode?: 'demo' | 'production'
    model?: string
  }
  createdAt: number
  updatedAt?: number
  
  // NEW FIELDS
  storyId: string  // Reference to selected story
  storyNarrative: string  // Full story text for context
  productImages: string[]  // 1-10 required product images
  keyframesGenerated: boolean
  keyframeGenerationTime: number
  keyframeGenerationCost: number
}
```

---

## 5. Architecture Changes

### 5.1 MCP Server Updates

**`mcp-servers/openai/index.ts`** - Add story generation tool:

```typescript
{
  name: 'generate_stories',
  description: 'Generate 3 complete story narratives for user selection',
  inputSchema: {
    type: 'object',
    properties: {
      parsed: {
        type: 'object',
        description: 'Parsed prompt data (product, audience, mood, etc.)'
      },
      count: {
        type: 'number',
        default: 3,
        description: 'Number of story variations to generate'
      },
      duration: {
        type: 'number',
        description: 'Total video duration in seconds'
      },
      style: {
        type: 'string',
        description: 'Visual style (e.g., "Cinematic")'
      },
      referenceImages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Product reference images for context'
      }
    },
    required: ['parsed', 'duration', 'style']
  }
}
```

**`mcp-servers/replicate/index.ts`** - Add Nano-banana tool:

```typescript
{
  name: 'enhance_with_nanobanana',
  description: 'Enhance image prompt using Nano-banana for technical composition',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Full context prompt with story, segment, and requirements'
      },
      referenceImages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Product images for consistency'
      },
      aspectRatio: {
        type: 'string',
        enum: ['16:9', '9:16', '1:1']
      }
    },
    required: ['prompt']
  }
}

{
  name: 'generate_keyframe',
  description: 'Generate keyframe image using Seedream for video segment',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Enhanced composition from Nano-banana'
      },
      productImages: {
        type: 'array',
        items: { type: 'string' },
        description: '1-10 product reference images'
      },
      aspectRatio: {
        type: 'string',
        enum: ['16:9', '9:16', '1:1']
      },
      frameType: {
        type: 'string',
        enum: ['first', 'last'],
        description: 'Whether this is first or last frame of segment'
      }
    },
    required: ['prompt', 'productImages', 'aspectRatio']
  }
}
```

### 5.2 Utility Functions

**`server/utils/keyframe-generator.ts`** - New file:

```typescript
import { callReplicateMCP } from './mcp-client'
import type { Segment, Story, Storyboard } from '~/types/generation'

interface KeyframeContext {
  storyNarrative: string
  segment: Segment
  previousSegment?: Segment
  nextSegment?: Segment
  storyboard: Storyboard
  productImages: string[]
  firstFrameUrl?: string  // For last frame generation
}

export async function generateFirstFrame(context: KeyframeContext): Promise<{
  imageUrl: string
  nanobananaOutput: string
  cost: number
  time: number
}> {
  const startTime = Date.now()
  
  // Step 1: Build Nano-banana prompt
  const nanoBananaPrompt = buildNanoBananaPrompt({
    storyNarrative: context.storyNarrative,
    segment: context.segment,
    nextSegment: context.nextSegment,
    storyboard: context.storyboard,
    productImages: context.productImages,
    frameType: 'first',
  })
  
  // Step 2: Enhance with Nano-banana
  const enhanced = await callReplicateMCP('enhance_with_nanobanana', {
    prompt: nanoBananaPrompt,
    referenceImages: context.productImages,
    aspectRatio: context.storyboard.meta.aspectRatio,
  })
  
  // Step 3: Build Seedream prompt
  const seedreamPrompt = buildSeedreamPrompt({
    enhancedComposition: enhanced.output,
    productImages: context.productImages,
    aspectRatio: context.storyboard.meta.aspectRatio,
    segment: context.segment,
    frameType: 'first',
  })
  
  // Step 4: Generate keyframe with Seedream
  const keyframe = await callReplicateMCP('generate_keyframe', {
    prompt: seedreamPrompt,
    productImages: context.productImages,
    aspectRatio: context.storyboard.meta.aspectRatio,
    frameType: 'first',
  })
  
  const endTime = Date.now()
  
  return {
    imageUrl: keyframe.imageUrl,
    nanobananaOutput: enhanced.output,
    cost: enhanced.cost + keyframe.cost,
    time: endTime - startTime,
  }
}

export async function generateLastFrame(context: KeyframeContext): Promise<{
  imageUrl: string
  nanobananaOutput: string
  cost: number
  time: number
}> {
  // Similar to generateFirstFrame but with transition context
  // ... implementation
}

function buildNanoBananaPrompt(params: {
  storyNarrative: string
  segment: Segment
  nextSegment?: Segment
  storyboard: Storyboard
  productImages: string[]
  frameType: 'first' | 'last'
  firstFrameUrl?: string
}): string {
  // Build comprehensive prompt as shown in section 3.3
  // ... implementation
}

function buildSeedreamPrompt(params: {
  enhancedComposition: string
  productImages: string[]
  aspectRatio: string
  segment: Segment
  frameType: 'first' | 'last'
}): string {
  // Build Seedream prompt as shown in section 3.3
  // ... implementation
}
```

---

## 6. Implementation Plan

### Phase 1: Foundation (Week 1-2)
**Goal:** Set up core infrastructure

- [ ] Research Nano-banana model availability on Replicate
  - If unavailable, identify alternative enhancement models
  - Consider using GPT-4 Vision as fallback
- [ ] Create `generate_stories` tool in OpenAI MCP
  - Modify system prompt to generate 3 distinct stories
  - Add story comparison and differentiation logic
- [ ] Add `POST /api/generate-stories` endpoint
- [ ] Update database schemas (Story, Segment types)
- [ ] Create ProductImageUpload component (1-10 images, required)
  - Validation: min 1, max 10, image types
  - UI: drag-drop multiple images, preview grid
- [ ] Update validation schemas to require productImages

### Phase 2: Keyframe Generation (Week 3-4)
**Goal:** Implement two-stage keyframe generation

- [ ] Integrate Nano-banana model into Replicate MCP
  - Create `enhance_with_nanobanana` tool
  - Test with sample prompts
  - Measure performance and cost
- [ ] Modify Seedream integration for keyframe generation
  - Create `generate_keyframe` tool
  - Update parameters for video keyframe use case
  - Test quality with reference images
- [ ] Create `server/utils/keyframe-generator.ts`
  - Implement `generateFirstFrame()`
  - Implement `generateLastFrame()`
  - Implement prompt builders
- [ ] Create `POST /api/generate-keyframes` endpoint
  - Handle sequential generation (Hook → Body → CTA)
  - Implement frame inheritance (last → first)
  - Error handling and retry logic
- [ ] Add KeyframePreview component
  - Display first/last frames for each segment
  - Show generation status and progress
  - Allow regeneration of individual keyframes

### Phase 3: Pipeline Integration (Week 5-6)
**Goal:** Connect all pieces into unified flow

- [ ] Modify `plan-storyboard.post.ts`
  - Accept selectedStory parameter
  - Include story narrative in storyboard
  - Store productImages reference
- [ ] Update `generate-assets.post.ts`
  - Use pre-generated keyframes (firstFrameUrl, lastFrameUrl)
  - Remove post-generation frame extraction logic
  - Update video generation params to use keyframes
- [ ] Create StorySelector component
  - Display 3 story options
  - Highlight key differences
  - Allow user selection
- [ ] Update generation flow in `generate.vue`
  - Add story selection step
  - Add keyframe preview step
  - Update progress tracking
- [ ] Implement cost tracking for keyframe generation
  - Track Nano-banana costs
  - Track Seedream costs
  - Update summary endpoint

### Phase 4: Testing & Optimization (Week 7-8)
**Goal:** Ensure quality and performance

- [ ] E2E testing of full pipeline
  - Test with various product types
  - Test different aspect ratios
  - Test error scenarios
- [ ] Performance optimization
  - Parallel keyframe generation where possible
  - Caching Nano-banana outputs
  - Optimize prompt sizes
- [ ] Cost monitoring and optimization
  - Track actual vs estimated costs
  - Identify expensive operations
  - Implement cost caps
- [ ] UI/UX refinement
  - Improve loading states
  - Add helpful tooltips and guidance
  - Optimize for mobile
- [ ] Documentation updates
  - API documentation
  - User guide for product images
  - Troubleshooting guide

### Phase 5: Launch (Week 9)
**Goal:** Ship to production

- [ ] Beta testing with select users
  - Gather qualitative feedback
  - Monitor generation quality
  - Track success metrics
- [ ] Bug fixes and refinements
  - Address beta tester feedback
  - Performance tuning
  - Edge case handling
- [ ] Production deployment
  - Gradual rollout (feature flag)
  - Monitor costs and performance
  - Support existing users
- [ ] Launch announcement and documentation

---

## 7. Cost Analysis

### 7.1 Per-Generation Cost Breakdown

**Current System:**
```
Parse prompt:              $0.001
Plan storyboard (1):       $0.002
Video generation (3):      $0.450  (3 × $0.15)
Voice synthesis (3):       $0.150  (3 × $0.05)
─────────────────────────────────
Total:                     $0.603
```

**Proposed System:**
```
Parse prompt:              $0.001
Generate 3 stories:        $0.006  (3 × $0.002)
Plan storyboard (1):       $0.002
───────────────────────────────────────────────
Keyframe generation:
  Hook first frame:
    - Nano-banana:         $0.030
    - Seedream:            $0.020
  Hook last frame:
    - Nano-banana:         $0.030
    - Seedream:            $0.020
  Body1 last frame:        $0.020  (Seedream only)
  Body2 last frame:        $0.020  (Seedream only)
  CTA last frame:          $0.020  (Seedream only)
  Subtotal:                $0.160
───────────────────────────────────────────────
Video generation (3):      $0.450  (3 × $0.15)
Voice synthesis (3):       $0.150  (3 × $0.05)
─────────────────────────────────────
Total:                     $0.769

Increase: +27.5% ($0.166 more per generation)
```

### 7.2 Cost per Segment Breakdown

| Segment | Keyframe Generation | Video | Voice | Total |
|---------|-------------------|-------|-------|-------|
| Hook    | $0.100 (2 frames) | $0.15 | $0.05 | $0.300 |
| Body1   | $0.020 (1 frame)  | $0.15 | $0.05 | $0.220 |
| Body2   | $0.020 (1 frame)  | $0.15 | $0.05 | $0.220 |
| CTA     | $0.020 (1 frame)  | $0.15 | $0.05 | $0.220 |

**Note:** Hook is most expensive due to generating both first and last frames from scratch.

### 7.3 Cost Optimization Strategies

1. **Caching:** Cache Nano-banana outputs for similar prompts
   - Potential savings: 20-30% on Nano-banana costs
   - Implementation: Redis cache with prompt similarity matching

2. **Quick Mode:** Skip story selection (generate 1 story)
   - Savings: $0.004 per generation
   - User benefit: Faster generation time

3. **Batch Generation:** Generate multiple keyframes in parallel
   - No direct cost savings
   - Benefit: Reduced wall-clock time

4. **Model Alternatives:** If Nano-banana unavailable/expensive
   - Use GPT-4 Vision for composition refinement
   - Estimated cost: $0.01-0.02 per enhancement (cheaper)

5. **User Tiers:**
   - Basic: Text-only pipeline (current)
   - Premium: Image-guided pipeline (proposed)
   - Enterprise: Custom model fine-tuning

---

## 8. Success Metrics

### 8.1 Primary Metrics

**Video Quality:**
- Inter-segment continuity score (manual review): Target +40%
- Visual consistency rating: Target 4.5+/5.0
- Brand alignment score: Target 90%+

**User Satisfaction:**
- Post-generation survey rating: Target 4.5+/5.0
- Feature adoption rate: Target 70%+ users choose image-guided
- Regeneration rate: Target -50% reduction

**Business Impact:**
- Conversion rate (trial → paid): Target +15%
- Churn rate: Target -10%
- Average revenue per user (ARPU): Target +20%

### 8.2 Secondary Metrics

**Story Selection:**
- Distribution across 3 stories (which do users prefer?)
- Time spent on story selection
- Story regeneration requests

**Keyframe Quality:**
- Keyframe approval rate: Target 85%+
- Keyframe regeneration requests per segment
- Manual edits requested

**Cost & Performance:**
- Actual cost per generation vs estimates
- Generation time: Target <5 min end-to-end
- Error rate: Target <5%

### 8.3 Technical Metrics

**Model Performance:**
- Nano-banana success rate: Target 95%+
- Seedream generation quality score
- API response times (p50, p95, p99)

**System Health:**
- Uptime: Target 99.9%
- Error rate by endpoint
- Resource utilization (CPU, memory)

---

## 9. Risks & Mitigations

### 9.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Nano-banana unavailable** | High | Medium | • Research alternative models now<br>• Use GPT-4 Vision as fallback<br>• Consider fine-tuning SDXL |
| **Keyframe quality inconsistent** | High | Medium | • Implement quality scoring<br>• Allow manual regeneration<br>• A/B test with current system |
| **Increased generation time** | Medium | High | • Parallel processing<br>• Optimize prompts<br>• Consider async processing |
| **Cost overruns** | Medium | Medium | • Implement cost caps per user<br>• Monitor and alert on anomalies<br>• Caching strategies |
| **Video model rejection** | Medium | Low | • Test keyframe compatibility<br>• Fallback to text-only<br>• Model-specific handling |

### 9.2 Product Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Users overwhelmed** | Medium | Medium | • Add "Quick mode" (1 story)<br>• Progressive disclosure<br>• Onboarding tutorial |
| **Product images barrier** | High | Low | • Offer AI image generation<br>• Web search integration<br>• Stock image library |
| **Preview slows workflow** | Low | High | • Make preview optional<br>• Auto-approve after N uses<br>• Skip for regenerations |
| **Feature complexity** | Medium | Medium | • Clear UI/UX<br>• Helpful tooltips<br>• Video tutorials |

### 9.3 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Higher costs reduce margin** | High | Medium | • Pass cost to premium tier<br>• Optimize generation<br>• Volume pricing |
| **Timeline delays** | Medium | Medium | • MVP approach<br>• Ship incrementally<br>• Feature flags |
| **User adoption low** | High | Low | • Thorough beta testing<br>• Clear value prop<br>• Migration incentives |
| **Competitive pressure** | Medium | Medium | • Fast execution<br>• Unique IP<br>• Quality focus |

---

## 10. Open Questions

### 10.1 Model Availability
- [ ] Is Nano-banana available on Replicate?
- [ ] What is exact pricing for Nano-banana?
- [ ] Are there alternative enhancement models?
- [ ] Can we fine-tune existing models for enhancement?

### 10.2 Product Images
- [ ] Should we offer AI-generated product images?
- [ ] Web search integration for finding product images?
- [ ] Minimum quality requirements (resolution, format)?
- [ ] How to handle users without any product images?

### 10.3 User Experience
- [ ] Should stories be presented sequentially or simultaneously?
- [ ] Allow mixing elements from different stories?
- [ ] Save rejected stories for future use?
- [ ] How much control over keyframe editing?

### 10.4 Business Model
- [ ] Is 27% cost increase acceptable?
- [ ] Should this be premium tier only?
- [ ] How to price for different user segments?
- [ ] Backwards compatibility requirements?

### 10.5 Technical Architecture
- [ ] Sync vs async keyframe generation?
- [ ] Caching strategy and infrastructure?
- [ ] How to handle model downtimes?
- [ ] Migration path for existing storyboards?

---

## 11. Acceptance Criteria

### Must Have (P0)

**Story Generation:**
- ✅ Generate 3 distinct, high-quality story options
- ✅ Stories differ meaningfully (tone, pacing, style)
- ✅ User can select one story to proceed
- ✅ Selected story context flows through entire pipeline

**Keyframe Generation:**
- ✅ Generate first/last keyframes for each segment
- ✅ Keyframes use Nano-banana → Seedream pipeline
- ✅ First frames of Body segments inherit from previous segment's last frame
- ✅ Keyframes match product images in style and quality

**Preview & Approval:**
- ✅ Display keyframe preview before video generation
- ✅ Show first/last frame pairs for each segment
- ✅ Allow regeneration of individual keyframes

**Video Generation:**
- ✅ Video generation uses keyframes as constraints
- ✅ Videos interpolate smoothly between keyframes
- ✅ Remove post-generation frame extraction (no longer needed)

**Product Images:**
- ✅ Require 1-10 product images at start
- ✅ Validate image format, size, and quality
- ✅ Use product images for consistency across all keyframes

**Cost & Tracking:**
- ✅ Track costs for story generation, keyframe generation separately
- ✅ Display cost breakdown to user
- ✅ Implement cost caps and warnings

### Should Have (P1)

- ✅ Nano-banana integration (or suitable alternative)
- ✅ Quality checks on generated keyframes
- ✅ Performance optimization (parallel generation)
- ✅ Comprehensive error handling and recovery
- ✅ Analytics and monitoring for all stages
- ✅ A/B testing framework (new vs old pipeline)

### Nice to Have (P2)

- 🔲 Quick mode (skip story selection, 1 story only)
- 🔲 Keyframe editing capabilities (manual adjustments)
- 🔲 AI-generated product images (if user has none)
- 🔲 Web search for product images
- 🔲 Keyframe caching and reuse across generations
- 🔲 Export keyframes as standalone assets
- 🔲 Batch generation (multiple videos from one storyboard)

---

## 12. Appendix: File Structure

### New Files to Create

```
server/
├── api/
│   ├── generate-stories.post.ts         # NEW - Generate 3 story options
│   ├── generate-keyframes.post.ts       # NEW - Generate all keyframes
│   └── plan-storyboard.post.ts          # MODIFY - Accept selectedStory
├── utils/
│   ├── keyframe-generator.ts            # NEW - Keyframe generation logic
│   ├── nanobanana-client.ts             # NEW - Nano-banana API client
│   └── prompt-builders.ts               # NEW - Build Nano-banana/Seedream prompts

mcp-servers/
├── openai/
│   └── index.ts                         # MODIFY - Add generate_stories tool
└── replicate/
    └── index.ts                         # MODIFY - Add Nano-banana integration

app/
├── components/
│   ├── generation/
│   │   ├── StorySelector.vue            # NEW - Display/select from 3 stories
│   │   ├── KeyframePreview.vue          # NEW - Preview first/last frames
│   │   ├── KeyframeGrid.vue             # NEW - Grid view of all keyframes
│   │   └── StoryboardView.vue           # MODIFY - Show keyframes
│   └── ui/
│       ├── ProductImageUpload.vue       # NEW - Upload 1-10 product images
│       └── PromptInput.vue              # MODIFY - Require product images
├── pages/
│   └── generate.vue                     # MODIFY - Add new steps to flow
└── types/
    └── generation.ts                    # MODIFY - Add Story, update Segment

docs/
└── pipeline_prd.md                      # THIS FILE
```

### Modified Files

```
server/api/plan-storyboard.post.ts       # Accept selectedStory, productImages
server/api/generate-assets.post.ts       # Use keyframes, remove frame extraction
server/utils/validation.ts               # Add Story schema, update Segment
app/types/generation.ts                  # Add Story type, update Segment type
app/pages/generate.vue                   # Add story selection + keyframe preview
app/composables/useGeneration.ts         # Add keyframe generation logic
```

---

## 13. Success Definition

This pipeline transformation will be considered **successful** if after 30 days of production:

1. **Quality:** 80%+ of videos have better inter-segment continuity than text-only pipeline (blind review)
2. **Satisfaction:** User satisfaction score increases by 15%+ (survey)
3. **Efficiency:** Regeneration rate decreases by 40%+ (fewer do-overs)
4. **Adoption:** 60%+ of users choose image-guided over text-only (when offered choice)
5. **Business:** Cost increase justified by 20%+ increase in conversion or retention

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-16 | Engineering | Initial comprehensive PRD with prompt examples |

---

## Approvals

| Role | Name | Status | Date |
|------|------|--------|------|
| Product Owner | TBD | Pending | - |
| Engineering Lead | TBD | Pending | - |
| Design Lead | TBD | Pending | - |
| Finance | TBD | Pending | - |

---

**Next Steps:**
1. Review and approve this PRD
2. Confirm Nano-banana availability and pricing
3. Create detailed technical specifications
4. Begin Phase 1 implementation


