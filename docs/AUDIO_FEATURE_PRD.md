# PRD: Audio Layer for AdUbun Video Generation

## Overview

Add consistent, high-quality audio across all 4 video segments (Hook, Body1, Body2, CTA) to create professional, engaging ad content with background music and optional narration.

## Problem Statement

Currently, Veo 3.1 generates audio independently for each of the 4 video segments, resulting in:
- **Inconsistent audio** across segments (different tones, volumes, styles)
- **Jarring transitions** when segments are stitched together
- **No control** over narration timing or background music style
- **Unprofessional output** that requires manual audio editing

## Goals

1. **Consistency**: Single cohesive audio experience across entire 16-second ad
2. **Control**: User can select audio style and tone
3. **Quality**: Professional-grade audio with proper mixing
4. **Sync**: Audio aligns with visual moments (product reveals, actions)
5. **Flexibility**: Support music-only, narration-only, or both

## Success Metrics

- 95%+ of users select custom audio options (vs default)
- Audio transitions rated smooth by users (survey)
- Reduced post-generation editing time by 80%
- Final videos have consistent volume levels across all segments

---

## User Stories

### Primary Users: Marketing Teams, Content Creators

**As a marketer**, I want to:
1. Choose background music style that matches my brand
2. Add professional narration that guides viewers through the ad
3. Have audio seamlessly flow across all 4 segments
4. Preview audio before generating full video
5. Adjust volume levels for music vs narration

**As a content creator**, I want to:
1. Generate videos without audio (silent) for my own music
2. Use ambient sounds instead of music for lifestyle brands
3. Ensure narration syncs with key visual moments
4. Reuse the same audio style across multiple ad variations

---

## Audio Types

### 1. Background Music/Ambient Sounds
**Description**: Continuous audio layer spanning all 16 seconds

**Options**:
- **Music Styles**:
  - Upbeat Electronic (energetic products)
  - Calm Piano (luxury/wellness)
  - Corporate Professional (B2B)
  - Acoustic Folk (organic/natural)
  - Dramatic Orchestral (high-end)
  - Ambient Soundscape (lifestyle)
  
- **Ambient Sounds**:
  - Cafe atmosphere
  - Nature sounds
  - Office environment
  - Urban street
  - Kitchen sounds

**Technical Requirements**:
- Duration: Exactly 16 seconds (or loopable)
- Format: WAV or MP3, 48kHz, stereo
- Volume: Adjustable 0-100% (default: 30%)
- Fade in/out: Optional 0.5s fade at start/end

### 2. Narration (Voiceover)
**Description**: Spoken script for each segment, timed to visuals

**Options**:
- **Voice Selection**:
  - Professional Male (authoritative)
  - Professional Female (trustworthy)
  - Friendly Male (casual)
  - Friendly Female (warm)
  - Energetic Young (Gen Z)
  
- **Script Source**:
  - Auto-generated from story content
  - User-provided custom script
  - AI-enhanced from story + product details

**Technical Requirements**:
- Per-segment generation (4 separate audio files)
- Duration: Matches segment duration (typically 4s each)
- Format: MP3, 48kHz, mono
- Volume: Full (100%), mixed at lower level than music
- Timing: Synchronized to segment start/end

### 3. Silent (No Audio)
**Description**: Generate videos without audio for custom post-production

---

## Technical Architecture

### Generation Flow

```
User Input
  ↓
[Story Generation]
  ↓
[Audio Configuration]
  - Select audio type: Music / Narration / Both / Silent
  - Select music style OR ambient sound
  - Select narrator voice (if narration enabled)
  - Set volume levels
  ↓
[Generate Storyboard] (as usual)
  ↓
[Generate Frame Images] (as usual)
  ↓
[Generate Videos] ← **WITH generate_audio: false**
  ↓
[Generate Background Music] ← **NEW: ONE 16s track**
  ↓
[Generate Narration] ← **NEW: 4 voice clips (if enabled)**
  ↓
[Compose Final Video] ← **Mix: video + music + narration**
  ↓
Final Video with Professional Audio
```

### Data Model Changes

#### Storyboard Meta
```typescript
interface StoryboardMeta {
  // ... existing fields ...
  audioConfig: {
    type: 'music' | 'narration' | 'both' | 'silent'
    
    // Music settings
    musicStyle?: 'upbeat-electronic' | 'calm-piano' | 'corporate' | 'acoustic-folk' | 'dramatic-orchestral' | 'ambient'
    musicUrl?: string  // Generated or uploaded
    musicVolume: number  // 0-100, default: 30
    
    // Narration settings
    narratorVoice?: 'professional-male' | 'professional-female' | 'friendly-male' | 'friendly-female' | 'energetic-young'
    narratorScripts?: {
      hook: string
      body1: string
      body2: string
      cta: string
    }
  }
}
```

#### Segment (unchanged, uses existing voiceUrl)
```typescript
interface Segment {
  // ... existing fields ...
  voiceUrl?: string  // Narration for this segment
}
```

### API Integrations

#### 1. Music Generation
**Service**: Suno AI (recommended) or MusicLM

**Endpoint**: `/api/generate-background-music`
```typescript
POST /api/generate-background-music
{
  style: 'upbeat-electronic',
  duration: 16,
  mood: 'energetic',
  prompt: 'Upbeat electronic music, 120 BPM, modern, clean, no vocals'
}

Response:
{
  musicUrl: 'https://...mp3',
  duration: 16.0,
  format: 'mp3'
}
```

**Cost**: ~$0.10 per generation

#### 2. Narration Generation
**Service**: ElevenLabs (recommended)

**Endpoint**: `/api/generate-narration`
```typescript
POST /api/generate-narration
{
  segments: [
    { text: 'Tired of unhealthy eating?', duration: 4.0 },
    { text: 'Meet Everyday Meals', duration: 4.0 },
    { text: 'Fresh, delicious, delivered daily', duration: 4.0 },
    { text: 'Order now and save 20%', duration: 4.0 }
  ],
  voice: 'professional-male',
  stability: 0.75,
  similarity_boost: 0.85
}

Response:
{
  segments: [
    { voiceUrl: 'https://...mp3', duration: 3.8 },
    { voiceUrl: 'https://...mp3', duration: 3.5 },
    { voiceUrl: 'https://...mp3', duration: 4.1 },
    { voiceUrl: 'https://...mp3', duration: 3.9 }
  ]
}
```

**Cost**: ~$0.15 per minute ($0.01 per segment × 4 = $0.04 total)

#### 3. Video Generation (Modified)
**Service**: Replicate (Veo 3.1)

**Change**: Set `generate_audio: false`
```typescript
{
  model: 'google/veo-3.1',
  prompt: '...',
  generate_audio: false,  // ← DISABLE Veo audio
  // ... other params
}
```

---

## Synchronization Strategy

### Level 1: Basic Sync (MVP)
**Method**: Sequential concatenation
- Background music: Starts at 0s, plays for 16s
- Narration: Each segment plays sequentially (0-4s, 4-8s, 8-12s, 12-16s)
- FFmpeg handles timing automatically via `concat` filter

**Pros**: Simple, reliable, already implemented
**Cons**: No precise timing control

### Level 2: Smart Sync (Future)
**Method**: Timing metadata
1. Analyze video for key moments (scene changes, product reveals)
2. Generate narration with timing markers
3. Use FFmpeg `adelay` to sync audio to specific frames

**Example**:
```typescript
{
  hook: {
    video: 'hook.mp4',
    narration: [
      { text: "Tired of unhealthy eating?", startTime: 0.0 },
      { text: "Meet Everyday Meals", startTime: 2.1 },  // Synced to product reveal
    ]
  }
}
```

### Level 3: AI-Assisted Sync (Advanced)
**Method**: Veo generates video with timing hints
- Use Veo's audio as timing reference
- Extract audio timing patterns
- Generate custom narration matching those patterns
- Replace Veo audio with custom audio

---

## User Interface

### Audio Configuration Panel

**Location**: Between story selection and storyboard generation

```
┌─────────────────────────────────────────┐
│  Audio Configuration                    │
├─────────────────────────────────────────┤
│                                         │
│  Audio Type                             │
│  ○ Background Music                     │
│  ○ Narration                            │
│  ● Both (Music + Narration)            │
│  ○ Silent (No Audio)                    │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Background Music Style                 │
│  [Upbeat Electronic        ▼]          │
│                                         │
│  Music Volume: ◀──────●────▶ 30%      │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Narrator Voice                         │
│  [Professional Male        ▼]          │
│                                         │
│  Narration Script                       │
│  ☑ Auto-generate from story            │
│  ☐ Custom script (advanced)            │
│                                         │
│  [Preview Audio] [Continue]            │
│                                         │
└─────────────────────────────────────────┘
```

### Preview Feature
**Before generating full video**, allow preview of:
- Background music (16s)
- Narration for each segment (text-to-speech preview)
- Combined preview (music + narration)

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)
- [ ] Add audio configuration UI
- [ ] Integrate Suno AI for music generation
- [ ] Integrate ElevenLabs for narration
- [ ] Disable Veo audio (`generate_audio: false`)
- [ ] Update composition to mix music + narration
- [ ] Basic volume controls

**Deliverable**: Users can select music style and narrator, get consistent audio

### Phase 2: Enhanced Control (Week 3-4)
- [ ] Custom script input for narration
- [ ] Audio preview before generation
- [ ] Upload custom music option
- [ ] Fade in/out controls
- [ ] Save/reuse audio presets

**Deliverable**: Full control over audio customization

### Phase 3: Smart Sync (Week 5-6)
- [ ] Analyze videos for key moments
- [ ] Timing-aware narration generation
- [ ] Sync narration to visual events
- [ ] Audio waveform visualization

**Deliverable**: Precisely timed, professional-quality audio

---

## Cost Analysis

### Per 16-Second Video:

| Component | Service | Cost |
|-----------|---------|------|
| Video Gen (4 clips) | Replicate Veo 3.1 | $1.20 |
| Background Music | Suno AI | $0.10 |
| Narration (4 clips) | ElevenLabs | $0.04 |
| Frame Generation | Replicate | $0.25 |
| **Total** | | **$1.59** |

**Comparison**:
- Current (with Veo audio): $1.45
- With custom audio: $1.59
- **Additional cost**: $0.14 (+9.6%)

**Value**: Professional, consistent audio worth the marginal cost increase

---

## Testing & Validation

### Test Cases:

1. **Music Only**
   - Generate with different music styles
   - Verify 16s duration
   - Check volume levels (music should be audible but not overpowering)
   - Test loop/trim for shorter music

2. **Narration Only**
   - Generate 4-segment narration
   - Verify sequential playback
   - Check for gaps/overlaps
   - Test different voices

3. **Both Music + Narration**
   - Verify proper mixing (narration louder than music)
   - Check for audio clipping
   - Test volume balance

4. **Silent**
   - Verify videos have no audio track
   - Confirm file sizes are smaller

5. **Edge Cases**
   - Very long narration (clips with music)
   - Music shorter than 16s (should loop)
   - Custom uploaded music
   - Network failures during audio generation

---

## Success Criteria

### Must Have:
- ✅ Background music plays continuously for 16s
- ✅ No audio gaps or glitches between segments
- ✅ Narration is clear and audible over music
- ✅ Volume levels are balanced
- ✅ Audio generation completes in <30s

### Should Have:
- ✅ Preview audio before full generation
- ✅ 5+ music style options
- ✅ 5+ narrator voice options
- ✅ Custom script input

### Nice to Have:
- ✅ Upload custom music files
- ✅ Advanced timing controls
- ✅ Audio waveform visualization
- ✅ Save audio presets

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Music generation slow (>60s) | High | Cache popular styles, use faster service |
| ElevenLabs rate limits | Medium | Implement queuing, batch requests |
| Audio sync issues | High | Extensive testing, fallback to simple concat |
| Increased costs | Low | Offer free tier with limited audio options |
| Music licensing concerns | Medium | Use royalty-free music service, clear licensing |

---

## Future Enhancements

1. **Multi-language Narration**: Support 10+ languages for global markets
2. **Voice Cloning**: Upload sample, use custom brand voice
3. **Music Matching**: AI suggests music based on video content
4. **Dynamic Volume**: Auto-adjust music volume when narration plays
5. **Sound Effects**: Add whooshes, clicks for emphasis
6. **A/B Testing**: Generate multiple audio versions for testing

---

## Appendix: Existing Infrastructure

### Current Audio Support
The system already has infrastructure for:
- Background music mixing (via `compose-video-smart.post.ts`)
- Per-segment voiceover (via `voiceUrl` in segments)
- FFmpeg audio composition with volume controls
- Audio concatenation and mixing

### What's Missing:
- UI for audio configuration
- Music generation service integration
- Narration generation service integration
- Automatic script generation from story
- Audio preview functionality

### Leverage Points:
The `composeVideoWithSmartStitching` function already supports:
- `backgroundMusicPath` - for continuous music
- `musicVolume` - for volume control
- `voicePath` per clip - for narration
- Automatic audio mixing and synchronization

**Implementation can focus on**: UI + service integrations, not reinventing audio composition.

