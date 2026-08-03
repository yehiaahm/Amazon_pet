package com.animasys.modules.ai.context;

import com.animasys.modules.ai.config.AiPromptLimits;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiClientContextSanitizerTest {

    @Test
    void passesThroughShortContext() {
        String input = "short context";
        assertThat(AiClientContextSanitizer.sanitize(input)).isEqualTo(input);
    }

    @Test
    void truncatesLongContextWithoutExceedingMax() {
        String input = "x".repeat(AiPromptLimits.AI_PROMPT_MAX_CLIENT_CONTEXT + 500);
        String result = AiClientContextSanitizer.sanitize(input);
        assertThat(result).endsWith(AiPromptLimits.CLIENT_CONTEXT_TRUNCATED_SUFFIX);
        assertThat(result.length()).isLessThanOrEqualTo(AiPromptLimits.AI_PROMPT_MAX_CLIENT_CONTEXT);
    }

    @Test
    void nullAndBlankReturnNull() {
        assertThat(AiClientContextSanitizer.sanitize(null)).isNull();
        assertThat(AiClientContextSanitizer.sanitize("   ")).isNull();
    }
}
