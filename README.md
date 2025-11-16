# AdUbun - AI Video Generation Platform

**Tagline:** *"Ubun Your Ads: Inventive Flow, Infinite Impact."*

AdUbun transforms creative production by orchestrating AI models for ad videos, integrating text-to-video (Hailuo2.3, Veo 3), voice synthesis, and composition. Built on Nuxt 4 with a professional design system using Nuxt UI.

## Features

- **Fast Generation**: Generate professional ad videos in under 10 minutes
- **Cost Effective**: Less than $2 per minute of video content
- **AI-Powered**: Leveraging cutting-edge AI models (Replicate, OpenAI, ElevenLabs)
- **MCP Integration**: Model Context Protocol servers for standardized API interactions
- **Professional UI**: Built with Nuxt UI and Tailwind CSS

## Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+ (package manager)
- FFmpeg (for video composition)
- Git

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd adubun
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```bash
   REPLICATE_API_KEY=your_replicate_key
   OPENAI_API_KEY=your_openai_key
   ELEVENLABS_API_KEY=your_elevenlabs_key
   APP_URL=http://localhost:3000
   
   # AWS S3 Configuration (required for image uploads)
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET_NAME=your-bucket-name
   AWS_S3_PUBLIC_ACCESS=true
   
   # Firebase Configuration (required for authentication)
   FIREBASE_API_KEY=your_firebase_api_key
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```
   
   See [docs/S3_SETUP.md](docs/S3_SETUP.md) for detailed S3 setup instructions.

4. **Set up Firebase Authentication**
   
   Create a Firebase project:
   1. Go to [Firebase Console](https://console.firebase.google.com/)
   2. Click "Add project" and follow the setup wizard
   3. Enable Authentication:
      - Go to Authentication → Sign-in method
      - Enable "Email/Password" provider
   4. Get your Firebase config:
      - Go to Project Settings → General
      - Scroll to "Your apps" section
      - Click the web icon (`</>`) to add a web app
      - Copy the Firebase configuration values
   5. Add the config values to your `.env` file (see step 3)
   
   **Note**: In development mode, you can use the "Demo Login" button to bypass authentication for testing purposes.

5. **Install FFmpeg** (if not already installed)
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt-get install ffmpeg`
   - Windows: Download from [FFmpeg website](https://ffmpeg.org/download.html)

## Development

Start the development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
adubun/
├── app/
│   ├── components/       # Vue components (UI, generation, brand)
│   ├── composables/      # Vue composables (useGeneration, useMCP, etc.)
│   ├── layouts/          # Page layouts
│   ├── pages/            # Application pages
│   ├── types/            # TypeScript type definitions
│   └── assets/           # CSS and static assets
├── server/
│   ├── api/              # API endpoints
│   └── utils/            # Server utilities (storage, ffmpeg, cost-tracker)
├── mcp-servers/          # MCP server implementations
│   ├── replicate/        # Replicate API MCP server
│   ├── openai/           # OpenAI API MCP server
│   └── elevenlabs/       # ElevenLabs API MCP server
├── tests/
│   └── e2e/              # Playwright E2E tests
└── data/                 # Local storage (videos, assets, storyboards)
```

## MCP Integration

AdUbun uses Model Context Protocol (MCP) servers for standardized API interactions:

### Replicate MCP Server
- **Location**: `mcp-servers/replicate/index.ts`
- **Tools**: `generate_video`, `check_prediction_status`, `get_prediction_result`
- **Purpose**: Video generation using Replicate's AI models

### OpenAI MCP Server
- **Location**: `mcp-servers/openai/index.ts`
- **Tools**: `chat_completion`, `parse_prompt`, `plan_storyboard`
- **Purpose**: Prompt parsing and storyboard planning using GPT-4o

### ElevenLabs MCP Server
- **Location**: `mcp-servers/elevenlabs/index.ts`
- **Tools**: `text_to_speech`, `get_voice_list`, `get_voice_settings`
- **Purpose**: Voice synthesis for video narration

## API Endpoints

### Input Layer
- `POST /api/parse-prompt` - Parse user prompt into structured data
- `POST /api/upload-brand-assets` - Upload logos and brand assets

### Planning Layer
- `POST /api/plan-storyboard` - Generate video storyboard
- `PUT /api/storyboard/:id` - Edit storyboard

### Generation Layer
- `POST /api/generate-assets` - Start asset generation
- `GET /api/generation-status/:id` - Poll generation status
- `POST /api/retry-segment/:id` - Retry failed segment

### Composition Layer
- `POST /api/compose-video` - Compose final video
- `POST /api/export-format` - Export to different formats

### Output Layer
- `GET /api/download/:id` - Download video
- `GET /api/watch/:id` - Stream video
- `DELETE /api/video/:id` - Delete video

### Utility
- `GET /api/cost/summary` - Get cost breakdown
- `GET /api/history` - Get generation history
- `POST /api/cost/track` - Track cost manually

## Testing

Run E2E tests with Playwright:

```bash
pnpm test:e2e
```

Test files are located in `tests/e2e/`:
- `generation-flow.spec.ts` - Full generation flow
- `ui-components.spec.ts` - Component interactions
- `error-handling.spec.ts` - Error scenarios
- `cost-tracking.spec.ts` - Cost monitoring
- `accessibility.spec.ts` - A11y compliance

## Building for Production

```bash
pnpm build
```

Preview production build:

```bash
pnpm preview
```

## Cost Tracking

AdUbun tracks costs for all operations:
- Video generation: ~$0.15 per segment
- Voice synthesis: ~$0.05 per segment
- Video composition: ~$0.10 per video
- Prompt parsing: ~$0.001 per prompt
- Storyboard planning: ~$0.002 per storyboard

Costs are tracked in `data/costs.json` and can be viewed via the `/api/cost/summary` endpoint.

## Storage

Local file storage is used for MVP:
- `data/videos/` - Generated videos
- `data/assets/` - Temporary assets
- `data/storyboards/` - Storyboard JSON files
- `data/costs.json` - Cost tracking data
- `data/jobs.json` - Generation job metadata
- `data/videos.json` - Video metadata

## Troubleshooting

### MCP Servers Not Starting
- Ensure all API keys are set in `.env`
- Check that Node.js version is 20+
- Verify MCP SDK is installed: `pnpm list @modelcontextprotocol/sdk`

### FFmpeg Errors
- Ensure FFmpeg is installed and in PATH
- Check FFmpeg version: `ffmpeg -version`

### Video Generation Fails
- Verify Replicate API key is valid
- Check API rate limits
- Review error logs in browser console

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]
