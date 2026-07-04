FROM node:22-alpine AS builder
WORKDIR /app
# node 22 ships npm 10, which writes a self-inconsistent lock for the
# dual-version @noble/hashes tree; npm 11 resolves it correctly.
RUN npm i -g npm@11
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Built app
COPY --from=builder /app/build ./build
# Source needed for migrations (src/lib/server/db/) and bot (src/bot/)
COPY --from=builder /app/src ./src
# Runtime deps (includes tsx for running TS files directly)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "build/index.js"]
