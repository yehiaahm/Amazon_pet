package com.animasys.modules.ai.service;

import com.animasys.modules.ai.audit.AiAuditService;
import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.animasys.modules.ai.exception.AIServiceException;
import com.animasys.modules.ai.providers.AIProvider;
import com.animasys.modules.ai.validation.AiTextResponseValidator;
import com.animasys.modules.ai.validation.InvoiceOcrResponseValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiService {

    public static final String ENDPOINT_INSIGHTS = "GET /v1/ai/insights";
    public static final String ENDPOINT_ASK = "POST /v1/ai/ask";
    public static final String ENDPOINT_OCR = "POST /v1/ai/analyze-invoice";

    private final AIProvider aiProvider;
    private final AiAuditService auditService;
    private final AiTextResponseValidator textResponseValidator;
    private final InvoiceOcrResponseValidator invoiceOcrResponseValidator;
    private final AiProperties aiProperties;

    public String generateInsights(String prompt) {
        return executeText(ENDPOINT_INSIGHTS, prompt);
    }

    public String askAdvisor(String prompt) {
        return executeText(ENDPOINT_ASK, prompt);
    }

    public String analyzeInvoice(String prompt, String imageBase64, String mimeType) {
        validateImagePayload(imageBase64);
        String provider = resolveProviderName();
        long started = System.currentTimeMillis();
        try {
            String raw = aiProvider.generateVisionResponse(prompt, imageBase64, mimeType);
            String validated = invoiceOcrResponseValidator.validateAndNormalize(raw);
            auditService.logSuccess(ENDPOINT_OCR, provider, elapsed(started));
            return validated;
        } catch (AIServiceException ex) {
            auditService.logFailure(ENDPOINT_OCR, provider, elapsed(started), ex.getMessage());
            throw ex;
        } catch (RuntimeException ex) {
            auditService.logFailure(ENDPOINT_OCR, provider, elapsed(started), AiAuditService.sanitizeFailureReason(ex));
            throw ex;
        }
    }

    private String executeText(String endpoint, String prompt) {
        String provider = resolveProviderName();
        long started = System.currentTimeMillis();
        try {
            String raw = aiProvider.generateResponse(prompt);
            String validated = textResponseValidator.requireNonEmpty(raw, endpoint);
            auditService.logSuccess(endpoint, provider, elapsed(started));
            return validated;
        } catch (AIServiceException ex) {
            auditService.logFailure(endpoint, provider, elapsed(started), ex.getMessage());
            throw ex;
        } catch (RuntimeException ex) {
            auditService.logFailure(endpoint, provider, elapsed(started), AiAuditService.sanitizeFailureReason(ex));
            throw ex;
        }
    }

    private void validateImagePayload(String imageBase64) {
        if (imageBase64 == null || imageBase64.isBlank()) {
            throw new AIInvalidResponseException("Invoice image payload is required");
        }
        if (imageBase64.length() > aiProperties.getMaxImageBase64Length()) {
            throw new AIInvalidResponseException("Invoice image payload exceeds the maximum allowed size");
        }
    }

    private String resolveProviderName() {
        return aiProperties.isMockEnabled() ? "mock" : "gemini";
    }

    private static long elapsed(long started) {
        return System.currentTimeMillis() - started;
    }
}
