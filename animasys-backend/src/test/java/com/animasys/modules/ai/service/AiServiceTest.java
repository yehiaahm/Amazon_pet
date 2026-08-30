package com.animasys.modules.ai.service;

import com.animasys.modules.ai.audit.AiAuditService;
import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.exception.AIConfigurationException;
import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.animasys.modules.ai.providers.AIProvider;
import com.animasys.modules.ai.validation.AiTextResponseValidator;
import com.animasys.modules.ai.validation.InvoiceOcrResponseValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AiServiceTest {

    @Mock
    private AIProvider aiProvider;
    @Mock
    private AiAuditService auditService;
    @Mock
    private InvoiceOcrResponseValidator invoiceOcrResponseValidator;

    private AiService aiService;

    @BeforeEach
    void setUp() {
        AiProperties properties = new AiProperties();
        properties.setMockEnabled(false);
        aiService = new AiService(
                aiProvider,
                auditService,
                new AiTextResponseValidator(),
                invoiceOcrResponseValidator,
                properties
        );
    }

    @Test
    void analyzeInvoiceValidatesBeforeReturning() {
        when(aiProvider.generateVisionResponse(anyString(), anyString(), anyString()))
                .thenReturn("{\"items\":[{\"productName\":\"A\",\"quantity\":1,\"unitCost\":1}]}");
        when(invoiceOcrResponseValidator.validateAndNormalize(anyString()))
                .thenReturn("{\"items\":[{\"productName\":\"A\",\"quantity\":1,\"unitCost\":1}]}");

        String result = aiService.analyzeInvoice("prompt", "YmFzZTY0", "image/jpeg");
        assertTrue(result.contains("productName"));
        verify(auditService).logSuccess(eq(AiService.ENDPOINT_OCR), eq("gemini"), anyLong());
    }

    @Test
    void analyzeInvoiceLogsFailureOnProviderError() {
        when(aiProvider.generateVisionResponse(anyString(), anyString(), anyString()))
                .thenThrow(new AIConfigurationException("missing key"));

        assertThrows(AIConfigurationException.class,
                () -> aiService.analyzeInvoice("prompt", "YmFzZTY0", "image/jpeg"));
        verify(auditService).logFailure(eq(AiService.ENDPOINT_OCR), eq("gemini"), anyLong(), anyString());
        verify(invoiceOcrResponseValidator, never()).validateAndNormalize(anyString());
    }

    @Test
    void analyzeInvoiceRejectsOversizedPayload() {
        AiProperties properties = new AiProperties();
        properties.setMaxImageBase64Length(10);
        AiService strictService = new AiService(
                aiProvider,
                auditService,
                new AiTextResponseValidator(),
                invoiceOcrResponseValidator,
                properties
        );

        assertThrows(AIInvalidResponseException.class,
                () -> strictService.analyzeInvoice("prompt", "012345678901234567890", "image/jpeg"));
        verifyNoInteractions(aiProvider);
    }
}
