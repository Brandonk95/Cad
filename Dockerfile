# Stratum: one container. PocketBase serves the API and the built web app.

# ---- web build -----------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
COPY CHANGELOG.md /CHANGELOG.md
# Unique per image so open tabs can tell a new deploy happened.
ARG STRATUM_BUILD=
ENV STRATUM_BUILD=${STRATUM_BUILD}
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM alpine:3.22
ARG PB_VERSION=0.40.6
ARG TARGETARCH
RUN apk add --no-cache ca-certificates tzdata unzip wget \
 && case "${TARGETARCH:-amd64}" in \
      amd64) PB_ARCH=amd64 ;; arm64) PB_ARCH=arm64 ;; arm) PB_ARCH=armv7 ;; *) echo "unsupported arch ${TARGETARCH}" && exit 1 ;; \
    esac \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && apk del unzip

COPY pocketbase/pb_migrations /pb/pb_migrations
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY --from=web /web/dist /pb/pb_public
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /pb/pocketbase

EXPOSE 8090
VOLUME /pb/pb_data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
ENTRYPOINT ["/entrypoint.sh"]
