package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.service.AiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AiColumnMappingAdvisorTest {

    private AiService aiService;
    private AiProperties aiProperties;
    private AiColumnMappingAdvisor advisor;

    @BeforeEach
    void setUp() {
        aiService = mock(AiService.class);
        aiProperties = new AiProperties();
        aiProperties.setMockEnabled(true);
        advisor = new AiColumnMappingAdvisor(aiService, aiProperties, new ObjectMapper());
    }

    private List<ColumnMappingSuggestion> unresolved(String... headers) {
        List<ColumnMappingSuggestion> suggestions = new ArrayList<>();
        for (String header : headers) {
            suggestions.add(ColumnMappingSuggestion.builder().header(header).confidence(0).autoMapped(false).build());
        }
        return suggestions;
    }

    @Test
    void unavailableWhenNoApiKeyAndMockDisabled() {
        aiProperties.setMockEnabled(false);
        assertFalse(advisor.isAvailable());
        assertFalse(advisor.advise(unresolved("Unknown Column"), List.of()));
        verifyNoInteractions(aiService);
    }

    @Test
    void doesNothingWhenEverythingIsAlreadyMapped() {
        List<ColumnMappingSuggestion> suggestions = List.of(
                ColumnMappingSuggestion.builder().header("SKU").field(ImportField.SKU).confidence(1.0).autoMapped(true).build());
        assertFalse(advisor.advise(suggestions, List.of()));
        verifyNoInteractions(aiService);
    }

    @Test
    void appliesADirectHeaderToFieldCodeResponse() {
        when(aiService.mapImportColumns(anyString())).thenReturn("{\"غريب\": \"productName\"}");

        List<ColumnMappingSuggestion> suggestions = unresolved("غريب");
        boolean changed = advisor.advise(suggestions, List.of(Map.of("غريب", "دراي فود قطط")));

        assertTrue(changed);
        assertEquals(ImportField.PRODUCT_NAME, suggestions.get(0).getField());
        assertTrue(suggestions.get(0).isAutoMapped());
        assertEquals(ColumnMappingSuggestion.Source.AI, suggestions.get(0).getSource());
    }

    @Test
    void appliesTheReversedMappingShapeGeminiSometimesReturns() {
        // {"mapping": {fieldCode: header}} — the legacy/alternate shape the mock provider
        // and some prompts produce; the advisor must accept both directions.
        when(aiService.mapImportColumns(anyString()))
                .thenReturn("{\"mapping\": {\"productName\": \"غريب\"}}");

        List<ColumnMappingSuggestion> suggestions = unresolved("غريب");
        boolean changed = advisor.advise(suggestions, List.of());

        assertTrue(changed);
        assertEquals(ImportField.PRODUCT_NAME, suggestions.get(0).getField());
    }

    @Test
    void neverReassignsAFieldThatIsAlreadyClaimed() {
        when(aiService.mapImportColumns(anyString())).thenReturn("{\"غريب\": \"sku\"}");

        List<ColumnMappingSuggestion> suggestions = new ArrayList<>(List.of(
                ColumnMappingSuggestion.builder().header("Code").field(ImportField.SKU).confidence(1.0).autoMapped(true).build(),
                ColumnMappingSuggestion.builder().header("غريب").confidence(0).autoMapped(false).build()));

        advisor.advise(suggestions, List.of());

        assertFalse(suggestions.get(1).isAutoMapped(), "SKU is already claimed by another header");
    }

    @Test
    void neverThrowsWhenTheProviderFails() {
        when(aiService.mapImportColumns(anyString())).thenThrow(new RuntimeException("provider down"));

        assertFalse(advisor.advise(unresolved("غريب"), List.of()));
    }

    @Test
    void ignoresAnUnparseableResponse() {
        when(aiService.mapImportColumns(anyString())).thenReturn("not json at all");

        assertFalse(advisor.advise(unresolved("غريب"), List.of()));
    }
}
