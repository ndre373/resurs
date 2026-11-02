# Ресурс — full-stack image: prebuilt client (dist/public) + bundled server (dist/boot.js).
# Dependencies are bundled into dist/boot.js by esbuild, so no npm install at runtime.
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY .env ./.env
COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/boot.js"]
