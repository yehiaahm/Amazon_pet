package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogPageResponse;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogSearchCriteria;
import com.animasys.modules.inventory.dto.CreateProductRequest;
import com.animasys.modules.inventory.dto.UpdateProductRequest;
import com.animasys.modules.inventory.service.CatalogQueryService;
import com.animasys.modules.inventory.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final CatalogQueryService catalogQueryService;

    @GetMapping
    @PreAuthorize("@authz.has('products.view')")
    public ResponseEntity<ApiResponseWrapper<CatalogPageResponse>> searchProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String barcode,
            @RequestParam(required = false) String sku,
            @RequestParam(required = false) Boolean lowStock
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        String resolvedSearch = search != null && !search.isBlank() ? search : q;
        CatalogPageResponse results = catalogQueryService.search(tenantId, CatalogSearchCriteria.builder()
                .page(page)
                .size(size)
                .sort(sort)
                .search(resolvedSearch)
                .category(category)
                .brand(brand)
                .supplier(supplier)
                .status(status)
                .barcode(barcode)
                .sku(sku)
                .lowStock(lowStock)
                .build());
        return ResponseEntity.ok(ApiResponseWrapper.success(results, "تم استرجاع المنتجات"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('products.add')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> createProduct(
            @RequestBody CreateProductRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> created = productService.createProductFromRequest(tenantId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم إضافة المنتج بنجاح"));
    }

    @PutMapping("/variants/{variantId}")
    @PreAuthorize("@authz.has('products.edit')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> updateProduct(
            @PathVariable String variantId,
            @RequestBody UpdateProductRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> updated = productService.updateProductFromRequest(tenantId, variantId, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث المنتج بنجاح"));
    }

    @DeleteMapping("/variants/{variantId}")
    @PreAuthorize("@authz.has('products.delete')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteVariant(@PathVariable String variantId) {
        String tenantId = SecurityUtils.requireTenantId();
        productService.deleteProductVariant(tenantId, variantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف المنتج بنجاح"));
    }
}
