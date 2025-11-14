# Product Requirements Document (PRD): AI Video Generation Pipeline (AdUbun)

**Version:** 4.0 (Production Ready - Nuxt UI + MCP Integration)  
**Date:** November 13, 2025  
**Author:** Product Team  
**Status:** Sprint Ready - 48-Hour MVP with Professional Design System  

**Tagline:** *"Ubun Your Ads: Inventive Flow, Infinite Impact."*

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [MCP Integration Strategy](#3-mcp-integration-strategy)
4. [Step 0: Project Setup](#4-step-0-project-setup)
5. [Design System](#5-design-system)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Testing Strategy](#8-testing-strategy)
9. [Timeline & Milestones](#9-timeline--milestones)
10. [Risks & Mitigation](#10-risks--mitigation)
11. [Appendices](#11-appendices)

---

## 1. Introduction

### 1.1 Background
AdUbun transforms creative production by orchestrating AI models for ad videos, integrating text-to-video (Hailuo2.3, Veo 3), voice synthesis, and composition. Built on Nuxt 4 with a professional design system using Nuxt UI, ensuring consistent UX and rapid development.

### 1.2 Problem Statement
Manual ad creation is time-intensive and expensive. AdUbun automates prompt-to-video flows, reducing costs to <$2 per minute while maintaining visual coherence, audio sync, and professional polish.

### 1.3 Goals & Success Criteria

**Business Goals:**
- Secure $5,000 bounty
- Position AdUbun as scalable SaaS for marketers
- Target: 20-50% ROAS improvement via A/B testing variants

**MVP Success (48 Hours):**
- Generate 3+ ad samples in <10 mins each
- 90% success rate
- <$2 cost per video
- Prompt-accurate output
- Professional, cohesive UI/UX

**Evaluation Alignment:**
- 40% Output Quality (visual coherence, audio sync)
- 25% Architecture (clean code, MCP integration)
- 20% Cost Effectiveness (API optimization)
- 15% User Experience (Nuxt UI polish)

---

## 2. Architecture Overview

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nuxt 4 Frontend                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Nuxt UI    │  │  Tailwind    │  │  Vue 3       │      │
│  │  Components │  │  CSS         │  │  Composables │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Nuxt Server)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MCP Servers (Complementary System)                  │  │
│  │  • Filesystem MCP (asset handling)                   │  │
│  │  • Database MCP (generation history)                 │  │
│  │  • Cost Tracking MCP (API usage monitoring)          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Direct API Integrations                             │  │
│  │  • Replicate (Hailuo2.3, Flux, Kling)               │  │
│  │  • OpenAI (GPT-4o for parsing/planning)             │  │
│  │  • ElevenLabs (voice synthesis)                      │  │
│  │  • AudioCraft (background music)                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Processing Pipeline                        │
│  Input → Planning → Generation → Composition → Output      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Storage & Delivery                       │
│  • Supabase Storage (videos, assets)                       │
│  • Vercel Edge (deployment)                                │
│  • FFmpeg Processing (composition)                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Tech Stack Summary

**Frontend:**
- Nuxt 4 (app/ directory structure)
- Vue 3 with Composition API
- Nuxt UI (component library)
- Tailwind CSS (utility-first styling)
- TypeScript (type safety)

**Backend:**
- Nuxt Server Routes (API endpoints)
- Node.js/Express (if needed for complex operations)
- MCP Servers (filesystem, database, cost tracking)

**AI/ML Services:**
- Replicate (primary video/image generation)
- OpenAI GPT-4o (prompt parsing, planning)
- ElevenLabs (voice synthesis)
- AudioCraft/Suno (background music)

**Infrastructure:**
- Vercel (deployment, edge functions)
- Supabase (database, storage, auth)
- FFmpeg (video composition)
- Sentry (error tracking)

---

## 3. MCP Integration Strategy

### 3.1 MCP Server Architecture

**Three Core MCP Servers for API Integration:**

1. **Replicate MCP** - Video generation via Replicate API
2. **OpenAI MCP** - Prompt parsing and storyboard planning via OpenAI API
3. **ElevenLabs MCP** - Voice synthesis via ElevenLabs API

### 3.2 Replicate MCP Server

**Purpose:** Standardize video generation operations via Replicate API.

**Implementation (mcp-servers/replicate/index.ts):**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'

import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY || '',
})

class ReplicateMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-replicate',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_video',
          description: 'Generate video using Replicate (Hailuo2.3, Flux, or Kling)',
          inputSchema: {
            type: 'object',
            properties: {
              model: { type: 'string', default: 'minimax/hailuo-ai-v2.3' },
              prompt: { type: 'string' },
              duration: { type: 'number', default: 5 },
              aspect_ratio: { type: 'string', default: '16:9' },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'check_prediction_status',
          description: 'Check the status of a Replicate prediction',
          inputSchema: {
            type: 'object',
            properties: {
              predictionId: { type: 'string' },
            },
            required: ['predictionId'],
          },
        },
        {
          name: 'get_prediction_result',
          description: 'Get the result URL from a completed prediction',
          inputSchema: {
            type: 'object',
            properties: {
              predictionId: { type: 'string' },
            },
            required: ['predictionId'],
          },
        },
      ],
    }))

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'generate_video':
          return await this.generateVideo(
            args.model || 'minimax/hailuo-ai-v2.3',
            args.prompt,
            args.duration || 5,
            args.aspect_ratio || '16:9'
          )
        
        case 'check_prediction_status':
          return await this.checkPredictionStatus(args.predictionId)
        
        case 'get_prediction_result':
          return await this.getPredictionResult(args.predictionId)
        
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  private async generateVideo(model: string, prompt: string, duration: number, aspectRatio: string) {
    const prediction = await replicate.predictions.create({
      model,
      input: { prompt, duration, aspect_ratio: aspectRatio },
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          predictionId: prediction.id,
          status: prediction.status,
          createdAt: prediction.created_at,
        }),
      }],
    }
  }

  private async checkPredictionStatus(predictionId: string) {
    const prediction = await replicate.predictions.get(predictionId)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: prediction.id,
          status: prediction.status,
          output: prediction.output,
          error: prediction.error,
        }),
      }],
    }
  }

  private async getPredictionResult(predictionId: string) {
    const prediction = await replicate.predictions.get(predictionId)
    if (prediction.status !== 'succeeded') {
      throw new Error(`Prediction not completed. Status: ${prediction.status}`)
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          videoUrl: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output,
        }),
      }],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Replicate MCP server running on stdio')
  }
}

const server = new ReplicateMCPServer()
server.run().catch(console.error)
```

### 3.3 OpenAI MCP Server

**Purpose:** Standardize prompt parsing and storyboard planning via OpenAI API.

**Implementation (mcp-servers/openai/index.ts):**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

class OpenAIMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-openai',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'chat_completion',
          description: 'Create a chat completion using OpenAI',
          inputSchema: {
            type: 'object',
            properties: {
              model: { type: 'string', default: 'gpt-4o' },
              messages: { type: 'array' },
              response_format: { type: 'object' },
            },
            required: ['messages'],
          },
        },
        {
          name: 'parse_prompt',
          description: 'Parse user prompt into structured ad video requirements',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'plan_storyboard',
          description: 'Generate video storyboard with segments',
          inputSchema: {
            type: 'object',
            properties: {
              parsed: { type: 'object' },
              duration: { type: 'number' },
              style: { type: 'string' },
            },
            required: ['parsed', 'duration', 'style'],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'chat_completion':
          return await this.chatCompletion(args.model, args.messages, args.response_format)
        
        case 'parse_prompt':
          return await this.parsePrompt(args.prompt)
        
        case 'plan_storyboard':
          return await this.planStoryboard(args.parsed, args.duration, args.style)
        
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  private async chatCompletion(model: string, messages: any[], responseFormat?: any) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      response_format: responseFormat,
    })
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          content: completion.choices[0].message.content,
          usage: completion.usage,
        }),
      }],
    }
  }

  private async parsePrompt(prompt: string) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Extract structured ad video requirements...' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })
    return {
      content: [{
        type: 'text',
        text: completion.choices[0].message.content || '{}',
      }],
    }
  }

  private async planStoryboard(parsed: any, duration: number, style: string) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Create a video storyboard...' },
        { role: 'user', content: JSON.stringify(parsed) },
      ],
      response_format: { type: 'json_object' },
    })
    return {
      content: [{
        type: 'text',
        text: completion.choices[0].message.content || '{}',
      }],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('OpenAI MCP server running on stdio')
  }
}

const server = new OpenAIMCPServer()
server.run().catch(console.error)
```

### 3.4 ElevenLabs MCP Server

**Purpose:** Standardize voice synthesis operations via ElevenLabs API.

**Implementation (mcp-servers/elevenlabs/index.ts):**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import axios from 'axios'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'

class ElevenLabsMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'adubun-elevenlabs',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'text_to_speech',
          description: 'Convert text to speech using ElevenLabs',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              voice_id: { type: 'string', default: '21m00Tcm4TlvDq8ikWAM' },
              model_id: { type: 'string', default: 'eleven_monolingual_v1' },
            },
            required: ['text'],
          },
        },
        {
          name: 'get_voice_list',
          description: 'Get list of available voices',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_voice_settings',
          description: 'Get settings for a specific voice',
          inputSchema: {
            type: 'object',
            properties: {
              voice_id: { type: 'string' },
            },
            required: ['voice_id'],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'text_to_speech':
          return await this.textToSpeech(args.text, args.voice_id, args.model_id)
        
        case 'get_voice_list':
          return await this.getVoiceList()
        
        case 'get_voice_settings':
          return await this.getVoiceSettings(args.voice_id)
        
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  private async textToSpeech(text: string, voiceId: string, modelId: string) {
    const response = await axios.post(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
      { text, model_id: modelId },
      {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        responseType: 'arraybuffer',
      }
    )
    const audioBase64 = Buffer.from(response.data).toString('base64')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ audioBase64, format: 'mp3', voiceId, modelId }),
      }],
    }
  }

  private async getVoiceList() {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data) }],
    }
  }

  private async getVoiceSettings(voiceId: string) {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices/${voiceId}/settings`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data) }],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('ElevenLabs MCP server running on stdio')
  }
}

const server = new ElevenLabsMCPServer()
server.run().catch(console.error)
```

### 3.5 MCP Client Composable

**Purpose:** Unified interface for all MCP servers in the Nuxt app.

**Implementation (composables/useMCP.ts):**
```typescript
import { callReplicateMCP, callOpenAIMCP, callElevenLabsMCP } from '~/server/utils/mcp-client'

export const useMCP = () => {
  // Replicate operations
  const generateVideo = async (prompt: string, duration = 5, aspectRatio = '16:9', model = 'minimax/hailuo-ai-v2.3') => {
    return await callReplicateMCP('generate_video', { model, prompt, duration, aspect_ratio: aspectRatio })
  }

  const checkPredictionStatus = async (predictionId: string) => {
    return await callReplicateMCP('check_prediction_status', { predictionId })
  }

  const getPredictionResult = async (predictionId: string) => {
    return await callReplicateMCP('get_prediction_result', { predictionId })
  }

  // OpenAI operations
  const parsePrompt = async (prompt: string) => {
    const result = await callOpenAIMCP('parse_prompt', { prompt })
    return JSON.parse(result.content)
  }

  const planStoryboard = async (parsed: any, duration: number, style: string) => {
    const result = await callOpenAIMCP('plan_storyboard', { parsed, duration, style })
    return JSON.parse(result.content)
  }

  // ElevenLabs operations
  const textToSpeech = async (text: string, voiceId = '21m00Tcm4TlvDq8ikWAM', modelId = 'eleven_monolingual_v1') => {
    return await callElevenLabsMCP('text_to_speech', { text, voice_id: voiceId, model_id: modelId })
  }

  return {
    // Replicate
    generateVideo,
    checkPredictionStatus,
    getPredictionResult,
    // OpenAI
    parsePrompt,
    planStoryboard,
    // ElevenLabs
    textToSpeech,
  }
}
```

### 3.6 Cost Tracking Composable

**Purpose:** Real-time cost monitoring in the UI.

**Implementation (composables/useCostTracking.ts):**
```typescript
export const useCostTracking = () => {
  const currentCost = ref(0)
  const estimatedTotal = ref(0)
  const breakdown = ref<Record<string, number>>({})

  const updateCosts = async () => {
    try {
      const summary = await $fetch('/api/cost/summary')
      currentCost.value = summary.current
      estimatedTotal.value = summary.estimated
      breakdown.value = summary.breakdown
    } catch (error) {
      console.error('Failed to update costs:', error)
    }
  }

  // Poll for cost updates
  const startPolling = (interval = 5000) => {
    const intervalId = setInterval(updateCosts, interval)
    
    onUnmounted(() => {
      clearInterval(intervalId)
    })
  }

  return {
    currentCost,
    estimatedTotal,
    breakdown,
    updateCosts,
    startPolling,
  }
}
```

**Cost Summary Endpoint (server/api/cost/summary.get.ts):**
```typescript
import { getCostSummary } from '~/server/utils/cost-tracker'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const startTime = query.startTime ? parseInt(query.startTime as string) : undefined
  const endTime = query.endTime ? parseInt(query.endTime as string) : undefined

  const start = startTime || Date.now() - 24 * 60 * 60 * 1000
  const end = endTime || Date.now()

  const summary = await getCostSummary(start, end)

  return {
    current: summary.total,
    estimated: summary.total * 1.2, // Add 20% buffer
    breakdown: summary.byOperation,
    count: summary.count,
  }
})
```

---

## 4. Step 0: Project Setup

### 4.1 Installation Checklist

**Prerequisites:**
- Node.js 20+ (LTS)
- pnpm 8+ (package manager)
- Git

**Step-by-Step Setup:**

```bash
# 1. Initialize Nuxt 4 Project
npx nuxi@latest init adubun
cd adubun

# 2. Install Core Dependencies
pnpm add @nuxt/ui
pnpm add -D tailwindcss @nuxtjs/tailwindcss
pnpm add @modelcontextprotocol/sdk

# 3. Install Development Tools
pnpm add -D @playwright/test
pnpm add -D @nuxt/test-utils
pnpm add -D vitest

# 4. Install API Client Libraries
pnpm add replicate openai axios

# 5. Install Video Processing
pnpm add fluent-ffmpeg
pnpm add -D @types/fluent-ffmpeg

# 6. Install Additional Utilities
pnpm add zod                    # Schema validation
pnpm add @vueuse/core          # Vue composables
pnpm add date-fns              # Date utilities
pnpm add nanoid                # ID generation

# 7. Install Supabase Client
pnpm add @supabase/supabase-js
```

### 4.2 Project Structure

```
adubun/
├── app/
│   ├── assets/
│   │   └── css/
│   │       └── main.css              # Tailwind + Nuxt UI imports
│   ├── components/
│   │   ├── ui/                       # Reusable UI components
│   │   │   ├── PromptInput.vue
│   │   │   ├── VideoPreview.vue
│   │   │   ├── GenerationProgress.vue
│   │   │   └── CostTracker.vue
│   │   ├── generation/               # Generation-specific components
│   │   │   ├── StoryboardView.vue
│   │   │   ├── AssetGallery.vue
│   │   │   └── CompositionTimeline.vue
│   │   └── brand/                    # Brand components
│   │       ├── LogoUpload.vue
│   │       └── ColorPicker.vue
│   ├── composables/
│   │   ├── useGeneration.ts          # Generation state management
│   │   ├── useMCP.ts                 # MCP client wrapper
│   │   ├── useCostTracking.ts        # Cost monitoring
│   │   └── useVideoPlayer.ts         # Video playback utilities
│   ├── layouts/
│   │   ├── default.vue               # Main layout
│   │   └── generation.vue            # Generation flow layout
│   ├── pages/
│   │   ├── index.vue                 # Landing/prompt input
│   │   ├── generate.vue              # Generation progress
│   │   ├── preview.vue               # Video preview/download
│   │   └── history.vue               # Generation history
│   ├── middleware/
│   │   └── auth.ts                   # Authentication check
│   └── types/
│       ├── generation.ts             # Generation type definitions
│       └── mcp.ts                    # MCP type definitions
├── server/
│   ├── api/
│   │   ├── parse-prompt.post.ts      # Prompt parsing endpoint
│   │   ├── plan-storyboard.post.ts   # Storyboard planning
│   │   ├── generate-assets.post.ts   # Asset generation
│   │   ├── compose-video.post.ts     # Video composition
│   │   └── cost/
│   │       └── track.post.ts         # Cost tracking
│   ├── mcp/
│   │   ├── filesystem.ts             # Filesystem MCP server
│   │   ├── database.ts               # Database MCP server
│   │   └── cost-tracker.ts           # Cost tracking MCP server
│   └── utils/
│       ├── replicate.ts              # Replicate client
│       ├── openai.ts                 # OpenAI client
│       ├── ffmpeg.ts                 # FFmpeg utilities
│       └── validation.ts             # Zod schemas
├── tests/
│   └── e2e/
│       ├── generation-flow.spec.ts   # End-to-end generation test
│       └── ui-components.spec.ts     # Component tests
├── mcp-servers/                      # MCP server implementations
│   ├── filesystem/
│   ├── database/
│   └── cost-tracker/
├── nuxt.config.ts                    # Nuxt configuration
├── tailwind.config.ts                # Tailwind configuration
├── playwright.config.ts              # Playwright configuration
└── package.json
```

### 4.3 Configuration Files

**app/assets/css/main.css:**
```css
@import "tailwindcss";
@import "@nuxt/ui";

/* Custom CSS Variables */
:root {
  --adubun-primary: #6366f1;
  --adubun-secondary: #8b5cf6;
  --adubun-accent: #ec4899;
  --adubun-success: #10b981;
  --adubun-warning: #f59e0b;
  --adubun-error: #ef4444;
}

/* Custom Utilities */
.video-container {
  @apply relative aspect-video bg-gray-900 rounded-lg overflow-hidden;
}

.generation-card {
  @apply bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700;
}

.gradient-text {
  @apply bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent;
}
```

**nuxt.config.ts:**
```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-11-13',
  
  modules: [
    '@nuxt/ui',
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.ts',
  },

  ui: {
    global: true,
    icons: ['heroicons', 'lucide'],
  },

  runtimeConfig: {
    // Private keys (server-only)
    replicateApiKey: process.env.REPLICATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    
    // Public keys (client-accessible)
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      appUrl: process.env.APP_URL || 'http://localhost:3000',
    },
  },

  app: {
    head: {
      title: 'AdUbun - AI Video Generation',
      meta: [
        { name: 'description', content: 'Transform prompts into professional ad videos with AI' },
      ],
    },
  },

  devtools: { enabled: true },
  typescript: { strict: true },
})
```

**tailwind.config.ts:**
```typescript
import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
```

**playwright.config.ts:**
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

**.env.example:**
```bash
# Replicate API
REPLICATE_API_KEY=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI API
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ElevenLabs API
ELEVENLABS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application
APP_URL=http://localhost:3000
NODE_ENV=development

# MCP Configuration
MCP_FILESYSTEM_ROOT=/tmp/adubun
MCP_DATABASE_URL=postgresql://localhost:5432/adubun
```

---

## 5. Design System

### 5.1 Color Palette

**Primary Colors:**
- Primary: Indigo (`#6366f1`) - Main brand color, CTAs
- Secondary: Purple (`#8b5cf6`) - Accents, highlights
- Accent: Pink (`#ec4899`) - Special features, premium elements

**Semantic Colors:**
- Success: Green (`#10b981`) - Completed generations
- Warning: Amber (`#f59e0b`) - In-progress states
- Error: Red (`#ef4444`) - Failed generations
- Info: Blue (`#3b82f6`) - Informational messages

**Neutral Colors:**
- Gray scale for backgrounds, borders, text (Tailwind gray)
- Dark mode support with `dark:` variants

### 5.2 Typography

**Font Family:**
- Primary: Inter (sans-serif)
- Monospace: JetBrains Mono (code, IDs)

**Type Scale:**
```
H1: text-4xl font-bold (36px)
H2: text-3xl font-bold (30px)
H3: text-2xl font-semibold (24px)
H4: text-xl font-semibold (20px)
Body: text-base (16px)
Small: text-sm (14px)
Tiny: text-xs (12px)
```

### 5.3 Component Usage Guide

**Nuxt UI Components Reference:**

```vue
<!-- Forms -->
<UForm />              <!-- Form wrapper with validation -->
<UFormGroup />         <!-- Form field group -->
<UInput />             <!-- Text input -->
<UTextarea />          <!-- Multi-line text input -->
<USelect />            <!-- Dropdown select -->
<URadioGroup />        <!-- Radio button group -->
<UCheckbox />          <!-- Checkbox -->
<UToggle />            <!-- Toggle switch -->

<!-- Buttons & Actions -->
<UButton />            <!-- Primary button -->
<UButtonGroup />       <!-- Button group -->
<UDropdown />          <!-- Dropdown menu -->

<!-- Feedback -->
<UAlert />             <!-- Alert messages -->
<UNotification />      <!-- Toast notifications -->
<UProgress />          <!-- Progress bar -->
<USkeleton />          <!-- Loading skeleton -->

<!-- Layout -->
<UCard />              <!-- Card container -->
<UContainer />         <!-- Content container -->
<UDivider />           <!-- Visual divider -->

<!-- Navigation -->
<UTabs />              <!-- Tab navigation -->
<UBreadcrumb />        <!-- Breadcrumb navigation -->
<UPagination />        <!-- Pagination -->

<!-- Data Display -->
<UTable />             <!-- Data table -->
<UBadge />             <!-- Status badge -->
<UAvatar />            <!-- User avatar -->
<UIcon />              <!-- Icon component -->

<!-- Overlays -->
<UModal />             <!-- Modal dialog -->
<USlideOver />         <!-- Slide-over panel -->
<UPopover />           <!-- Popover -->
<UTooltip />           <!-- Tooltip -->
```

### 5.4 Page Templates

**Landing Page (index.vue):**
- Hero section with gradient background
- Prompt input with `UTextarea` and `UButton`
- Feature cards using `UCard`
- Sample video gallery

**Generation Page (generate.vue):**
- Progress indicator using `UProgress`
- Real-time status updates with `UNotification`
- Stage-by-stage visualization
- Cancel/retry controls

**Preview Page (preview.vue):**
- Video player with custom controls
- Download options (`UDropdown`)
- Regeneration controls
- Cost breakdown display

**History Page (history.vue):**
- Generation history table (`UTable`)
- Filters and search (`UInput`, `USelect`)
- Pagination (`UPagination`)
- Quick actions per row

### 5.5 Design Patterns

**Consistent Spacing:**
- Container padding: `p-4` to `p-8`
- Element gaps: `gap-4` to `gap-6`
- Section margins: `mb-8` to `mb-12`

**Responsive Design:**
- Mobile-first approach
- Breakpoints: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Flexible grid layouts using `grid` and `flex`

**Dark Mode:**
- All components support `dark:` variants
- Automatic theme detection
- Manual toggle available

**Accessibility:**
- WCAG AA compliance
- Proper ARIA labels on all interactive elements
- Keyboard navigation support
- Focus indicators

---

## 6. Functional Requirements

### 6.1 Input Layer (Prompt Parser)

**Purpose:** Ingest and structure user prompts into actionable data.

**UI Components:**
```vue
<template>
  <UContainer>
    <UCard>
      <template #header>
        <h2 class="text-2xl font-bold gradient-text">
          Create Your Ad Video
        </h2>
      </template>

      <UForm :state="form" @submit="parsePrompt">
        <UFormGroup label="Describe Your Ad" required>
          <UTextarea
            v-model="form.prompt"
            placeholder="Create a 30s Instagram ad for luxury watches with elegant gold aesthetics..."
            :rows="4"
          />
        </UFormGroup>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <UFormGroup label="Duration">
            <USelect
              v-model="form.duration"
              :options="[15, 30, 60]"
              :ui="{ wrapper: 'w-full' }"
            />
          </UFormGroup>

          <UFormGroup label="Aspect Ratio">
            <USelect
              v-model="form.aspectRatio"
              :options="['16:9', '9:16', '1:1']"
            />
          </UFormGroup>

          <UFormGroup label="Style">
            <USelect
              v-model="form.style"
              :options="['Cinematic', 'Minimal', 'Energetic', 'Elegant']"
            />
          </UFormGroup>
        </div>

        <UButton
          type="submit"
          size="xl"
          :loading="loading"
          class="mt-6 w-full"
        >
          Generate Video
        </UButton>
      </UForm>
    </UCard>
  </UContainer>
</template>

<script setup lang="ts">
const form = reactive({
  prompt: '',
  duration: 30,
  aspectRatio: '16:9',
  style: 'Cinematic',
})

const loading = ref(false)

const parsePrompt = async () => {
  loading.value = true
  try {
    const data = await $fetch('/api/parse-prompt', {
      method: 'POST',
      body: form,
    })
    navigateTo('/generate', { state: data })
  } catch (error) {
    // Error handling with UNotification
  } finally {
    loading.value = false
  }
}
</script>
```

**Backend Endpoint (server/api/parse-prompt.post.ts):**
```typescript
import { z } from 'zod'
import { OpenAI } from 'openai'

const schema = z.object({
  prompt: z.string().min(10).max(1000),
  duration: z.number().min(15).max(180),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  style: z.string(),
})

export default defineEventHandler(async (event) => {
  // Validate input
  const body = await readBody(event)
  const validated = schema.parse(body)

  // Use MCP for cost tracking
  const mcp = useMCP()
  await mcp.trackCost('parse-prompt', 0.001)

  // Parse with GPT-4o
  const config = useRuntimeConfig()
  const openai = new OpenAI({ apiKey: config.replicateApiKey })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Extract structured ad video requirements from user prompts. Return JSON with:
          - product: string
          - targetAudience: string
          - mood: string
          - keyMessages: string[]
          - visualStyle: string
          - callToAction: string`,
      },
      {
        role: 'user',
        content: validated.prompt,
      },
    ],
    response_format: { type: 'json_object' },
  })

  const parsed = JSON.parse(completion.choices[0].message.content)

  return {
    ...parsed,
    meta: {
      duration: validated.duration,
      aspectRatio: validated.aspectRatio,
      style: validated.style,
    },
  }
})
```

**Acceptance Criteria:**
- ✅ 90% prompt accuracy
- ✅ <2s parsing time
- ✅ Validation for all inputs
- ✅ Cost tracking via MCP
- ✅ Error handling with user-friendly messages

---

### 6.2 Planning Layer (Content Planner)

**Purpose:** Break video into timed segments with shot descriptions.

**UI Component (StoryboardView.vue):**
```vue
<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold">Video Storyboard</h3>
    </template>

    <div class="space-y-4">
      <div
        v-for="(segment, idx) in storyboard"
        :key="idx"
        class="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
      >
        <div class="flex-shrink-0">
          <UBadge :color="getSegmentColor(segment.type)" size="lg">
            {{ segment.type }}
          </UBadge>
        </div>
        
        <div class="flex-1">
          <p class="font-medium">{{ segment.description }}</p>
          <p class="text-sm text-gray-500 mt-1">
            {{ segment.startTime }}s - {{ segment.endTime }}s
          </p>
        </div>

        <div class="flex-shrink-0">
          <UButton
            icon="i-heroicons-pencil"
            size="sm"
            variant="ghost"
            @click="editSegment(idx)"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  storyboard: Segment[]
}>()

const getSegmentColor = (type: string) => {
  const colors = {
    hook: 'red',
    body: 'blue',
    cta: 'green',
  }
  return colors[type] || 'gray'
}
</script>
```

**Backend Endpoint (server/api/plan-storyboard.post.ts):**
```typescript
export default defineEventHandler(async (event) => {
  const { parsed } = await readBody(event)
  const config = useRuntimeConfig()
  const openai = new OpenAI({ apiKey: config.openaiApiKey })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Create a video storyboard with 3-5 segments. Each segment needs:
          - type: "hook" | "body" | "cta"
          - description: Shot description
          - startTime: number (seconds)
          - endTime: number (seconds)
          - visualPrompt: Detailed prompt for image/video generation
          - audioNotes: VO script or music cues
          
          Duration: ${parsed.meta.duration}s
          Style: ${parsed.meta.style}`,
      },
      {
        role: 'user',
        content: JSON.stringify(parsed),
      },
    ],
    response_format: { type: 'json_object' },
  })

  const plan = JSON.parse(completion.choices[0].message.content)

  // Use MCP to save storyboard
  const mcp = useMCP()
  await mcp.saveToDatabase('storyboards', plan)

  return plan
})
```

**Acceptance Criteria:**
- ✅ 100% time coverage (no gaps)
- ✅ 3-5 segments per video
- ✅ <3s planning time
- ✅ Editable segments in UI

---

### 6.3 Generation Engine

**Purpose:** Create raw video/audio assets using AI models.

**UI Component (GenerationProgress.vue):**
```vue
<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-semibold">Generating Assets</h3>
          <UBadge :color="statusColor">{{ status }}</UBadge>
        </div>
      </template>

      <!-- Overall Progress -->
      <UProgress :value="overallProgress" class="mb-4" />

      <!-- Segment Progress -->
      <div class="space-y-3">
        <div
          v-for="(segment, idx) in segments"
          :key="idx"
          class="flex items-center gap-3"
        >
          <UIcon
            :name="getStatusIcon(segment.status)"
            :class="getStatusClass(segment.status)"
            class="w-5 h-5"
          />
          <span class="flex-1">Segment {{ idx + 1 }}: {{ segment.type }}</span>
          <span class="text-sm text-gray-500">{{ segment.status }}</span>
        </div>
      </div>
    </UCard>

    <!-- Cost Tracker -->
    <UCard>
      <template #header>
        <h4 class="font-semibold">Cost Tracking</h4>
      </template>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-500">Current Cost</p>
          <p class="text-2xl font-bold">${{ currentCost.toFixed(3) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Estimated Total</p>
          <p class="text-2xl font-bold">${{ estimatedTotal.toFixed(3) }}</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const { segments, overallProgress, status } = useGeneration()
const { currentCost, estimatedTotal } = useCostTracking()

const statusColor = computed(() => {
  if (status.value === 'completed') return 'green'
  if (status.value === 'failed') return 'red'
  return 'yellow'
})
</script>
```

**Backend Endpoint (server/api/generate-assets.post.ts):**
```typescript
import Replicate from 'replicate'

export default defineEventHandler(async (event) => {
  const { storyboard } = await readBody(event)
  const config = useRuntimeConfig()
  const replicate = new Replicate({ auth: config.replicateApiKey })
  const mcp = useMCP()

  // Track generation job
  const jobId = nanoid()
  await mcp.saveToDatabase('generation_jobs', {
    id: jobId,
    status: 'processing',
    startTime: Date.now(),
  })

  try {
    // Generate assets in parallel
    const assets = await Promise.all(
      storyboard.segments.map(async (segment, idx) => {
        // Video Generation (Hailuo2.3)
        const videoOutput = await replicate.run(
          'minimax/hailuo-ai-v2.3:latest',
          {
            input: {
              prompt: segment.visualPrompt,
              duration: segment.endTime - segment.startTime,
              aspect_ratio: storyboard.meta.aspectRatio,
            },
          }
        )

        // Track cost
        await mcp.trackCost('video-generation', 0.15)

        // Voice Over (ElevenLabs)
        let voiceUrl = null
        if (segment.audioNotes) {
          const voiceResponse = await $fetch('https://api.elevenlabs.io/v1/text-to-speech', {
            method: 'POST',
            headers: {
              'xi-api-key': config.elevenLabsApiKey,
            },
            body: {
              text: segment.audioNotes,
              voice_id: 'default',
            },
          })
          
          voiceUrl = await uploadToStorage(voiceResponse)
          await mcp.trackCost('voice-synthesis', 0.05)
        }

        return {
          segmentId: idx,
          videoUrl: videoOutput.video,
          voiceUrl,
          status: 'completed',
        }
      })
    )

    // Update job status
    await mcp.saveToDatabase('generation_jobs', {
      id: jobId,
      status: 'completed',
      assets,
      endTime: Date.now(),
    })

    return { jobId, assets }
  } catch (error) {
    await mcp.saveToDatabase('generation_jobs', {
      id: jobId,
      status: 'failed',
      error: error.message,
    })
    throw error
  }
})
```

**Composable (composables/useGeneration.ts):**
```typescript
export const useGeneration = () => {
  const segments = ref([])
  const overallProgress = ref(0)
  const status = ref('idle')
  const jobId = ref(null)

  const startGeneration = async (storyboard: any) => {
    status.value = 'processing'
    segments.value = storyboard.segments.map((seg, idx) => ({
      ...seg,
      status: 'pending',
    }))

    try {
      // Start generation
      const response = await $fetch('/api/generate-assets', {
        method: 'POST',
        body: { storyboard },
      })

      jobId.value = response.jobId

      // Poll for progress
      await pollProgress()
    } catch (error) {
      status.value = 'failed'
      throw error
    }
  }

  const pollProgress = async () => {
    const interval = setInterval(async () => {
      const progress = await $fetch(`/api/generation-status/${jobId.value}`)
      
      segments.value = progress.segments
      overallProgress.value = progress.overallProgress
      
      if (progress.status === 'completed' || progress.status === 'failed') {
        status.value = progress.status
        clearInterval(interval)
      }
    }, 2000)
  }

  return {
    segments,
    overallProgress,
    status,
    startGeneration,
  }
}
```

**Acceptance Criteria:**
- ✅ 80% success rate for asset generation
- ✅ <5 mins for parallel generation
- ✅ Automatic retry on failures (3 attempts)
- ✅ Real-time progress updates
- ✅ Cost tracking per asset

---

### 6.4 Composition Layer

**Purpose:** Stitch assets together with FFmpeg, add overlays, sync audio.

**UI Component (CompositionTimeline.vue):**
```vue
<template>
  <UCard>
    <template #header>
      <h3 class="text-xl font-semibold">Video Composition</h3>
    </template>

    <div class="space-y-4">
      <!-- Timeline Visualization -->
      <div class="relative h-24 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
        <div
          v-for="(clip, idx) in clips"
          :key="idx"
          :style="{
            left: `${(clip.startTime / totalDuration) * 100}%`,
            width: `${((clip.endTime - clip.startTime) / totalDuration) * 100}%`,
          }"
          class="absolute top-0 h-full bg-primary-500 border-r-2 border-white"
        >
          <div class="p-2 text-xs text-white truncate">
            {{ clip.type }}
          </div>
        </div>
      </div>

      <!-- Composition Options -->
      <div class="grid grid-cols-2 gap-4">
        <UFormGroup label="Transition Style">
          <USelect
            v-model="composition.transition"
            :options="['fade', 'dissolve', 'wipe', 'none']"
          />
        </UFormGroup>

        <UFormGroup label="Music Volume">
          <URange
            v-model="composition.musicVolume"
            :min="0"
            :max="100"
          />
        </UFormGroup>
      </div>

      <UButton
        :loading="composing"
        size="lg"
        class="w-full"
        @click="startComposition"
      >
        <UIcon name="i-heroicons-film" class="mr-2" />
        Compose Video
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  clips: Clip[]
  totalDuration: number
}>()

const composition = reactive({
  transition: 'fade',
  musicVolume: 70,
})

const composing = ref(false)

const startComposition = async () => {
  composing.value = true
  try {
    await $fetch('/api/compose-video', {
      method: 'POST',
      body: {
        clips: props.clips,
        options: composition,
      },
    })
  } finally {
    composing.value = false
  }
}
</script>
```

**Backend Endpoint (server/api/compose-video.post.ts):**
```typescript
import ffmpeg from 'fluent-ffmpeg'
import { promises as fs } from 'fs'

export default defineEventHandler(async (event) => {
  const { clips, options } = await readBody(event)
  const mcp = useMCP()
  const outputPath = `/tmp/output-${nanoid()}.mp4`

  try {
    // Download clips via MCP filesystem
    const localClips = await Promise.all(
      clips.map(async (clip) => {
        const localPath = await mcp.downloadFile(clip.videoUrl)
        return { ...clip, localPath }
      })
    )

    // Build FFmpeg command
    const command = ffmpeg()

    // Add inputs
    localClips.forEach((clip) => {
      command.input(clip.localPath)
      if (clip.voiceUrl) {
        command.input(clip.voiceUrl)
      }
    })

    // Complex filter for composition
    const filterComplex = buildFilterComplex(localClips, options)
    command.complexFilter(filterComplex)

    // Output settings
    command
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
      ])
      .output(outputPath)

    // Execute
    await new Promise((resolve, reject) => {
      command
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    // Upload to storage
    const videoBuffer = await fs.readFile(outputPath)
    const publicUrl = await uploadToStorage(videoBuffer, 'video/mp4')

    // Cleanup
    await fs.unlink(outputPath)
    await mcp.cleanupTempFiles(localClips.map(c => c.localPath))

    // Track cost
    await mcp.trackCost('video-composition', 0.10)

    return { videoUrl: publicUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Video composition failed',
    })
  }
})

function buildFilterComplex(clips: any[], options: any) {
  const filters = []
  
  // Concatenate clips with transitions
  clips.forEach((clip, idx) => {
    filters.push(`[${idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1,setsar=1,fps=30[v${idx}]`)
  })

  // Add fade transitions
  if (options.transition === 'fade') {
    const fadeFilters = clips.map((_, idx) => {
      if (idx === 0) return `[v${idx}]`
      return `[v${idx}]fade=t=in:st=0:d=0.5`
    }).join('')
    filters.push(fadeFilters)
  }

  // Concatenate
  const concatInputs = clips.map((_, idx) => `[v${idx}]`).join('')
  filters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0[outv]`)

  // Audio mixing
  const audioFilters = []
  clips.forEach((clip, idx) => {
    if (clip.voiceUrl) {
      audioFilters.push(`[${idx + clips.length}:a]adelay=${clip.startTime * 1000}|${clip.startTime * 1000}[a${idx}]`)
    }
  })
  
  if (audioFilters.length > 0) {
    const audioInputs = audioFilters.map((_, idx) => `[a${idx}]`).join('')
    filters.push(...audioFilters)
    filters.push(`${audioInputs}amix=inputs=${audioFilters.length}:duration=longest[outa]`)
  }

  return filters
}
```

**Audio Sync Utilities (server/utils/audio-sync.ts):**
```typescript
import * as Tone from 'tone'

export async function detectBeats(audioUrl: string) {
  // Download audio
  const audioBuffer = await fetch(audioUrl).then(r => r.arrayBuffer())
  
  // Analyze with Tone.js
  const buffer = await Tone.context.decodeAudioData(audioBuffer)
  const analyzer = new Tone.Analyser('waveform', 2048)
  
  // Simple beat detection (onset detection)
  const beats = []
  const sampleRate = buffer.sampleRate
  const windowSize = 2048
  const hopSize = 512
  
  for (let i = 0; i < buffer.length - windowSize; i += hopSize) {
    const window = buffer.slice(i, i + windowSize)
    const energy = calculateEnergy(window)
    
    if (energy > threshold) {
      beats.push(i / sampleRate)
    }
  }
  
  return beats
}

function calculateEnergy(samples: Float32Array): number {
  return samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
}

export function alignClipToBeats(clip: Clip, beats: number[]): Clip {
  // Find closest beat to clip start time
  const closestBeat = beats.reduce((prev, curr) => 
    Math.abs(curr - clip.startTime) < Math.abs(prev - clip.startTime) ? curr : prev
  )
  
  return {
    ...clip,
    startTime: closestBeat,
    syncedToBeat: true,
  }
}
```

**Acceptance Criteria:**
- ✅ <0.5s audio-video drift
- ✅ Smooth transitions between clips
- ✅ <2 mins composition time for 60s video
- ✅ Support multiple aspect ratios
- ✅ Text overlays render correctly

---

### 6.5 Output Handler

**Purpose:** Finalize video, generate previews, handle downloads.

**UI Component (VideoPreview.vue):**
```vue
<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-xl font-semibold">Your Video is Ready!</h3>
        <UBadge color="green" size="lg">
          <UIcon name="i-heroicons-check-circle" class="mr-1" />
          Completed
        </UBadge>
      </div>
    </template>

    <!-- Video Player -->
    <div class="video-container mb-6">
      <video
        ref="videoPlayer"
        :src="videoUrl"
        controls
        class="w-full h-full"
      />
    </div>

    <!-- Video Info -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="text-center">
        <p class="text-sm text-gray-500">Duration</p>
        <p class="text-lg font-semibold">{{ duration }}s</p>
      </div>
      <div class="text-center">
        <p class="text-sm text-gray-500">Resolution</p>
        <p class="text-lg font-semibold">1080p</p>
      </div>
      <div class="text-center">
        <p class="text-sm text-gray-500">Cost</p>
        <p class="text-lg font-semibold">${{ cost.toFixed(2) }}</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <UButton
        size="lg"
        class="flex-1"
        @click="downloadVideo"
      >
        <UIcon name="i-heroicons-arrow-down-tray" class="mr-2" />
        Download MP4
      </UButton>

      <UDropdown :items="exportOptions">
        <UButton variant="outline" size="lg">
          <UIcon name="i-heroicons-ellipsis-vertical" />
        </UButton>
      </UDropdown>

      <UButton
        variant="outline"
        size="lg"
        @click="regenerate"
      >
        <UIcon name="i-heroicons-arrow-path" class="mr-2" />
        Regenerate
      </UButton>
    </div>

    <!-- Share Options -->
    <UDivider class="my-6" />
    
    <div>
      <h4 class="font-semibold mb-3">Share Video</h4>
      <div class="flex gap-2">
        <UInput
          :value="shareUrl"
          readonly
          class="flex-1"
        />
        <UButton
          icon="i-heroicons-clipboard"
          @click="copyShareUrl"
        >
          Copy
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  videoUrl: string
  duration: number
  cost: number
}>()

const videoPlayer = ref<HTMLVideoElement>()
const toast = useToast()

const shareUrl = computed(() => {
  return `${window.location.origin}/watch/${props.videoUrl.split('/').pop()}`
})

const exportOptions = [
  [{
    label: 'Export as WebM',
    icon: 'i-heroicons-film',
    click: () => exportFormat('webm'),
  }],
  [{
    label: 'Export as GIF',
    icon: 'i-heroicons-gif',
    click: () => exportFormat('gif'),
  }],
  [{
    label: 'Generate HLS Stream',
    icon: 'i-heroicons-signal',
    click: () => exportFormat('hls'),
  }],
]

const downloadVideo = async () => {
  const link = document.createElement('a')
  link.href = props.videoUrl
  link.download = `adubun-${Date.now()}.mp4`
  link.click()
}

const copyShareUrl = () => {
  navigator.clipboard.writeText(shareUrl.value)
  toast.add({
    title: 'Link copied!',
    icon: 'i-heroicons-check-circle',
  })
}

const regenerate = () => {
  navigateTo('/generate', { state: { regenerate: true } })
}

const exportFormat = async (format: string) => {
  toast.add({
    title: 'Exporting...',
    description: `Converting to ${format.toUpperCase()}`,
  })
  
  await $fetch('/api/export-format', {
    method: 'POST',
    body: { videoUrl: props.videoUrl, format },
  })
}
</script>
```

**Backend Endpoint (server/api/download/[id].get.ts):**
```typescript
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const mcp = useMCP()

  // Get video metadata from database
  const video = await mcp.getFromDatabase('videos', id)
  
  if (!video) {
    throw createError({
      statusCode: 404,
      message: 'Video not found',
    })
  }

  // Generate signed URL (expires in 1 hour)
  const signedUrl = await generateSignedUrl(video.storageUrl, 3600)

  return {
    url: signedUrl,
    metadata: {
      duration: video.duration,
      resolution: video.resolution,
      aspectRatio: video.aspectRatio,
      cost: video.generationCost,
      createdAt: video.createdAt,
    },
  }
})
```

**Acceptance Criteria:**
- ✅ <1s preview load time
- ✅ HLS streaming support for large videos
- ✅ Multiple export formats (MP4, WebM, GIF)
- ✅ Shareable links with expiration
- ✅ Download tracking and analytics

---

### 6.6 API & Web Interface

**API Endpoints Summary:**

```typescript
// Input Layer
POST /api/parse-prompt          // Parse user prompt
POST /api/upload-brand-assets   // Upload logos, colors

// Planning Layer
POST /api/plan-storyboard       // Generate storyboard
PUT  /api/storyboard/:id        // Edit storyboard

// Generation Layer
POST /api/generate-assets       // Start asset generation
GET  /api/generation-status/:id // Poll generation status
POST /api/retry-segment/:id     // Retry failed segment

// Composition Layer
POST /api/compose-video         // Compose final video
POST /api/export-format         // Export to different format

// Output Layer
GET  /api/download/:id          // Get video with metadata
GET  /api/watch/:id             // Public viewing link

// Utility
GET  /api/cost/summary          // Get cost breakdown
GET  /api/history               // Generation history
DELETE /api/video/:id           // Delete video
```

**API Client Example:**
```typescript
// composables/useAPI.ts
export const useAPI = () => {
  const generateVideo = async (prompt: string, options: GenerationOptions) => {
    // Step 1: Parse prompt
    const parsed = await $fetch('/api/parse-prompt', {
      method: 'POST',
      body: { prompt, ...options },
    })

    // Step 2: Plan storyboard
    const storyboard = await $fetch('/api/plan-storyboard', {
      method: 'POST',
      body: { parsed },
    })

    // Step 3: Generate assets
    const generation = await $fetch('/api/generate-assets', {
      method: 'POST',
      body: { storyboard },
    })

    // Step 4: Poll until complete
    const completed = await pollUntilComplete(generation.jobId)

    // Step 5: Compose video
    const video = await $fetch('/api/compose-video', {
      method: 'POST',
      body: { assets: completed.assets },
    })

    return video
  }

  const pollUntilComplete = async (jobId: string) => {
    while (true) {
      const status = await $fetch(`/api/generation-status/${jobId}`)
      
      if (status.status === 'completed') {
        return status
      }
      
      if (status.status === 'failed') {
        throw new Error('Generation failed')
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return {
    generateVideo,
  }
}
```

---

## 7. Non-Functional Requirements

### 7.1 Performance Targets

**End-to-End Generation:**
- 15s video: <5 minutes
- 30s video: <10 minutes
- 60s video: <20 minutes

**API Response Times:**
- Prompt parsing: <2s
- Storyboard planning: <3s
- Status polling: <200ms
- Download initiation: <1s

**UI Performance:**
- First Contentful Paint: <1.5s
- Time to Interactive: <3s
- Smooth animations: 60fps
- Video preview load: <1s

**Optimization Strategies:**
```typescript
// 1. Parallel asset generation
const assets = await Promise.all(
  segments.map(seg => generateAsset(seg))
)

// 2. Caching repeated prompts
const cacheKey = hash(prompt)
const cached = await redis.get(cacheKey)
if (cached) return cached

// 3. Progressive rendering
const preview = await generateLowResPreview()
displayPreview(preview)
const final = await generateHighRes()

// 4. Edge function deployment
export const config = {
  runtime: 'edge',
}

// 5. Incremental Static Regeneration
export const revalidate = 3600 // 1 hour
```

### 7.2 Quality & Reliability

**Output Quality Standards:**
- Resolution: 1080p minimum (1920x1080)
- Frame rate: 30fps minimum
- Audio bitrate: 192kbps minimum
- Video codec: H.264 (libx264)
- Audio codec: AAC
- Container: MP4 with faststart flag

**Reliability Targets:**
- 90%+ successful generation rate
- <0.5s audio-video drift
- <5% failed API calls (with retry)
- 99.9% uptime for web interface

**Error Handling Pattern:**
```typescript
async function generateWithRetry(fn: Function, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        // Log to Sentry
        Sentry.captureException(error)
        throw error
      }
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      )
    }
  }
}
```

### 7.3 Cost Efficiency

**Target Costs:**
- Video generation: <$0.50 per segment
- Voice synthesis: <$0.05 per segment
- Total per video: <$2.00 per minute

**Cost Optimization Strategies:**
```typescript
// 1. Use cheaper models during development
const MODEL = process.env.NODE_ENV === 'production'
  ? 'minimax/hailuo-ai-v2.3' // $0.15/gen
  : 'stability-ai/sdxl' // $0.003/gen

// 2. Cache identical prompts
const promptHash = crypto
  .createHash('md5')
  .update(prompt)
  .digest('hex')

const cached = await getCachedAsset(promptHash)
if (cached) return cached

// 3. Batch operations
const batchedResults = await replicate.predictions.create({
  predictions: segments.map(s => ({
    model: MODEL,
    input: s.prompt,
  })),
})

// 4. Smart resolution scaling
const resolution = aspectRatio === '9:16'
  ? '1080x1920' // Vertical
  : '1920x1080' // Horizontal
```

**Cost Tracking Dashboard:**
```vue
<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Cost Analytics</h3>
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <div>
          <p class="text-sm text-gray-500">Total Spent (24h)</p>
          <p class="text-2xl font-bold">${{ totalSpent.toFixed(2) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Avg Cost/Video</p>
          <p class="text-2xl font-bold">${{ avgCost.toFixed(2) }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-500">Videos Generated</p>
          <p class="text-2xl font-bold">{{ videoCount }}</p>
        </div>
      </div>

      <!-- Cost Breakdown Chart -->
      <UChart
        type="bar"
        :data="costBreakdown"
        :options="chartOptions"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
const { breakdown } = useCostTracking()

const totalSpent = computed(() => 
  Object.values(breakdown.value).reduce((sum, val) => sum + val, 0)
)

const videoCount = computed(() => {
  // Calculate from breakdown
  return Math.ceil(totalSpent.value / 1.5)
})

const avgCost = computed(() => totalSpent.value / videoCount.value)

const costBreakdown = computed(() => ({
  labels: Object.keys(breakdown.value),
  datasets: [{
    label: 'Cost ($)',
    data: Object.values(breakdown.value),
    backgroundColor: '#6366f1',
  }],
}))
</script>
```

### 7.4 Accessibility & UX

**WCAG AA Compliance:**
- Color contrast ratio ≥4.5:1
- Keyboard navigation support
- Screen reader friendly
- Focus indicators on all interactive elements
- Alt text for all images/videos

**Accessibility Implementation:**
```vue
<template>
  <div>
    <!-- Semantic HTML -->
    <main role="main" aria-label="Video generation interface">
      
      <!-- Skip to content link -->
      <a href="#main-content" class="sr-only focus:not-sr-only">
        Skip to main content
      </a>

      <!-- Accessible form -->
      <UForm aria-label="Video generation form">
        <UFormGroup
          label="Video prompt"
          required
          :help="errors.prompt"
          :error="!!errors.prompt"
        >
          <UTextarea
            v-model="form.prompt"
            aria-describedby="prompt-help"
            aria-required="true"
            :aria-invalid="!!errors.prompt"
          />
        </UFormGroup>

        <UButton
          type="submit"
          :disabled="loading"
          :aria-busy="loading"
        >
          <span v-if="!loading">Generate Video</span>
          <span v-else>
            <span class="sr-only">Generating video, please wait</span>
            Generating...
          </span>
        </UButton>
      </UForm>

      <!-- Live region for status updates -->
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ statusMessage }}
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const statusMessage = ref('')

// Announce status updates to screen readers
watch(generationStatus, (newStatus) => {
  statusMessage.value = `Generation status: ${newStatus}`
})
</script>

<style>
/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
</style>
```

**Real-Time Progress with WebSockets:**
```typescript
// server/api/ws/generation.ts
import { defineWebSocketHandler } from 'h3'

export default defineWebSocketHandler({
  async open(peer) {
    console.log('WebSocket connection opened')
  },

  async message(peer, message) {
    const data = JSON.parse(message.text())
    
    if (data.type === 'subscribe') {
      // Subscribe to generation updates
      const jobId = data.jobId
      
      // Emit progress updates
      const interval = setInterval(async () => {
        const status = await getGenerationStatus(jobId)
        peer.send(JSON.stringify(status))
        
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval)
        }
      }, 1000)
    }
  },

  async close(peer) {
    console.log('WebSocket connection closed')
  },
})
```

**Progress Component with WebSocket:**
```vue
<template>
  <div>
    <UProgress :value="progress" :max="100" />
    <p>{{ statusText }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ jobId: string }>()

const progress = ref(0)
const statusText = ref('Initializing...')

onMounted(() => {
  const ws = new WebSocket(`ws://localhost:3000/api/ws/generation`)
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      jobId: props.jobId,
    }))
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    progress.value = data.progress
    statusText.value = data.statusText
  }
  
  onUnmounted(() => {
    ws.close()
  })
})
</script>
```

---

## 8. Testing Strategy

### 8.1 E2E Testing with Playwright

**Test Suite Structure:**

```
tests/
└── e2e/
    ├── generation-flow.spec.ts    # Full generation flow
    ├── ui-components.spec.ts       # Component interactions
    ├── error-handling.spec.ts      # Error scenarios
    ├── cost-tracking.spec.ts       # Cost monitoring
    └── accessibility.spec.ts       # A11y compliance
```

**Generation Flow Test (tests/e2e/generation-flow.spec.ts):**
```typescript
import { test, expect } from '@playwright/test'

test.describe('Video Generation Flow', () => {
  test('should generate video from prompt', async ({ page }) => {
    // Navigate to home page
    await page.goto('/')
    
    // Fill in prompt
    await page.fill('textarea[placeholder*="Describe"]', 
      'Create a 30s Instagram ad for luxury watches with elegant gold aesthetics'
    )
    
    // Select duration
    await page.selectOption('select[name="duration"]', '30')
    
    // Select aspect ratio
    await page.selectOption('select[name="aspectRatio"]', '9:16')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Wait for generation page
    await expect(page).toHaveURL(/\/generate/)
    
    // Check progress indicator appears
    await expect(page.locator('[role="progressbar"]')).toBeVisible()
    
    // Wait for completion (with timeout)
    await expect(page.locator('text=Completed')).toBeVisible({
      timeout: 600000, // 10 minutes
    })
    
    // Check video preview
    const video = page.locator('video')
    await expect(video).toBeVisible()
    
    // Verify video can play
    await video.click()
    await page.waitForTimeout(2000)
    const isPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(isPaused).toBe(false)
    
    // Check download button
    await expect(page.locator('button:has-text("Download")')).toBeEnabled()
  })

  test('should handle invalid prompts', async ({ page }) => {
    await page.goto('/')
    
    // Try to submit empty form
    await page.click('button[type="submit"]')
    
    // Should show validation error
    await expect(page.locator('text=required')).toBeVisible()
  })

  test('should allow prompt editing in storyboard', async ({ page }) => {
    await page.goto('/')
    
    // Fill prompt and generate
    await page.fill('textarea', 'Test ad for smartwatch')
    await page.click('button[type="submit"]')
    
    // Wait for storyboard
    await expect(page.locator('text=Storyboard')).toBeVisible()
    
    // Click edit on first segment
    await page.click('button[aria-label="Edit segment"]').first()
    
    // Modify segment description
    await page.fill('textarea[name="description"]', 'Updated description')
    await page.click('button:has-text("Save")')
    
    // Verify update
    await expect(page.locator('text=Updated description')).toBeVisible()
  })

  test('should track costs accurately', async ({ page }) => {
    await page.goto('/')
    
    // Start generation
    await page.fill('textarea', 'Simple test video')
    await page.click('button[type="submit"]')
    
    // Wait for cost tracker to appear
    const costTracker = page.locator('[data-testid="cost-tracker"]')
    await expect(costTracker).toBeVisible()
    
    // Verify cost updates
    const initialCost = await costTracker.locator('text=/\\$\\d+\\.\\d+/').textContent()
    expect(parseFloat(initialCost!.replace(', ''))).toBeGreaterThan(0)
    
    // Wait a bit and check if cost increased
    await page.waitForTimeout(5000)
    const updatedCost = await costTracker.locator('text=/\\$\\d+\\.\\d+/').textContent()
    expect(parseFloat(updatedCost!.replace(', '')))
      .toBeGreaterThanOrEqual(parseFloat(initialCost!.replace(', '')))
  })
})
```

**UI Component Tests (tests/e2e/ui-components.spec.ts):**
```typescript
import { test, expect } from '@playwright/test'

test.describe('UI Components', () => {
  test('should render Nuxt UI components correctly', async ({ page }) => {
    await page.goto('/')
    
    // Check UCard
    await expect(page.locator('[data-headlessui-state]')).toBeVisible()
    
    // Check UButton
    const button = page.locator('button:has-text("Generate")')
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    
    // Check UTextarea
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('Test input')
    expect(await textarea.inputValue()).toBe('Test input')
  })

  test('should handle dark mode toggle', async ({ page }) => {
    await page.goto('/')
    
    // Find dark mode toggle
    const toggle = page.locator('[aria-label="Toggle dark mode"]')
    
    // Check initial state
    const initialClass = await page.locator('html').getAttribute('class')
    
    // Toggle dark mode
    await toggle.click()
    
    // Verify class changed
    const updatedClass = await page.locator('html').getAttribute('class')
    expect(updatedClass).not.toBe(initialClass)
  })

  test('should display notifications', async ({ page }) => {
    await page.goto('/')
    
    // Trigger an action that shows notification
    await page.fill('textarea', 'a'.repeat(1001)) // Too long
    await page.click('button[type="submit"]')
    
    // Check notification appears
    await expect(page.locator('[role="alert"]')).toBeVisible()
    
    // Verify notification content
    await expect(page.locator('text=/maximum/i')).toBeVisible()
  })
})
```

**Accessibility Tests (tests/e2e/accessibility.spec.ts):**
```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility', () => {
  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/')
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    
    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/')
    
    // Tab through form elements
    await page.keyboard.press('Tab')
    let focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBe('TEXTAREA')
    
    await page.keyboard.press('Tab')
    focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBe('SELECT')
    
    // Should be able to submit with Enter
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
  })

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/')
    
    // Check form has label
    const form = page.locator('form')
    await expect(form).toHaveAttribute('aria-label')
    
    // Check required fields are marked
    const textarea = page.locator('textarea[aria-required="true"]')
    await expect(textarea).toBeVisible()
    
    // Check buttons have accessible names
    const button = page.locator('button[type="submit"]')
    const buttonText = await button.textContent()
    expect(buttonText?.trim()).toBeTruthy()
  })
})
```

### 8.2 Best Practices for Testing

**1. Test Organization:**
```typescript
// Use descriptive test names
test('should generate 30-second vertical video for social media', async ({ page }) => {
  // Arrange
  await page.goto('/')
  
  // Act
  await fillVideoForm(page, {
    prompt: '30s IG ad for watches',
    duration: 30,
    aspectRatio: '9:16',
  })
  await page.click('button[type="submit"]')
  
  // Assert
  await expect(page.locator('video')).toHaveAttribute('src', /.+\.mp4$/)
})

// Helper functions for reusability
async function fillVideoForm(page, options) {
  await page.fill('textarea', options.prompt)
  await page.selectOption('select[name="duration"]', String(options.duration))
  await page.selectOption('select[name="aspectRatio"]', options.aspectRatio)
}
```

**2. Visual Regression Testing:**
```typescript
test('should match visual snapshot', async ({ page }) => {
  await page.goto('/')
  
  // Take screenshot
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixels: 100,
  })
})
```

**3. Performance Testing:**
```typescript
test('should load homepage within performance budget', async ({ page }) => {
  const startTime = Date.now()
  await page.