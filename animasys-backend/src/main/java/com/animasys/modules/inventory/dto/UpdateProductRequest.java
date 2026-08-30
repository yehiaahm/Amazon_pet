package com.animasys.modules.inventory.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

@Data
public class UpdateProductRequest {
    private Map<String, Object> product;
    private Map<String, Object> variant;

    public String getProductName() {
        return str(product, "name");
    }

    public String getSku() {
        return str(product, "sku");
    }

    public String getCategoryId() {
        return str(product, "categoryId");
    }

    public String getCategoryName() {
        return str(product, "categoryName");
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

    public Integer getMinStockLimit() {
        Object v = product != null ? product.get("minStockLimit") : null;
        if (v instanceof Number) return Math.max(0, ((Number) v).intValue());
        if (v != null) {
            try { return Math.max(0, Integer.parseInt(String.valueOf(v))); } catch (Exception ignored) {}
        }
        return null;
    }

    public Integer getReorderLevel() {
        Object v = product != null ? product.get("reorderLevel") : null;
        if (v instanceof Number) return Math.max(0, ((Number) v).intValue());
        if (v != null) {
            try { return Math.max(0, Integer.parseInt(String.valueOf(v))); } catch (Exception ignored) {}
        }
        return null;
    }

    public String getVariantName() {
        return str(variant, "name");
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

    private static String str(Map<String, Object> map, String key) {
        if (map == null || map.get(key) == null) return null;
        String s = String.valueOf(map.get(key)).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private static BigDecimal decimal(Map<String, Object> map, String key) {
        Object v = map != null ? map.get(key) : null;
        if (v == null) return null;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return null; }
    }
}
