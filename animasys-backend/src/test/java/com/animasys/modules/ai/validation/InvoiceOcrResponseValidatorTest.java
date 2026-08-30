package com.animasys.modules.ai.validation;

import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class InvoiceOcrResponseValidatorTest {

    private InvoiceOcrResponseValidator validator;

    @BeforeEach
    void setUp() {
        validator = new InvoiceOcrResponseValidator(new AiResponseParser(new ObjectMapper()), new ObjectMapper());
    }

    @Test
    void acceptsValidInvoiceJson() {
        String raw = """
                {
                  "supplierName": "Supplier A",
                  "invoiceDate": "2026-01-15",
                  "vat": 10,
                  "grandTotal": 110,
                  "items": [
                    {
                      "productName": "Dog Food",
                      "unitCost": 5,
                      "lineTotal": 50,
                      "quantity": 10,
                      "price": 8
                    }
                  ]
                }
                """;
        String normalized = validator.validateAndNormalize(raw);
        assertTrue(normalized.contains("\"productName\":\"Dog Food\"") || normalized.contains("\"productName\": \"Dog Food\""));
    }

    @Test
    void rejectsEmptyResponse() {
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize("   "));
    }

    @Test
    void rejectsMalformedJson() {
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize("not-json"));
    }

    @Test
    void rejectsEmptyProductList() {
        String raw = """
                {"supplierName":"X","items":[]}
                """;
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize(raw));
    }

    @Test
    void rejectsNegativeTotals() {
        String raw = """
                {
                  "supplierName": "Supplier A",
                  "vat": -1,
                  "items": [{"productName":"A","quantity":1,"unitCost":1}]
                }
                """;
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize(raw));
    }

    @Test
    void rejectsFallbackMarker() {
        String raw = """
                {"fallback":true,"items":[{"productName":"A","quantity":1,"unitCost":1}]}
                """;
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize(raw));
    }

    @Test
    void rejectsInvalidDate() {
        String raw = """
                {
                  "invoiceDate": "not-a-date",
                  "items": [{"productName":"A","quantity":1,"unitCost":1}]
                }
                """;
        assertThrows(AIInvalidResponseException.class, () -> validator.validateAndNormalize(raw));
    }

    @Test
    void stripsMarkdownJsonFence() {
        String raw = """
                ```json
                {
                  "supplierName": "Supplier A",
                  "items": [{"productName":"A","quantity":2,"unitCost":3}]
                }
                ```
                """;
        assertDoesNotThrow(() -> validator.validateAndNormalize(raw));
    }
}
