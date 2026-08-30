package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.importer.domain.DuplicateMatchType;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bulk duplicate detection against the existing catalog (priority SKU > Barcode > Name+Variant)
 * plus in-file consistency checks (Step 10: same barcode used with different SKUs).
 * All existing-catalog data is preloaded once per session — no per-row DB queries.
 */
@Service
@RequiredArgsConstructor
public class DuplicateDetectionService {

    private final ProductVariantRepository productVariantRepository;

    public CatalogIndex buildIndex(String tenantId) {
        List<ProductVariant> variants = productVariantRepository.findAllByTenantIdWithProduct(tenantId);
        Map<String, ProductVariant> bySku = new HashMap<>();
        Map<String, ProductVariant> byBarcode = new HashMap<>();
        Map<String, ProductVariant> byNameVariant = new HashMap<>();

        for (ProductVariant v : variants) {
            if (v.getSku() != null) {
                bySku.putIfAbsent(HeaderNormalizer.normalize(v.getSku()), v);
            }
            if (v.getBarcode() != null && !v.getBarcode().isBlank()) {
                byBarcode.putIfAbsent(HeaderNormalizer.normalize(v.getBarcode()), v);
            }
            String productName = v.getProduct() != null ? v.getProduct().getName() : null;
            if (productName != null) {
                String key = HeaderNormalizer.normalize(productName) + "|" + HeaderNormalizer.normalize(nullToEmpty(v.getName()));
                byNameVariant.putIfAbsent(key, v);
            }
        }
        return new CatalogIndex(bySku, byBarcode, byNameVariant);
    }

    public DuplicateMatch findMatch(CatalogIndex index, Map<ImportField, String> row) {
        String sku = nullToEmpty(row.get(ImportField.SKU));
        if (!sku.isEmpty()) {
            ProductVariant v = index.bySku().get(HeaderNormalizer.normalize(sku));
            if (v != null) {
                return new DuplicateMatch(DuplicateMatchType.SKU, v.getProduct().getId(), v.getId());
            }
        }
        String barcode = nullToEmpty(row.get(ImportField.BARCODE));
        if (!barcode.isEmpty()) {
            ProductVariant v = index.byBarcode().get(HeaderNormalizer.normalize(barcode));
            if (v != null) {
                return new DuplicateMatch(DuplicateMatchType.BARCODE, v.getProduct().getId(), v.getId());
            }
        }
        String name = nullToEmpty(row.get(ImportField.PRODUCT_NAME));
        if (!name.isEmpty()) {
            String key = HeaderNormalizer.normalize(name) + "|" + HeaderNormalizer.normalize(nullToEmpty(row.get(ImportField.VARIANT)));
            ProductVariant v = index.byNameVariant().get(key);
            if (v != null) {
                return new DuplicateMatch(DuplicateMatchType.NAME_VARIANT, v.getProduct().getId(), v.getId());
            }
        }
        return null;
    }

    /** AI check (Step 10): flags rows whose barcode is reused elsewhere in the same file with a different SKU. */
    public Map<Integer, String> findIntraFileBarcodeConflicts(List<Map<ImportField, String>> rows) {
        Map<String, String> barcodeToFirstSku = new HashMap<>();
        Map<Integer, String> warnings = new HashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            String barcode = nullToEmpty(rows.get(i).get(ImportField.BARCODE));
            String sku = nullToEmpty(rows.get(i).get(ImportField.SKU));
            if (barcode.isEmpty()) {
                continue;
            }
            String key = HeaderNormalizer.normalize(barcode);
            String firstSku = barcodeToFirstSku.putIfAbsent(key, sku);
            if (firstSku != null && !firstSku.equalsIgnoreCase(sku)) {
                warnings.put(i, "الباركود \"" + barcode + "\" مستخدم مع أكثر من SKU في نفس الملف");
            }
        }
        return warnings;
    }

    /** Flags every row past the first that reuses a SKU already seen earlier in the same file. */
    public Map<Integer, String> findIntraFileDuplicateSkus(List<Map<ImportField, String>> rows) {
        Map<String, Integer> skuToFirstRow = new HashMap<>();
        Map<Integer, String> warnings = new HashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            String sku = nullToEmpty(rows.get(i).get(ImportField.SKU));
            if (sku.isEmpty()) {
                continue;
            }
            String key = HeaderNormalizer.normalize(sku);
            Integer firstRow = skuToFirstRow.putIfAbsent(key, i);
            if (firstRow != null) {
                warnings.put(i, "SKU \"" + sku + "\" مكرر في نفس الملف (الصف " + (firstRow + 1) + ")");
            }
        }
        return warnings;
    }

    private String nullToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    public record CatalogIndex(Map<String, ProductVariant> bySku, Map<String, ProductVariant> byBarcode,
                                Map<String, ProductVariant> byNameVariant) {
    }
}
