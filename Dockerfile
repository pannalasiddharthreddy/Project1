# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — dependencies
# Install only production dependencies. Dev dependencies (jest, eslint) are
# never shipped: linting and testing already happened inside the pipeline's
# node:20-alpine agent containers before this image was built.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
# Copy lockfiles first so Docker can cache this layer when only code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# Slim, non-root Alpine image containing just the app + production deps.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
LABEL org.opencontainers.image.title="task-api" \
      org.opencontainers.image.description="Demo task REST API for practising Docker + Jenkins CI/CD"

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Run as the unprivileged `node` user that ships with the base image.
USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
