package com.animasys.modules.ai.audit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AiAuditServiceTest {

    @Test
    void sanitizeFailureReasonRedactsApiKeyPatterns() {
        String sanitized = AiAuditService.sanitizeFailureReason(
                "Request failed: x-goog-api-key=super-secret-key-12345 and key=ABC123");
        assertFalse(sanitized.contains("super-secret-key-12345"));
        assertFalse(sanitized.contains("ABC123"));
        assertTrue(sanitized.contains("[REDACTED]"));
    }
}
