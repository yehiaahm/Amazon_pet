package com.animasys.modules.ai.providers;

import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.exception.AIConfigurationException;
import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.animasys.modules.ai.exception.AIProviderUnavailableException;
import com.animasys.modules.ai.exception.AIQuotaExceededException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GeminiProviderTest {

    private AiProperties properties;
    private RestTemplate restTemplate;
    private MockRestServiceServer mockServer;
    private GeminiProvider provider;

    @BeforeEach
    void setUp() {
        properties = new AiProperties();
        properties.getGemini().setApiKey("test-secret-key");
        restTemplate = new RestTemplate();
        mockServer = MockRestServiceServer.bindTo(restTemplate).build();
        provider = new GeminiProvider(properties, restTemplate);
    }

    @Test
    void missingApiKeyFailsClosed() {
        properties.getGemini().setApiKey("");
        AIConfigurationException ex = assertThrows(AIConfigurationException.class,
                () -> provider.generateResponse("hello"));
        assertTrue(ex.getMessage().contains("Gemini API key"));
    }

    @Test
    void usesHeaderAuthNotQueryKey() {
        mockServer.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("x-goog-api-key", "test-secret-key"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andRespond(withSuccess("""
                        {
                          "candidates": [{
                            "content": {
                              "parts": [{ "text": "Insight text" }]
                            }
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        String response = provider.generateResponse("prompt");
        assertEquals("Insight text", response);
        mockServer.verify();
    }

    @Test
    void maps429ToQuotaExceeded() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andRespond(withTooManyRequests());

        assertThrows(AIQuotaExceededException.class, () -> provider.generateResponse("prompt"));
    }

    @Test
    void maps500ToProviderUnavailable() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andRespond(withServerError());

        assertThrows(AIProviderUnavailableException.class, () -> provider.generateResponse("prompt"));
    }

    @Test
    void rejectsEmptyCandidates() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andRespond(withSuccess("{\"candidates\":[]}", MediaType.APPLICATION_JSON));

        assertThrows(AIInvalidResponseException.class, () -> provider.generateResponse("prompt"));
    }

    @Test
    void rejectsMalformedJsonResponse() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"\"}]}}]}", MediaType.APPLICATION_JSON));

        assertThrows(AIInvalidResponseException.class, () -> provider.generateResponse("prompt"));
    }

    @Test
    void mapsNetworkFailureToUnavailable() {
        RestTemplate failingTemplate = mock(RestTemplate.class);
        when(failingTemplate.exchange(anyString(), eq(HttpMethod.POST), any(), eq(java.util.Map.class)))
                .thenThrow(new ResourceAccessException("Connection timed out"));

        GeminiProvider failingProvider = new GeminiProvider(properties, failingTemplate);
        assertThrows(AIProviderUnavailableException.class, () -> failingProvider.generateResponse("prompt"));
    }

    @Test
    void rejectsProviderErrorPayload() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andRespond(withSuccess("""
                        {"error":{"message":"Invalid request"}}
                        """, MediaType.APPLICATION_JSON));

        assertThrows(AIProviderUnavailableException.class, () -> provider.generateResponse("prompt"));
    }

    @Test
    void visionRequestSucceeds() {
        mockServer.expect(requestTo(org.hamcrest.Matchers.containsString("generativelanguage.googleapis.com")))
                .andExpect(header("x-goog-api-key", "test-secret-key"))
                .andRespond(withSuccess("""
                        {
                          "candidates": [{
                            "content": {
                              "parts": [{ "text": "{\\"items\\":[{\\"productName\\":\\"A\\",\\"quantity\\":1,\\"unitCost\\":1}]}" }]
                            }
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        String response = provider.generateVisionResponse("ocr", "abc123", "image/png");
        assertTrue(response.contains("productName"));
    }
}
