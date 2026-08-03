package com.animasys.modules.inventory.barcode;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class QrPayload {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final int CURRENT_VERSION = 1;

    private String type;
    private String variantId;
    private String barcode;
    private String tenant;
    private int version;
    private String sku;
    private String productName;
    private String price;

    public static QrPayload forProduct(String tenantId, String variantId, String barcode,
                                        String sku, String productName, String price) {
        return QrPayload.builder()
                .type("product")
                .variantId(variantId)
                .barcode(barcode)
                .tenant(tenantId)
                .version(CURRENT_VERSION)
                .sku(sku)
                .productName(productName)
                .price(price)
                .build();
    }

    public String toJson() {
        try {
            return MAPPER.writeValueAsString(this);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize QR payload", e);
        }
    }

    public static QrPayload fromJson(String json) {
        try {
            return MAPPER.readValue(json, QrPayload.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize QR payload", e);
        }
    }
}
