FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY dist ./dist
COPY policies ./policies
USER 10001:10001
ENTRYPOINT ["node", "dist/mcp/server.js"]
