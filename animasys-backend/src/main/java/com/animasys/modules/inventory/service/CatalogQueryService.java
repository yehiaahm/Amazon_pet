package com.animasys.modules.inventory.service;

import com.animasys.modules.inventory.domain.BarcodeStatus;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogPageResponse;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogSearchCriteria;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogVariantSummaryDTO;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogSearchCriteria.MAX_SIZE;

@Service
@RequiredArgsConstructor
public class CatalogQueryService {

    private static final Set<String> ALLOWED_SORT = Set.of(
            "name", "sku", "price", "stockQuantity", "barcode", "productName");

    private final ProductVariantRepository variantRepository;

    @Transactional(readOnly = true)
    public CatalogPageResponse search(String tenantId, CatalogSearchCriteria criteria) {
        int page = Math.max(0, criteria.getPage());
        int size = Math.min(Math.max(1, criteria.getSize()), MAX_SIZE);
        Sort sort = parseSort(criteria.getSort());
        Pageable pageable = PageRequest.of(page, size, sort);

        Specification<ProductVariant> spec = buildSpec(tenantId, criteria);
        Page<ProductVariant> result = variantRepository.findAll(spec, pageable);

        List<CatalogVariantSummaryDTO> content = result.getContent().stream()
                .map(this::toSummary)
                .toList();

        return CatalogPageResponse.builder()
                .content(content)
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .page(result.getNumber())
                .size(result.getSize())
                .sort(criteria.getSort() != null ? criteria.getSort() : "name,asc")
                .build();
    }

    /** Legacy internal helper — not used by paginated catalog APIs. */
    @Transactional(readOnly = true)
    public List<ProductVariant> listUniqueVariantsForTenant(String tenantId) {
        List<ProductVariant> all = variantRepository.findAllByTenantIdWithProduct(tenantId);
        Map<String, ProductVariant> bySku = new LinkedHashMap<>();
        for (ProductVariant variant : all) {
            String key = SkuCatalogService.normalizeSku(variant.getSku());
            bySku.merge(key, variant, (left, right) ->
                    left.getStockQuantity() >= right.getStockQuantity() ? left : right);
        }
        return new ArrayList<>(bySku.values());
    }

    private Specification<ProductVariant> buildSpec(String tenantId, CatalogSearchCriteria c) {
        return (root, query, cb) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("product", JoinType.INNER);
                query.distinct(true);
            }
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("tenantId"), tenantId));

            Join<ProductVariant, Product> product = root.join("product", JoinType.INNER);

            if (c.getCategory() != null && !c.getCategory().isBlank()) {
                predicates.add(cb.equal(product.join("category", JoinType.LEFT).get("id"), c.getCategory()));
            }
            if (c.getBrand() != null && !c.getBrand().isBlank()) {
                predicates.add(cb.equal(product.join("brand", JoinType.LEFT).get("id"), c.getBrand()));
            }
            if (c.getSupplier() != null && !c.getSupplier().isBlank()) {
                predicates.add(cb.equal(product.join("supplier", JoinType.LEFT).get("id"), c.getSupplier()));
            }
            if (c.getSku() != null && !c.getSku().isBlank()) {
                String sku = c.getSku().trim().toLowerCase(Locale.ROOT);
                predicates.add(cb.like(cb.lower(root.get("sku")), "%" + sku + "%"));
            }
            if (c.getBarcode() != null && !c.getBarcode().isBlank()) {
                predicates.add(cb.equal(root.get("barcode"), c.getBarcode().trim()));
            }
            if (c.getStatus() != null && !c.getStatus().isBlank()) {
                predicates.add(cb.equal(root.get("barcodeStatus"),
                        BarcodeStatus.valueOf(c.getStatus().trim().toUpperCase(Locale.ROOT))));
            }
            if (Boolean.TRUE.equals(c.getLowStock())) {
                predicates.add(cb.lessThanOrEqualTo(root.get("stockQuantity"), product.get("minStockLimit")));
            }
            if (c.getSearch() != null && !c.getSearch().isBlank()) {
                String term = "%" + c.getSearch().trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("sku")), term),
                        cb.like(cb.lower(root.get("name")), term),
                        cb.like(cb.lower(product.get("name")), term),
                        cb.like(cb.lower(product.get("sku")), term),
                        cb.like(cb.lower(root.get("barcode")), term)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Sort parseSort(String sortParam) {
        if (sortParam == null || sortParam.isBlank()) {
            return Sort.by(Sort.Direction.ASC, "name");
        }
        String[] parts = sortParam.split(",", 2);
        String field = parts[0].trim();
        if (!ALLOWED_SORT.contains(field)) {
            field = "name";
        }
        if ("productName".equals(field)) {
            field = "product.name";
        }
        Sort.Direction dir = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC : Sort.Direction.ASC;
        return Sort.by(dir, field);
    }

    private CatalogVariantSummaryDTO toSummary(ProductVariant v) {
        Product p = v.getProduct();
        return CatalogVariantSummaryDTO.builder()
                .variantId(v.getId())
                .productId(p != null ? p.getId() : null)
                .sku(v.getSku())
                .productName(p != null ? p.getName() : v.getName())
                .variantName(v.getName())
                .price(v.getPrice())
                .cost(v.getCost())
                .wholesalePrice(v.getWholesalePrice())
                .stockQuantity(v.getStockQuantity())
                .minStockLimit(p != null ? p.getMinStockLimit() : 0)
                .reorderLevel(p != null ? p.getReorderLevel() : 0)
                .barcode(v.getBarcode())
                .barcodeFormat(v.getBarcodeFormat() != null ? v.getBarcodeFormat().name() : null)
                .barcodeGenerated(v.getBarcodeGenerated())
                .barcodeSource(v.getBarcodeSource() != null ? v.getBarcodeSource().name() : null)
                .barcodeStatus(v.getBarcodeStatus() != null ? v.getBarcodeStatus().name() : null)
                .categoryId(p != null && p.getCategory() != null ? p.getCategory().getId() : null)
                .categoryName(p != null && p.getCategory() != null ? p.getCategory().getName() : null)
                .brandId(p != null && p.getBrand() != null ? p.getBrand().getId() : null)
                .brandName(p != null && p.getBrand() != null ? p.getBrand().getName() : null)
                .supplierId(p != null && p.getSupplier() != null ? p.getSupplier().getId() : null)
                .supplierName(p != null && p.getSupplier() != null ? p.getSupplier().getName() : null)
                .build();
    }
}
