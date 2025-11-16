# AdUbun API Reference

**Version:** 2.0  
**Base URL:** `http://localhost:3000/api` (development)

Complete API documentation for the image-guided video generation pipeline.

## Quick Links
- [Story Generation](#post-apigenerate-stories)
- [Keyframe Generation](#post-apigenerate-keyframes)
- [Asset Generation](#post-apigenerate-assets)
- [Video Composition](#post-apicompose-video)
- [Cost Tracking](#get-apicostsummary)

---

## POST /api/generate-stories

Generate 3 AI story options based on product and target audience.

**Request:**
```json
{
  "parsed": {
    "product": "EcoBlend Pro Coffee Maker",
    "targetAudience": "Busy professionals 25-40",
    "mood": "inspiring",
    "keyMessages": ["Convenience", "Sustainability"],
    "visualStyle": "modern",
    "callToAction": "Order at ecoblend.com"
  },
  "productImages": ["url1", "url2"]
}
```

**Response:** 3 story options with titles, narratives, emotional arcs, and key beats.

**Cost:** ~$0.01

---

## POST /api/generate-keyframes

Generate first & last frame keyframes for a segment.

**Request:**
```json
{
  "segment": { /* segment data */ },
  "segmentIndex": 0,
  "productName": "EcoBlend Pro",
  "productImages": ["url1", "url2"],
  "aspectRatio": "16:9",
  "resolution": "2K"
}
```

**Response:** Prediction IDs and enhanced prompts for both keyframes.

**Cost:** ~$0.04 per segment (2 keyframes)

---

## POST /api/generate-assets

Generate all video and audio assets for a storyboard.

**Pipeline:**
1. Generate keyframes (if product images provided)
2. Generate videos using keyframes
3. Generate voiceovers
4. Upload to S3

**Request:** Storyboard object with segments and meta data.

**Response:** Job ID for progress tracking.

**Time:** ~5-7 minutes for 4-segment video  
**Cost:** ~$2-3 total

---

## GET /api/generation-status/:jobId

Poll generation progress.

**Response:** Real-time status, segment progress, keyframe URLs, video URLs.

---

## POST /api/compose-video

Merge segments into final video.

**Request:** Array of clips with URLs and timing.

**Response:** Final video URL.

---

## GET /api/cost/summary

Get cost breakdown.

**Query:** `startTime`, `endTime` (optional)

**Response:** Total cost and breakdown by operation type.

---

For complete documentation, see `/docs/USER_GUIDE.md`

