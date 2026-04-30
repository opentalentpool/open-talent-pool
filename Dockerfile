FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

FROM base AS deps
ENV CI=true
RUN pnpm install --frozen-lockfile --prefer-offline

FROM deps AS web-build
ARG VITE_API_URL=
ARG VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
COPY . .
RUN pnpm run build

FROM deps AS server-deploy
COPY . .
RUN pnpm --filter open-talent-pool-server deploy --legacy --prod /prod/server

FROM nginx:stable-alpine AS web
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:20-alpine AS server
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=server-deploy /app/package.json /app/package.json
COPY --from=server-deploy /prod/server /app/server
COPY --from=server-deploy /app/src/lib /app/src/lib
EXPOSE 4000
CMD ["node", "index.js"]
