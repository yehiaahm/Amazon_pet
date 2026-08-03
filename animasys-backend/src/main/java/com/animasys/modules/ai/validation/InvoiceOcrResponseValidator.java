package com.animasys.modules.ai.validation;

import com.animasys.modules.ai.exception.AIInvalidResponseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * Validates OCR invoice JSON before it can reach purchase-import flows.
 */
@Component
@RequiredArgsConstructor
public class InvoiceOcrResponseValidator {

    private static final String[] HEADER_TOTAL_FIELDS = {"vat", "discount", "shipping", "netTotal", "grandTotal"};

    private final AiResponseParser responseParser;
    private final ObjectMapper objectMapper;

    public String validateAndNormalize(String rawResponse) {
        if (rawResponse == null || rawResponse.isBlank()) {
            throw new AIInvalidResponseException("Invoice OCR returned an empty response");
        }

        JsonNode root = responseParser.parseJsonTree(rawResponse);
        if (root == null || !root.isObject()) {
            throw new AIInvalidResponseException("Invoice OCR response is not valid JSON");
        }

        ObjectNode invoice = (ObjectNode) root;
        rejectMockMarkers(invoice);

        JsonNode itemsNode = invoice.get("items");
        if (itemsNode == null || !itemsNode.isArray() || itemsNode.isEmpty()) {
            throw new AIInvalidResponseException("Invoice OCR must include at least one line item");
        }

        for (String field : HEADER_TOTAL_FIELDS) {
            validateNonNegativeNumber(invoice.get(field), field);
        }

        validateOptionalDate(invoice.get("invoiceDate"), "invoiceDate");

        ArrayNode normalizedItems = objectMapper.createArrayNode();
        int index = 0;
        for (JsonNode itemNode : itemsNode) {
            if (!itemNode.isObject()) {
                throw new AIInvalidResponseException("Invoice line item " + index + " is malformed");
            }
            ObjectNode item = (ObjectNode) itemNode;
            String productName = textValue(item.get("productName"));
            if (productName == null && item.has("name")) {
                productName = textValue(item.get("name"));
            }
            if (productName == null || productName.isBlank()) {
                throw new AIInvalidResponseException("Invoice line item " + index + " is missing productName");
            }

            validateNonNegativeNumber(item.get("unitCost"), "items[" + index + "].unitCost");
            validateNonNegativeNumber(item.get("lineTotal"), "items[" + index + "].lineTotal");
            validateNonNegativeNumber(item.get("price"), "items[" + index + "].price");
            validatePositiveQuantity(item.get("quantity"), index);
            validateOptionalDate(item.get("expiryDate"), "items[" + index + "].expiryDate");

            normalizedItems.add(item);
            index++;
        }

        invoice.set("items", normalizedItems);

        try {
            return objectMapper.writeValueAsString(invoice);
        } catch (Exception ex) {
            throw new AIInvalidResponseException("Failed to serialize validated invoice OCR response");
        }
    }

    private void rejectMockMarkers(JsonNode invoice) {
        if (invoice.has("fallback") && invoice.get("fallback").asBoolean(false)) {
            throw new AIInvalidResponseException("Invoice OCR fallback data is not allowed");
        }
        if (invoice.has("error")) {
            throw new AIInvalidResponseException("Invoice OCR provider returned an error payload");
        }
    }

    private void validateNonNegativeNumber(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return;
        }
        BigDecimal value = asDecimal(node);
        if (value == null) {
            throw new AIInvalidResponseException("Field " + field + " must be numeric");
        }
        if (value.signum() < 0) {
            throw new AIInvalidResponseException("Field " + field + " cannot be negative");
        }
    }

    private void validatePositiveQuantity(JsonNode node, int index) {
        if (node == null || node.isNull()) {
            throw new AIInvalidResponseException("Invoice line item " + index + " is missing quantity");
        }
        BigDecimal qty = asDecimal(node);
        if (qty == null || qty.signum() <= 0) {
            throw new AIInvalidResponseException("Invoice line item " + index + " must have quantity greater than zero");
        }
    }

    private void validateOptionalDate(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return;
        }
        String raw = textValue(node);
        if (raw == null || raw.isBlank()) {
            return;
        }
        String datePart = raw.length() >= 10 ? raw.substring(0, 10) : raw;
        try {
            LocalDate.parse(datePart);
        } catch (DateTimeParseException ex) {
            throw new AIInvalidResponseException("Field " + field + " has an invalid date format");
        }
    }

    private BigDecimal asDecimal(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.decimalValue();
        }
        if (node.isTextual()) {
            try {
                return new BigDecimal(node.asText().trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }

    private String textValue(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return node.asText(null);
    }
}
