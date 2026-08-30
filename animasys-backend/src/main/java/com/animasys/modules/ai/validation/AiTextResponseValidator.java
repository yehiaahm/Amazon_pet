package com.animasys.modules.ai.validation;

import com.animasys.modules.ai.exception.AIInvalidResponseException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AiTextResponseValidator {

    public String requireNonEmpty(String response, String context) {
        if (response == null || response.isBlank()) {
            throw new AIInvalidResponseException(context + " returned an empty response");
        }
        String trimmed = response.trim();
        if (trimmed.startsWith("{") && trimmed.contains("\"error\"")) {
            throw new AIInvalidResponseException(context + " returned an error payload");
        }
        return trimmed;
    }
}
