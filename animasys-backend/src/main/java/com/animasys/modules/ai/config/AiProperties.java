package com.animasys.modules.ai.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.ai")
@Getter
@Setter
public class AiProperties {

    private final Gemini gemini = new Gemini();

    /**
     * When true, routes AI calls to {@link com.animasys.modules.ai.providers.AiMockProvider}.
     * Must remain false in production (enforced at startup).
     */
    private boolean mockEnabled = false;

    /** HTTP read/connect timeout for Gemini REST calls. */
    private int requestTimeoutMs = 60_000;

    /** Max base64 payload length for invoice OCR (approx 15 MB). */
    private int maxImageBase64Length = 15_728_640;

    @Getter
    @Setter
    public static class Gemini {
        private String apiKey = "";
    }

    public boolean hasApiKey() {
        return gemini.getApiKey() != null && !gemini.getApiKey().isBlank();
    }
}
