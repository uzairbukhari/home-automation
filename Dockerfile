# Optional VPS upgrade path — not needed for the default Vercel deployment.
# Builds a minimal production image using Next.js's standalone output.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# DATABASE_URL only needs to be a valid libsql URL at build time (no network
# call happens during `next build` for this app's dynamic-only routes).
ENV DATABASE_URL=file:./build-placeholder.db
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
