package com.animasys.modules.ai.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Validates AI configuration at startup — production must not run with mock mode.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiStartupValidator implements ApplicationRunner {

    private final AiProperties aiProperties;
    private final Environment environment;

    @Override
    public void run(ApplicationArguments args) {
        if (aiProperties.isMockEnabled() && isProductionProfile()) {
            throw new IllegalStateException(
                    "AI mock mode (app.ai.mock-enabled=true) is forbidden in production profile");
        }

        if (isProductionProfile() && !aiProperties.hasApiKey()) {
            throw new IllegalStateException(
                    "GEMINI_API_KEY is required when running with a production profile");
        }

        if (aiProperties.isMockEnabled()) {
            log.warn("AI mock mode is ENABLED — responses are synthetic and must not be used for real ERP data");
        } else if (!aiProperties.hasApiKey()) {
            log.warn("GEMINI_API_KEY is not configured — AI endpoints will fail until a key is provided");
        }
    }

    private boolean isProductionProfile() {
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> "prod".equalsIgnoreCase(p) || "production".equalsIgnoreCase(p));
    }
}
