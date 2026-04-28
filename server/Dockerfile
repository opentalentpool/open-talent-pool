FROM node:18-alpine
WORKDIR /usr/src/app
COPY package.json .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
