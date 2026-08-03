package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Ensures at most one sellable {@link ProductVariant} per SKU per tenant (via one {@link Product} per SKU).
 */
@Service
@RequiredArgsConstructor
public class SkuCatalogService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public static String normalizeSku(String sku) {
        if (sku == null) {
            return "";
        }
        return sku.trim().toUpperCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public Optional<Product> findProductBySkuIgnoreCase(String tenantId, String sku) {
        if (sku == null || sku.isBlank()) {
            return Optional.empty();
        }
        return productRepository.findBySkuIgnoreCaseAndTenantId(sku.trim(), tenantId);
    }

    /**
     * Returns the canonical variant for a product (creates none). Prefer variant with most inventory history.
     */
    @Transactional(readOnly = true)
    public Optional<ProductVariant> findCanonicalVariant(Product product) {
        if (product == null || product.getId() == null) {
            return Optional.empty();
        }
        List<ProductVariant> variants = variantRepository.findByProductId(product.getId());
        if (variants.isEmpty()) {
            return Optional.empty();
        }
        if (variants.size() == 1) {
            return Optional.of(variants.get(0));
        }
        return Optional.of(selectSurvivorVariant(variants));
    }

    /**
     * Find by SKU or create a new product + single variant. Never creates a second variant for the same SKU.
     */
    @Transactional
    public ProductVariant upsertVariantForSku(
            String tenantId,
            Product productTemplate,
            String variantName,
            BigDecimal price,
            BigDecimal cost
    ) {
        String sku = productTemplate.getSku();
        if (sku == null || sku.isBlank()) {
            throw new BusinessRuleException("SKU مطلوب");
        }
        String trimmedSku = sku.trim();
        productTemplate.setSku(trimmedSku);

        Optional<Product> existing = findProductBySkuIgnoreCase(tenantId, trimmedSku);
        Product product;
        if (existing.isPresent()) {
            product = existing.get();
            if (productTemplate.getName() != null && !productTemplate.getName().isBlank()) {
                product.setName(productTemplate.getName());
            }
            if (productTemplate.getCategory() != null) {
                product.setCategory(productTemplate.getCategory());
            }
            if (productTemplate.getBrand() != null) {
                product.setBrand(productTemplate.getBrand());
            }
            if (productTemplate.getSupplier() != null) {
                product.setSupplier(productTemplate.getSupplier());
            }
            product.setMinStockLimit(productTemplate.getMinStockLimit());
            product = productRepository.saveAndFlush(product);
        } else {
            product = productRepository.saveAndFlush(productTemplate);
        }

        return updateOrCreateSingleVariant(product, variantName, price, cost);
    }

    @Transactional
    public ProductVariant updateOrCreateSingleVariant(
            Product product,
            String variantName,
            BigDecimal price,
            BigDecimal cost
    ) {
        Optional<ProductVariant> canonical = findCanonicalVariant(product);
        ProductVariant variant;
        if (canonical.isPresent()) {
            variant = canonical.get();
            if (price != null) {
                variant.setPrice(price);
            }
            if (cost != null) {
                variant.setCost(cost);
            }
            if (variantName != null && !variantName.isBlank()) {
                variant.setName(variantName.trim());
            }
        } else {
            Product managedProduct = entityManager.find(Product.class, product.getId());
            if (managedProduct == null) {
                throw new BusinessRuleException("Product must be saved before creating a variant");
            }
            variant = ProductVariant.builder()
                    .id("v-" + UUID.randomUUID().toString().substring(0, 8))
                    .product(managedProduct)
                    .name(variantName != null && !variantName.isBlank() ? variantName.trim() : "Standard")
                    .price(price != null ? price : BigDecimal.ZERO)
                    .cost(cost != null ? cost : BigDecimal.ZERO)
                    .stockQuantity(0)
                    .build();
            syncVariantSkuFromProduct(variant, managedProduct);
            entityManager.persist(variant);
            entityManager.flush();
            return variant;
        }
        syncVariantSkuFromProduct(variant, product);
        return variantRepository.saveAndFlush(variant);
    }

    public void syncVariantSkuFromProduct(ProductVariant variant, Product product) {
        if (product != null && product.getId() != null) {
            variant.setTenantId(productRepository.findTenantIdByProductId(product.getId()));
            variant.setSku(product.getSku());
        }
    }

    ProductVariant selectSurvivorVariant(List<ProductVariant> variants) {
        return variants.stream()
                .max(Comparator
                        .comparingInt(ProductVariant::getStockQuantity)
                        .thenComparing(v -> v.getId() != null ? v.getId() : "", Comparator.reverseOrder()))
                .orElse(variants.get(0));
    }
}
