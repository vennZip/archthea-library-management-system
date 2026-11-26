FROM node:26-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace backend && npm cache clean --force
COPY --chown=node:node backend/src ./backend/src
USER node
EXPOSE 4000
CMD ["node", "backend/src/server.js"]
