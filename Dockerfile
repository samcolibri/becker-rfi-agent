FROM node:20-alpine

WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm ci --omit=dev

# Install + build React client
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Copy server source + static assets
COPY src/ ./src/
COPY data/ ./data/
COPY public/ ./public/
COPY docs/ ./docs/
COPY scripts/ ./scripts/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
