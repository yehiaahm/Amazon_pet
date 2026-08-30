package com.animasys.modules.ai.providers;

import com.animasys.modules.ai.config.AiProperties;
import com.animasys.modules.ai.exception.AIConfigurationException;
import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.animasys.modules.ai.exception.AIProviderUnavailableException;
import com.animasys.modules.ai.exception.AIQuotaExceededException;
import com.animasys.modules.ai.exception.AIServiceException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Production Gemini integration — fails closed; never returns synthetic ERP data.
 */
@Component
@Slf4j
public class GeminiProvider implements AIProvider {

    private static final String GENERATE_CONTENT_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    private final AiProperties aiProperties;
    private final RestTemplate restTemplate;

    public GeminiProvider(AiProperties aiProperties, @Qualifier("geminiRestTemplate") RestTemplate restTemplate) {
        this.aiProperties = aiProperties;
        this.restTemplate = restTemplate;
    }

    @Override
    public String generateResponse(String prompt) {
        requireConfigured();
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt))))
        );
        return invokeGemini(body);
    }

    @Override
    @SuppressWarnings("unchecked")
    public String generateVisionResponse(String prompt, String imageBase64, String mimeType) {
        requireConfigured();

        String cleanBase64 = stripDataUrlPrefix(imageBase64);
        String cleanMimeType = normalizeMimeType(mimeType);

        Map<String, Object> textPart = Map.of("text", prompt);
        Map<String, Object> imagePart = Map.of("inlineData", Map.of(
                "mimeType", cleanMimeType,
                "data", cleanBase64
        ));
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(textPart, imagePart)))
        );
        return invokeGemini(body);
    }

    @SuppressWarnings("unchecked")
    private String invokeGemini(Map<String, Object> body) {
        try {
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, authHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(
                    GENERATE_CONTENT_URL,
                    HttpMethod.POST,
                    entity,
                    Map.class
            );
            return extractText(response.getBody());
        } catch (HttpStatusCodeException ex) {
            throw mapHttpError(ex);
        } catch (ResourceAccessException ex) {
            log.warn("Gemini network/timeout failure: {}", ex.getClass().getSimpleName());
            throw new AIProviderUnavailableException("AI provider is temporarily unavailable", ex);
        } catch (AIServiceException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Unexpected Gemini client failure", ex);
            throw new AIProviderUnavailableException("AI provider request failed", ex);
        }
    }

    private void requireConfigured() {
        if (!aiProperties.hasApiKey()) {
            throw new AIConfigurationException(
                    "Gemini API key is not configured. Set GEMINI_API_KEY to enable AI features.");
        }
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-goog-api-key", aiProperties.getGemini().getApiKey().trim());
        return headers;
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> response) {
        if (response == null) {
            throw new AIInvalidResponseException("AI provider returned an empty response");
        }

        if (response.containsKey("error")) {
            Object error = response.get("error");
            String message = error instanceof Map<?, ?> errMap && errMap.get("message") != null
                    ? String.valueOf(errMap.get("message"))
                    : "AI provider returned an error";
            throw new AIProviderUnavailableException(message);
        }

        Object candidatesObj = response.get("candidates");
        if (!(candidatesObj instanceof List<?> candidates) || candidates.isEmpty()) {
            throw new AIInvalidResponseException("AI provider returned no candidates");
        }

        Object first = candidates.get(0);
        if (!(first instanceof Map<?, ?> candidate)) {
            throw new AIInvalidResponseException("AI provider returned malformed candidates");
        }

        Object contentObj = candidate.get("content");
        if (!(contentObj instanceof Map<?, ?> content)) {
            throw new AIInvalidResponseException("AI provider returned empty content");
        }

        Object partsObj = content.get("parts");
        if (!(partsObj instanceof List<?> parts) || parts.isEmpty()) {
            throw new AIInvalidResponseException("AI provider returned empty content parts");
        }

        Object part = parts.get(0);
        if (!(part instanceof Map<?, ?> partMap) || partMap.get("text") == null) {
            throw new AIInvalidResponseException("AI provider returned no text content");
        }

        String text = String.valueOf(partMap.get("text")).trim();
        if (text.isEmpty()) {
            throw new AIInvalidResponseException("AI provider returned blank text");
        }
        return text;
    }

    private AIServiceException mapHttpError(HttpStatusCodeException ex) {
        int status = ex.getStatusCode().value();
        log.warn("Gemini HTTP {} response", status);
        if (status == 429) {
            return new AIQuotaExceededException("AI provider quota exceeded. Try again later.");
        }
        if (status >= 500) {
            return new AIProviderUnavailableException("AI provider is temporarily unavailable");
        }
        if (status == 401 || status == 403) {
            return new AIConfigurationException("AI provider rejected the configured credentials");
        }
        return new AIProviderUnavailableException("AI provider request was rejected (HTTP " + status + ")");
    }

    private static String stripDataUrlPrefix(String imageBase64) {
        if (imageBase64 == null) {
            return "";
        }
        if (imageBase64.contains(",")) {
            return imageBase64.substring(imageBase64.indexOf(',') + 1);
        }
        return imageBase64;
    }

    private static String normalizeMimeType(String mimeType) {
        String resolved = mimeType != null && !mimeType.isBlank() ? mimeType : "image/jpeg";
        if (resolved.contains(";")) {
            return resolved.substring(0, resolved.indexOf(';'));
        }
        return resolved;
    }
}
