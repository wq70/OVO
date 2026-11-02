FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.mjs start.mjs ./
ENV HOST=0.0.0.0 PORT=8787 PUSH_DATA_FILE=/data/subscriptions.json
EXPOSE 8787
CMD ["node", "start.mjs"]
