# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
# Build-time args inlined into the client bundle by Vite's `define` block.
# Must be supplied (e.g. via azure.yaml docker.buildArgs) for Spotify OAuth to
# resolve in the deployed app — the browser has no process.env at runtime.
ARG SPOTIFY_CLIENT_ID
ARG SPOTIFY_REDIRECT_URI
ENV SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID
ENV SPOTIFY_REDIRECT_URI=$SPOTIFY_REDIRECT_URI
COPY package*.json ./
# Install ALL deps (incl. dev) so Vite + Tailwind are available for the build
RUN npm install --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Production-only deps for the runtime image
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
# Copy source + built client bundle from the build stage
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
# Ensure runtime audio output directory exists (ephemeral; OK for single-user)
RUN mkdir -p /app/public/audio

EXPOSE 3000
CMD ["node", "server/index.js"]
