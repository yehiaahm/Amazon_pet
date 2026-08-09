package com.animasys.modules.inventory.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Commits catalog rows with an explicit flush before FIFO batch creation.
 */
@Service
@RequiredArgsConstructor
public class CatalogPersistenceService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;

    @Transactional
    public ProductVariant saveVariant(ProductVariant variant) {
        if (variant.getProduct() != null && variant.getProduct().getId() != null) {
            String productId = variant.getProduct().getId();
            Product product = productRepository.findById(productId).orElse(variant.getProduct());
            variant.setProduct(product);
            String tId = (product.getTenant() != null && product.getTenant().getId() != null)
                    ? product.getTenant().getId()
                    : productRepository.findTenantIdByProductId(productId);
            variant.setTenantId(tId);
            variant.setSku(product.getSku());
        }
        return variantRepository.saveAndFlush(variant);
    }

    @Transactional
    public void ensureVariantRowExists(String productVariantId) {
        if (productVariantId == null || productVariantId.isBlank()) {
            throw new ResourceNotFoundException("ProductVariant id is required");
        }
        variantRepository.flush();
        if (!variantRepository.existsById(productVariantId)) {
            throw new ResourceNotFoundException(
                    "ProductVariant not found in database (save variant before batch): " + productVariantId);
        }
    }
}
