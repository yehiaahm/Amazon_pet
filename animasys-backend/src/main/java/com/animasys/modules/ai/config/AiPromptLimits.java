package com.animasys.modules.ai.config;

public final class AiPromptLimits {

    public static final int AI_PROMPT_MAX_CLIENT_CONTEXT = 1000;
    public static final int AI_PROMPT_MAX_CONTEXT_BYTES = 50_000;
    public static final String CLIENT_CONTEXT_TRUNCATED_SUFFIX = "... (truncated)";

    private AiPromptLimits() {
    }
}
