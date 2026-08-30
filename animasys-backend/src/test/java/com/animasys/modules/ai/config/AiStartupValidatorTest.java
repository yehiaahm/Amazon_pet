package com.animasys.modules.ai.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

class AiStartupValidatorTest {

    @Test
    void productionProfileRejectsMockMode() {
        AiProperties properties = new AiProperties();
        properties.setMockEnabled(true);
        properties.getGemini().setApiKey("configured-key");

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("production");

        AiStartupValidator validator = new AiStartupValidator(properties, environment);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> validator.run(null));
        assertTrue(ex.getMessage().contains("mock mode"));
    }

    @Test
    void productionProfileAllowsMissingApiKey() {
        AiProperties properties = new AiProperties();
        properties.setMockEnabled(false);

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        AiStartupValidator validator = new AiStartupValidator(properties, environment);
        assertDoesNotThrow(() -> validator.run(null));
    }

    @Test
    void nonProductionAllowsMissingKeyWhenMockDisabled() {
        AiProperties properties = new AiProperties();
        properties.setMockEnabled(false);

        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");

        AiStartupValidator validator = new AiStartupValidator(properties, environment);
        assertDoesNotThrow(() -> validator.run(null));
    }
}
