# --- Build stage -------------------------------------------------------
# Build context is the REPO ROOT (see /railway.json's dockerfilePath and
# .github/workflows/ci.yml's docker job) so paths below are repo-root-relative.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# Cache dependencies separately from source so `mvn` doesn't re-download
# the whole repo on every source change.
COPY animasys-backend/pom.xml .
RUN mvn -B -q dependency:go-offline

COPY animasys-backend/src ./src
RUN mvn -B -q clean package -DskipTests

# --- Runtime stage -------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

# curl is needed for the HEALTHCHECK below (not present in the base JRE image)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r animasys && useradd -r -g animasys animasys

COPY --from=build /build/target/animasys-backend-1.0.0.jar app.jar
# ./logs only gets written to when the "file-logging" profile is explicitly active
# (see logback-spring.xml / docker-compose.yml) — pre-create it owned by the
# non-root user so a mounted volume (e.g. docker-compose's backend-logs) inherits
# writable ownership instead of defaulting to root. Not used on Railway.
RUN mkdir -p logs && chown -R animasys:animasys app.jar logs

USER animasys

EXPOSE 8080

# Health check hits the actuator endpoint added for production observability.
# Shell form so ${PORT} (injected by PaaS hosts like Railway) is honored; falls back to 8080 locally.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
