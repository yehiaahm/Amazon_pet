package com.animasys.modules.ai.context;

import com.animasys.modules.ai.config.AiPromptLimits;

public final class AiClientContextSanitizer {

    private AiClientContextSanitizer() {
    }

    public static String sanitize(String clientContext) {
        if (clientContext == null || clientContext.isBlank()) {
            return null;
        }
        String trimmed = clientContext.trim();
        int max = AiPromptLimits.AI_PROMPT_MAX_CLIENT_CONTEXT;
        String suffix = AiPromptLimits.CLIENT_CONTEXT_TRUNCATED_SUFFIX;
        if (trimmed.length() <= max) {
            return trimmed;
        }
        int contentMax = max - suffix.length();
        if (contentMax <= 0) {
            return trimmed.substring(0, max);
        }
        return trimmed.substring(0, contentMax) + suffix;
    }
}
