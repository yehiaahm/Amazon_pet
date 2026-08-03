package com.animasys.modules.ai.audit;

import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.ai.exception.AIServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AiAuditService {

    private static final int MAX_FAILURE_REASON = 500;

    private final AiRequestLogRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logSuccess(String endpoint, String provider, long durationMs) {
        persist(endpoint, provider, "SUCCESS", durationMs, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logFailure(String endpoint, String provider, long durationMs, String failureReason) {
        persist(endpoint, provider, "FAILURE", durationMs, sanitizeFailureReason(failureReason));
    }

    private void persist(String endpoint, String provider, String status, long durationMs, String failureReason) {
        String tenantId;
        String employeeId;
        try {
            tenantId = SecurityUtils.requireTenantId();
            employeeId = SecurityUtils.requireEmployeeId();
        } catch (Exception ex) {
            tenantId = "unknown";
            employeeId = null;
        }

        repository.save(AiRequestLog.builder()
                .id("ai-log-" + UUID.randomUUID().toString().substring(0, 12))
                .tenantId(tenantId)
                .employeeId(employeeId)
                .endpoint(endpoint)
                .provider(provider)
                .status(status)
                .durationMs(Math.max(0, durationMs))
                .failureReason(failureReason)
                .createdAt(Instant.now())
                .build());
    }

    public static String sanitizeFailureReason(Throwable error) {
        if (error == null) {
            return "Unknown AI error";
        }
        String message = error instanceof AIServiceException
                ? error.getMessage()
                : error.getClass().getSimpleName();
        return truncate(sanitizeSecrets(message));
    }

    static String sanitizeFailureReason(String reason) {
        if (reason == null || reason.isBlank()) {
            return "Unknown AI error";
        }
        return truncate(sanitizeSecrets(reason));
    }

    private static String sanitizeSecrets(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replaceAll("(?i)(api[_-]?key|x-goog-api-key|authorization)\\s*[:=]\\s*\\S+", "$1=[REDACTED]")
                .replaceAll("key=[A-Za-z0-9_-]+", "key=[REDACTED]");
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= MAX_FAILURE_REASON ? value : value.substring(0, MAX_FAILURE_REASON);
    }
}
