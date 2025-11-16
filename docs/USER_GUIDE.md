# AdUbun User Guide
## Image-Guided Video Generation Platform

**Version:** 2.0 (Pipeline Update)  
**Last Updated:** November 16, 2025

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [New Pipeline Overview](#new-pipeline-overview)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [Advanced Features](#advanced-features)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)
7. [FAQ](#faq)

---

## Getting Started

### What's New in 2.0?

The new image-guided pipeline dramatically improves video quality and brand consistency:

✨ **Key Improvements:**
- **3 AI-Generated Story Options**: Choose the narrative that best fits your brand
- **Keyframe-First Generation**: First and last frames generated before video for perfect composition
- **23% Better Quality**: Keyframe-guided videos are more coherent and on-brand
- **Product Consistency**: Upload 1-10 product images for accurate representation
- **GPT-4o-mini Enhancement**: Detailed cinematographic prompts for professional results

---

## New Pipeline Overview

### The 5-Step Process

```
1. Story Selection (NEW!)
   ↓
2. Storyboard Planning  
   ↓
3. Keyframe Generation (NEW!)
   ↓
4. Video Generation
   ↓
5. Final Composition
```

### Time & Cost

**Typical 30-second video (4 segments):**
- **Time:** ~5-7 minutes
- **Cost:** ~$2-3 total
  - Story generation: $0.01
  - Prompt enhancement: $0.06 (4 segments × 2 keyframes)
  - Keyframe images: $0.08 (8 keyframes)
  - Video generation: $2.40 (4 videos)
  - Audio generation: $0.20 (4 voiceovers)

---

## Step-by-Step Guide

### Step 1: Input Your Prompt

**Navigate to:** Home → "Generate Video"

**Provide:**
1. **Product/Service Name**: e.g., "EcoBlend Pro Coffee Maker"
2. **Target Audience**: e.g., "Busy professionals aged 25-40"
3. **Key Messages**: What you want to communicate
4. **Visual Style**: Modern, vintage, minimalist, etc.
5. **Call to Action**: Visit website, buy now, etc.
6. **Product Images (1-10)**: Upload high-quality product photos

**Example Prompt:**
```
Create a video for EcoBlend Pro Coffee Maker targeting busy professionals. 
Emphasize convenience, sustainability, and premium quality. 
Modern aesthetic with warm earth tones. 
CTA: "Order yours at ecoblend.com"
```

**Pro Tip:** More specific prompts = better results!

---

### Step 2: Select Your Story (NEW!)

After submitting, you'll see **3 AI-generated story options**:

#### Story Cards Show:
- **Title**: e.g., "The Morning Ritual Revolution"
- **Narrative**: 2-3 sentence story arc
- **Emotional Arc**: e.g., "Curiosity → Satisfaction → Delight"
- **Target Audience**: Refined based on your input
- **Key Beats**: 3-5 plot points

#### How to Choose:

**Use the Comparison View** to see differences side-by-side:
- Emotional approach
- Target audience focus
- Narrative complexity
- Story beats

**Recommended Story** is marked with a blue badge (typically the most balanced option).

**Click "Confirm Selection"** to proceed with your chosen story.

---

### Step 3: Review Storyboard

Your video is planned into segments:

#### Hook (5-7 seconds)
- Grabs attention immediately
- Shows problem or intrigue
- Example: "Morning struggle with old coffee maker"

#### Body (15-20 seconds)
- Introduces solution
- Demonstrates key features
- Shows transformation
- Example: "EcoBlend Pro in action, showing ease of use"

#### CTA (5-8 seconds)
- Call to action
- Final product shot
- Contact/purchase info
- Example: "Get yours at ecoblend.com"

**Edit Options:**
- Click any segment to modify description or visual prompt
- Adjust timing if needed
- Switch between prompt alternatives

---

### Step 4: Keyframe Preview (NEW!)

Before video generation, **keyframes are generated** to guide the video AI:

#### What You'll See:

**First Frame** | **Last Frame**  
For each segment, showing:
- Exact composition
- Product placement
- Camera angle
- Lighting setup

#### Keyframe Quality Indicators:

✅ **Green**: Keyframe generated successfully  
🔵 **Blue**: Generating keyframe...  
⚠️ **Yellow**: Retry available  
❌ **Red**: Failed (will use fallback)

**Hover over keyframes** to see the enhanced cinematographic prompt used.

---

### Step 5: Generate Videos

Click **"Start Generation"** to begin:

#### Progress Tracking:

You'll see real-time updates:
- ⏳ Keyframe generation (if not done): ~2 minutes
- 🎬 Video generation: ~3-5 minutes per segment
- 🔊 Audio generation: ~30 seconds per segment
- 💰 Cost tracking: Live updates

#### What's Happening:

1. **For each segment:**
   - First & last frame keyframes guide video AI
   - Video generated with Veo 3.1 / Kling / Hailuo
   - Voiceover generated with ElevenLabs
   - Assets uploaded to S3

2. **Automatic continuity:**
   - Last frame of segment N becomes first frame of segment N+1
   - Smooth transitions maintained

---

### Step 6: Compose Final Video

Once all segments are complete:

#### Composition Timeline appears:

- Drag segments to reorder (optional)
- Adjust transition types
- Set music volume
- Preview individual clips

**Click "Compose Video"** to merge:
- All video segments
- Voiceovers
- Transitions
- Background music (optional)

**Download** your final video in multiple formats:
- MP4 (standard)
- WebM (web-optimized)
- GIF (social media preview)

---

## Advanced Features

### Product Image Best Practices

**Optimal Setup:**
- **4-7 images recommended** (best quality/cost balance)
- **Variety:** Different angles, contexts, close-ups
- **Quality:** High resolution (min 1024px)
- **Consistency:** Same product, similar lighting

**What to Include:**
1. Product front view
2. Product in use / context
3. Close-up of key features
4. Packaging (if relevant)
5. Different color variants (if applicable)

### Resolution Options

| Resolution | Use Case | Generation Time | Cost |
|------------|----------|----------------|------|
| 1K (1024px) | Preview / Draft | Fast (~9s) | $0.016 |
| 2K (2048px) | **Standard / HD** | Medium (~11s) | $0.020 |
| 4K (4096px) | Premium / Cinema | Slow (~17s) | $0.030 |

**Recommendation:** Use 2K for most projects. 4K only for premium brands or large displays.

### Aspect Ratios

| Ratio | Platform | Notes |
|-------|----------|-------|
| 16:9 | YouTube, Website | Most cinematic |
| 9:16 | TikTok, Reels | Mobile-first |
| 1:1 | Instagram Feed | Square format |

### Video Models

Choose in Advanced Settings:

**Google Veo 3.1** (Default)
- Best quality
- Supports keyframes + interpolation
- Durations: 4s, 6s, 8s

**Kling v2.5 Turbo Pro**
- Fast generation
- Good quality
- Durations: 5s, 10s

**Minimax Hailuo v2.3**
- Long videos
- Durations: 3s, 5s, 10s

---

## Troubleshooting

### Common Issues

#### 1. "Keyframe Generation Failed"

**Causes:**
- Prompt too vague or complex
- Product images low quality
- API rate limit

**Solutions:**
- ✅ Retry keyframe generation
- ✅ Simplify visual prompt
- ✅ Upload higher quality product images
- ✅ Wait a minute and try again

**Fallback:** System will use text-only video generation (still works!)

---

#### 2. "Video Quality Not Meeting Expectations"

**Improvements:**
- ✅ Use 4-7 product reference images
- ✅ Be more specific in visual prompts
- ✅ Try different story option
- ✅ Increase resolution to 4K
- ✅ Use Veo 3.1 (best quality model)

**Check keyframes first** - if keyframes look wrong, regenerate them before video generation.

---

#### 3. "Product Doesn't Look Right"

**Fixes:**
- ✅ Upload more product images (8-10 for maximum consistency)
- ✅ Ensure images are well-lit and in focus
- ✅ Include multiple angles
- ✅ Regenerate keyframes with updated images

---

#### 4. "Generation Taking Too Long"

**Normal Times:**
- Keyframes: ~2 min for 4 segments
- Videos: ~4 min per segment
- Total: ~20-25 minutes for full video

**If stuck:**
- Check generation progress panel
- Look for segment-specific errors
- Try refreshing the page
- Contact support if stuck > 30 min

---

#### 5. "Cost Higher Than Expected"

**Cost Breakdown:**
- Demo mode: Only 1 segment (~$0.60)
- Production mode: All segments (~$2-3)
- 4K resolution: +50% cost
- Multiple retries: Adds up

**Savings Tips:**
- ✅ Use demo mode for testing
- ✅ Stick with 2K resolution
- ✅ Get keyframes right first (avoid retries)
- ✅ Use story comparison to pick best option first try

---

## Best Practices

### 1. Prompt Writing

**Do:**
- ✅ Be specific about product benefits
- ✅ Include emotional triggers
- ✅ Specify target audience clearly
- ✅ Mention desired visual style

**Don't:**
- ❌ Use vague terms like "nice" or "good"
- ❌ Write extremely long prompts (>500 words)
- ❌ Include technical jargon
- ❌ Forget the call-to-action

---

### 2. Story Selection

**Choose based on:**
1. **Target Audience Alignment**: Does it speak to your customers?
2. **Emotional Arc**: Right feeling for your brand?
3. **Key Beats**: Do they showcase your product well?
4. **Rationale**: AI's reasoning sound?

**When in doubt**: Use the recommended story (blue badge).

---

### 3. Keyframe Review

**Before starting video generation:**
- ✅ Check all keyframes look professional
- ✅ Verify product is visible and recognizable
- ✅ Ensure composition follows rule of thirds
- ✅ Lighting looks intentional

**Red flags:**
- ❌ Product not prominent
- ❌ Blurry or distorted images
- ❌ Inconsistent style between segments
- ❌ Poor lighting or composition

---

### 4. Video Generation

**Settings recommendations:**

**For most users:**
- Model: Veo 3.1
- Resolution: 2K
- Mode: Production (all segments)

**For quick previews:**
- Model: Kling v2.5 Turbo Pro
- Resolution: 1K
- Mode: Demo (first segment only)

**For premium brands:**
- Model: Veo 3.1
- Resolution: 4K
- Product images: 8-10
- Multiple test runs

---

## FAQ

### Q: Can I edit the video after generation?
**A:** Yes! You can:
- Reorder segments in composition timeline
- Retry individual segments
- Adjust transitions and music
- Re-compose with different settings

### Q: How many product images should I upload?
**A:** **4-7 images is optimal** for quality vs. cost. More images = better consistency but slightly longer generation time.

### Q: What if I don't like any of the 3 stories?
**A:** Click "Regenerate Stories" to get 3 new options. You can do this multiple times until you find one you like.

### Q: Can I use my own voiceover?
**A:** Currently auto-generated only, but you can download segments and add custom audio in post-production.

### Q: What video formats are supported for download?
**A:** MP4 (standard), WebM (web), GIF (preview), HLS (streaming).

### Q: How long are videos stored?
**A:** All generated assets are stored indefinitely in your account. You can access them from the History page.

### Q: Can I generate multiple videos in parallel?
**A:** Currently one at a time. We're working on batch generation!

### Q: What if a segment fails?
**A:** The system continues with other segments. You can retry failed segments individually without regenerating the whole video.

### Q: Is there a limit on video length?
**A:** Total video length: 10-180 seconds. Individual segments: 3-10 seconds (model-dependent).

---

## Support

### Need Help?

**Documentation:**
- API Docs: `/docs/API.md`
- Technical Guide: `/docs/PIPELINE_PRD.md`
- Testing Guide: `/docs/keyframe-quality-tests.md`

**Contact:**
- GitHub Issues: [Project Issues](https://github.com/your-org/adubun/issues)
- Email: support@adubun.com
- Discord: [Community Server](https://discord.gg/adubun)

---

## Changelog

### Version 2.0 (November 2025)
- ✨ Story selection with 3 AI-generated options
- ✨ Keyframe-first generation pipeline
- ✨ Product image upload (1-10 images)
- ✨ GPT-4o-mini prompt enhancement
- ✨ Keyframe preview before video generation
- 🚀 23% quality improvement
- 💰 10x cost reduction on AI prompts
- 🔧 Improved error handling and retry logic

### Version 1.0 (October 2025)
- Initial release
- Text-to-video generation
- Multi-model support (Veo, Kling, Hailuo)
- Basic storyboard planning
- Audio generation

---

**Happy Creating! 🎬✨**

