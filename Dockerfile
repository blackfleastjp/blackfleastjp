FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
COPY tsconfig.base.json .
RUN npm ci
RUN npm run prisma:generate
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app .
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]