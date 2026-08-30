package com.animasys.modules.inventory.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.Map;

@Data
public class CreateProductRequest {
    private Map<String, Object> product;
    private Map<String, Object> variant;

    public String getSku() {
        return str(product, "sku");
    }

    /** Explicit caller confirmation (e.g. import "create new anyway" resolution) to bypass the same-name duplicate guard. */
    public boolean isAllowDuplicateName() {
        Object v = product != null ? product.get("allowDuplicateName") : null;
        return Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(String.valueOf(v));
    }

    public String getProductName() {
        return str(product, "name");
    }

    public String getCategoryId() {
        return str(product, "categoryId");
    }

    public String getCategoryName() {
        String name = str(product, "categoryName");
        return name != null && !name.isBlank() ? name : "عام";
    }

    public String getBrandName() {
        return str(product, "brandName");
    }

    public String getSupplierId() {
        return str(product, "supplierId");
    }

    public String getSupplierName() {
        return str(product, "supplierName");
    }

    public int getMinStockLimit() {
        Object v = product != null ? product.get("minStockLimit") : null;
        if (v instanceof Number) return ((Number) v).intValue();
        if (v != null) {
            try { return Integer.parseInt(String.valueOf(v)); } catch (Exception ignored) {}
        }
        return 10;
    }

    public int getReorderLevel() {
        Object v = product != null ? product.get("reorderLevel") : null;
        if (v instanceof Number) return Math.max(0, ((Number) v).intValue());
        if (v != null) {
            try { return Math.max(0, Integer.parseInt(String.valueOf(v))); } catch (Exception ignored) {}
        }
        return 0;
    }

    public String getVariantName() {
        String name = str(variant, "name");
        return name != null && !name.isBlank() ? name : "قياسي";
    }

    public String getBarcode() {
        return str(variant, "barcode") != null ? str(variant, "barcode") : str(product, "barcode");
    }

    public String getBarcodeFormat() {
        return str(variant, "barcodeFormat") != null ? str(variant, "barcodeFormat") : str(product, "barcodeFormat");
    }

    public BigDecimal getPrice() {
        return decimal(variant, "price");
    }

    public BigDecimal getCost() {
        return decimal(variant, "cost");
    }

    public BigDecimal getWholesalePrice() {
        Object v = variant != null ? variant.get("wholesalePrice") : null;
        if (v == null) return null;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    public int getInitialStock() {
        Object v = variant != null ? variant.get("initialStock") : null;
        if (v == null && product != null) v = product.get("initialStock");
        if (v instanceof Number) return Math.max(0, ((Number) v).intValue());
        if (v != null) {
            try { return Math.max(0, Integer.parseInt(String.valueOf(v))); } catch (Exception ignored) {}
        }
        return 0;
    }

    private static String str(Map<String, Object> map, String key) {
        if (map == null || map.get(key) == null) return null;
        String s = String.valueOf(map.get(key)).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private static BigDecimal decimal(Map<String, Object> map, String key) {
        Object v = map != null ? map.get(key) : null;
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
