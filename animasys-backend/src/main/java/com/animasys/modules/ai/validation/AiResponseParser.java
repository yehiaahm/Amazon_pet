package com.animasys.modules.ai.validation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class AiResponseParser {

    private static final Pattern JSON_FENCE = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)```", Pattern.CASE_INSENSITIVE);

    private final ObjectMapper objectMapper;

    public String extractJsonPayload(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        String trimmed = raw.trim();
        Matcher matcher = JSON_FENCE.matcher(trimmed);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    public JsonNode parseJsonTree(String raw) {
        try {
            return objectMapper.readTree(extractJsonPayload(raw));
        } catch (Exception ex) {
            return null;
        }
    }
}
