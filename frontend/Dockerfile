FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# `npm install` (not `ci`) so the lockfile gets reconciled in case it drifts.
# l7 + world-atlas deps were added recently; keep this lenient until the
# lockfile is regenerated and committed.
RUN npm install --silent --no-audit --no-fund

COPY . .

# LIVE mode — every request hits the real FastAPI backend. Mock layer
# (MSW + frontend/src/mocks) was removed in May 2026 to eliminate any
# possibility of fixture data leaking into the production image.
RUN npm run build

FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
