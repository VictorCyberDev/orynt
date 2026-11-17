# UNVERIFIED: no Docker daemon was available in the build environment, so this image has never been built. Treat as a template.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:all

FROM node:22-bookworm-slim
ENV NODE_ENV=production ORYNT_ENV=production HOST=0.0.0.0 PORT=8787 ORYNT_WEB_DIST=/app/apps/web/dist ORYNT_SITE_DIST=/app/apps/site/dist
WORKDIR /app
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/site/dist apps/site/dist
COPY --from=build /app/packages packages
RUN pnpm install --frozen-lockfile --prod --filter @orynt/api... && useradd -r -u 10001 orynt && chown -R orynt /app
USER orynt
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8787/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.mjs"]
