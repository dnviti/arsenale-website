FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

ENV HOST=0.0.0.0
ENV PORT=8080
ENV LLM_PROVIDER=ollama
ENV OLLAMA_BASE_URL=http://ollama-web:11434
ENV OLLAMA_MODEL=qwen3.5:0.8b
ENV ANTHROPIC_API_KEY=

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
