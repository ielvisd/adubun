# Base image with Node.js 20 (Debian Bookworm)
FROM node:20-bookworm-slim

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV MCP_FILESYSTEM_ROOT=/app/data

# Create data directory structure
RUN mkdir -p /app/data/videos /app/data/assets /app/data/jobs /app/data/storyboards

# Start the application
CMD ["node", ".output/server/index.mjs"]

