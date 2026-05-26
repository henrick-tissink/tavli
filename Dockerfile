# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_USE_DB
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG DEMO_MODE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_USE_DB=$NEXT_PUBLIC_USE_DB
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# DEMO_MODE at build time so robots.txt is generated as the disallow-all variant
# on the demo deployment (the runtime X-Robots-Tag header is set regardless).
ENV DEMO_MODE=$DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
# 4GB box: lift V8's default ~2GB heap ceiling so the full v1 Turbopack build
# doesn't OOM. Backed by the 4GB swapfile added to the host. Builder stage only —
# does not carry into the runner image.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
