# --- Build stage -------------------------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# Cache dependencies separately from source so `mvn` doesn't re-download
# the whole repo on every source change.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
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
RUN chown animasys:animasys app.jar

USER animasys

EXPOSE 8080

# Health check hits the actuator endpoint added for production observability.
# Shell form so ${PORT} (injected by PaaS hosts like Railway) is honored; falls back to 8080 locally.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/api/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
