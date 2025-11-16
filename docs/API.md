# AdUbun API Documentation

**Version:** 1.0  
**Last Updated:** November 16, 2025  
**Base URL:** `http://localhost:3000/api` (development)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Story Generation](#story-generation)
3. [Prompt Parsing](#prompt-parsing)
4. [Storyboard Planning](#storyboard-planning)
5. [Asset Generation](#asset-generation)
6. [Video Composition](#video-composition)
7. [Cost Tracking](#cost-tracking)
8. [Error Handling](#error-handling)

---

## Authentication

Currently, the API does not require authentication for local development. All endpoints are accessible without API keys.

**Environment Variables Required:**
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o/GPT-4o-mini
- `ELEVENLABS_API_KEY` - ElevenLabs API key for text-to-speech
- `REPLICATE_API_TOKEN` - Replicate API token for video/image generation
- `AWS_ACCESS_KEY_ID` - AWS access key for S3 uploads
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3 uploads
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_S3_BUCKET` - S3 bucket name for video storage

---

## Story Generation

### POST `/api/generate-stories`

Generate 3 diverse story narrative options for a video based on parsed prompt data and optional product images.

**Request Body:**

```json
{
  "parsed": {
    "product": "Artisanal Coffee Beans",
    "targetAudience": "Coffee enthusiasts aged 25-45",
    "mood": "Warm and inviting",
    "keyMessages": ["Premium quality", "Small-batch roasted", "Sustainable sourcing"],
    "visualStyle": "Cinematic with warm tones",
    "callToAction": "Visit our website to order"
  },
  "productImages": [
    "http://example.com/product1.jpg",
    "http://example.com/product2.jpg"
  ]
}
```

**Or as multipart/form-data:**

```
Content-Type: multipart/form-data

parsed: {"product":"...","targetAudience":"...",...}
productImages: [File, File, ...]
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parsed` | Object | Yes | Parsed prompt data (from `/api/parse-prompt`) |
| `parsed.product` | String | Yes | Product or service being advertised |
| `parsed.targetAudience` | String | Yes | Target demographic |
| `parsed.mood` | String | Yes | Emotional tone |
| `parsed.keyMessages` | String[] | Yes | Main messages (min 1) |
| `parsed.visualStyle` | String | Yes | Visual aesthetic |
| `parsed.callToAction` | String | Yes | Desired viewer action |
| `productImages` | (File\|String)[] | Optional | 1-10 product reference images |

**Response (200 OK):**

```json
{
  "stories": [
    {
      "id": 1,
      "title": "The Morning Ritual Transformation",
      "narrative": "A rushed, chaotic morning becomes a moment of zen when our protagonist discovers artisanal coffee. The camera follows their transformation from frazzled to focused, as the rich aroma and perfect brew center their day. The final shot shows them confidently tackling their work, coffee in hand.",
      "emotionalArc": "stress → discovery → calm → confidence",
      "keyBeats": [
        "Alarm clock blaring - protagonist jolts awake, immediately stressed",
        "Kitchen chaos - rushing, spilling, frustration building",
        "Discovery moment - noticing the artisanal coffee beans",
        "Brewing ritual - slow, deliberate, meditative process",
        "First sip - eyes close, visible relief and satisfaction",
        "Confident start - ready to conquer the day"
      ],
      "targetAudience": "Resonates with busy professionals who crave moments of calm in their hectic schedules",
      "rationale": "This problem-solution story taps into universal morning struggles while positioning the product as a transformative ritual, not just a beverage. The visual progression from chaos to calm is highly cinematic."
    },
    {
      "id": 2,
      "title": "Craftsmanship Journey: From Bean to Cup",
      "narrative": "We follow a single coffee bean's journey...",
      "emotionalArc": "curiosity → appreciation → awe → satisfaction",
      "keyBeats": [...],
      "targetAudience": "Appeals to quality-conscious consumers...",
      "rationale": "This journey story builds appreciation..."
    },
    {
      "id": 3,
      "title": "Connection Through Coffee",
      "narrative": "A series of vignettes showing...",
      "emotionalArc": "anticipation → warmth → joy → belonging",
      "keyBeats": [...],
      "targetAudience": "Speaks to social consumers...",
      "rationale": "This lifestyle/aspiration story positions..."
    }
  ]
}
```

**Error Responses:**

```json
// 400 Bad Request - Missing required fields
{
  "statusCode": 400,
  "message": "Missing required fields in parsed data: product, targetAudience"
}

// 400 Bad Request - Too many images
{
  "statusCode": 400,
  "message": "Maximum 10 product images allowed"
}

// 500 Internal Server Error
{
  "statusCode": 500,
  "message": "Failed to generate story options",
  "data": {
    "originalError": "OpenAI API call failed: ..."
  }
}
```

**Cost Estimation:**
- **Without images:** ~$0.015 per request
- **With images (10 max):** ~$0.02-0.04 per request

**Example cURL:**

```bash
curl -X POST http://localhost:3000/api/generate-stories \
  -H "Content-Type: application/json" \
  -d '{
    "parsed": {
      "product": "Artisanal Coffee",
      "targetAudience": "Coffee enthusiasts",
      "mood": "Warm and inviting",
      "keyMessages": ["Premium quality", "Sustainable"],
      "visualStyle": "Cinematic",
      "callToAction": "Visit our website"
    },
    "productImages": []
  }'
```

---

## Prompt Parsing

### POST `/api/parse-prompt`

Parse a user's text prompt into structured ad video requirements.

**Request Body:**

```json
{
  "prompt": "Create a 30s Instagram ad for luxury watches with elegant gold aesthetics targeting affluent professionals. Show timeless design and premium craftsmanship. End with 'Visit our boutique'",
  "duration": 30,
  "aspectRatio": "16:9",
  "style": "Cinematic",
  "mode": "demo",
  "model": "google/veo-3.1",
  "productImages": [
    "http://example.com/watch1.jpg"
  ]
}
```

**Response (200 OK):**

```json
{
  "product": "Luxury Watch",
  "targetAudience": "Affluent professionals aged 30-50",
  "mood": "Elegant and sophisticated",
  "keyMessages": ["Timeless design", "Premium craftsmanship", "Status symbol"],
  "visualStyle": "Cinematic with gold accents",
  "callToAction": "Visit our boutique to explore the collection",
  "meta": {
    "duration": 30,
    "aspectRatio": "16:9",
    "style": "Cinematic",
    "mode": "demo",
    "model": "google/veo-3.1",
    "productImages": ["http://example.com/watch1.jpg"],
    "resolution": "1080p",
    "generateAudio": true
  }
}
```

**Cost:** ~$0.001 per request

---

## Storyboard Planning

### POST `/api/plan-storyboard`

Generate a detailed video storyboard with segments based on parsed prompt data and selected story.

**Request Body:**

```json
{
  "parsed": {
    "product": "Luxury Watch",
    "targetAudience": "Affluent professionals",
    "mood": "Elegant",
    "keyMessages": ["Timeless design", "Premium craftsmanship"],
    "visualStyle": "Cinematic with gold accents",
    "callToAction": "Visit our boutique",
    "meta": {
      "duration": 30,
      "aspectRatio": "16:9",
      "style": "Cinematic",
      "story": {
        "id": 1,
        "title": "The Timepiece of Success",
        "narrative": "...",
        "emotionalArc": "aspiration → desire → satisfaction",
        "keyBeats": [...],
        "targetAudience": "...",
        "rationale": "..."
      },
      "productImages": ["http://example.com/watch1.jpg"]
    }
  },
  "selectedStory": {
    "id": 1,
    "title": "The Timepiece of Success",
    "narrative": "...",
    ...
  }
}
```

**Response (200 OK):**

```json
{
  "jobId": "storyboard_abc123",
  "status": "processing"
}
```

Then check status with:

### GET `/api/plan-storyboard-status?jobId=storyboard_abc123`

**Response when complete:**

```json
{
  "status": "completed",
  "storyboard": {
    "id": "abc123",
    "segments": [
      {
        "type": "hook",
        "description": "Close-up of luxury watch gleaming on wrist",
        "startTime": 0,
        "endTime": 8,
        "visualPrompt": "Cinematic close-up shot of a luxury gold watch...",
        "visualPromptAlternatives": [
          "Alternative visual prompt 1...",
          "Alternative visual prompt 2..."
        ],
        "audioNotes": "Soft, elegant background music with subtle ticking sound"
      },
      ...
    ],
    "meta": {
      "duration": 30,
      "aspectRatio": "16:9",
      "style": "Cinematic",
      "story": {...},
      "productImages": [...],
      "productName": "Luxury Watch"
    }
  }
}
```

---

## Asset Generation

### POST `/api/generate-assets`

Generate video and audio assets for all segments in a storyboard.

**Request Body:**

```json
{
  "storyboard": {
    "id": "abc123",
    "segments": [...],
    "meta": {
      "duration": 30,
      "aspectRatio": "16:9",
      "model": "google/veo-3.1",
      "productImages": [...]
    }
  }
}
```

**Response (200 OK):**

```json
{
  "jobId": "job_xyz789",
  "storyboardId": "abc123",
  "status": "processing"
}
```

Check status with:

### GET `/api/generation-status/:jobId`

---

## Video Composition

### POST `/api/compose-video`

Compose final video from generated segment assets.

**Request Body:**

```json
{
  "clips": [
    {
      "videoUrl": "http://s3.amazonaws.com/video1.mp4",
      "voiceUrl": "http://s3.amazonaws.com/audio1.mp3",
      "startTime": 0,
      "endTime": 8,
      "type": "hook"
    },
    ...
  ],
  "options": {
    "transition": "fade",
    "musicVolume": 50
  }
}
```

**Response (200 OK):**

```json
{
  "videoId": "final_abc123",
  "url": "https://s3.amazonaws.com/bucket/videos/final_abc123.mp4",
  "duration": 30,
  "resolution": "1920x1080",
  "aspectRatio": "16:9"
}
```

---

## Cost Tracking

### POST `/api/cost/track`

Track API costs for internal monitoring.

**Request Body:**

```json
{
  "operation": "generate-stories",
  "amount": 0.025,
  "metadata": {
    "product": "Coffee Beans",
    "productImages": 5
  }
}
```

### GET `/api/cost/summary`

Get cost summary for all operations.

**Response:**

```json
{
  "total": 15.47,
  "byOperation": {
    "parse-prompt": 0.05,
    "generate-stories": 0.20,
    "plan-storyboard": 2.50,
    "generate-assets": 10.50,
    "compose-video": 2.22
  },
  "count": 247
}
```

---

## Error Handling

All API errors follow this format:

```json
{
  "statusCode": 400|500,
  "message": "Human-readable error message",
  "data": {
    "errors": [...],  // Validation errors (if applicable)
    "field": "...",   // Field name (if validation error)
    "originalError": "...",  // Original error message
    "stack": "..."    // Stack trace (development only)
  }
}
```

### Common Error Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Missing required fields, invalid data format |
| 404 | Not Found | Resource doesn't exist (job, video, storyboard) |
| 500 | Internal Server Error | API failures, processing errors |

### Error Response Examples

**Validation Error:**

```json
{
  "statusCode": 400,
  "message": "Please provide a valid description: String must contain at least 10 character(s)",
  "data": {
    "errors": [
      {
        "code": "too_small",
        "minimum": 10,
        "type": "string",
        "inclusive": true,
        "exact": false,
        "message": "String must contain at least 10 character(s)",
        "path": ["prompt"]
      }
    ],
    "field": "prompt"
  }
}
```

**API Failure:**

```json
{
  "statusCode": 500,
  "message": "Failed to generate story options: OpenAI API call failed: Rate limit exceeded",
  "data": {
    "originalError": "Rate limit exceeded"
  }
}
```

---

## Rate Limits

### OpenAI (GPT-4o)
- **Requests:** 5,000 per minute
- **Tokens:** 800,000 per minute
- **Recommended:** Implement exponential backoff for rate limit errors

### Replicate
- **Concurrent predictions:** 5 (free tier) / 50 (paid)
- **Recommended:** Queue system for production use

### ElevenLabs
- **Characters:** 10,000 per month (free tier)
- **Recommended:** Monitor usage and upgrade as needed

---

## Webhooks (Future)

Planned webhook support for async operations:

```json
POST https://your-app.com/webhooks/adubun
{
  "event": "storyboard.completed",
  "data": {
    "jobId": "...",
    "storyboard": {...}
  }
}
```

---

## SDKs (Future)

Planned SDK support:
- **JavaScript/TypeScript** - npm package
- **Python** - PyPI package
- **REST Client** - OpenAPI spec

---

## Changelog

### v1.0.0 (2025-11-16)
- ✅ Added `/api/generate-stories` endpoint
- ✅ Added product images support (1-10 images)
- ✅ Added story narrative generation with GPT-4o
- ✅ Updated type definitions for Story, Segment, Storyboard
- ✅ Added comprehensive validation schemas

### v0.9.0 (Previous)
- Initial API implementation
- Basic prompt parsing and storyboard planning
- Asset generation and video composition
- S3 upload integration

---

## Support

For issues, questions, or feature requests:
- **GitHub Issues:** [Link to repo issues]
- **Email:** support@adubun.ai (if applicable)
- **Docs:** See `/docs` folder for additional documentation

---

## Additional Resources

- **Nano-banana Research:** `/docs/nano-banana-research.md`
- **Fallback Strategy:** `/docs/enhancement-fallback-strategy.md`
- **S3 Setup:** `/docs/S3_SETUP.md`
- **AWS Credentials:** `/docs/FIND_AWS_CREDENTIALS.md`
- **PRD:** `/pipeline_prd.md`
- **Task Checklist:** `/CHECKLIST.md`

