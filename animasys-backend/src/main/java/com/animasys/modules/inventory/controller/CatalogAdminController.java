package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.dto.SkuDuplicateMergeReport;
import com.animasys.modules.inventory.service.ProductVariantDuplicateMergeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/inventory/catalog-admin")
@RequiredArgsConstructor
public class CatalogAdminController {

    private final ProductVariantDuplicateMergeService duplicateMergeService;

    @GetMapping("/duplicate-skus/preview")
    @PreAuthorize("@authz.has('products.edit')")
    public ResponseEntity<ApiResponseWrapper<SkuDuplicateMergeReport>> previewDuplicateSkus() {
        String tenantId = SecurityUtils.requireTenantId();
        SkuDuplicateMergeReport report = duplicateMergeService.previewDuplicates(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(report, "Duplicate SKU preview"));
    }

    @PostMapping("/duplicate-skus/merge")
    @PreAuthorize("@authz.has('settings.factory_reset')")
    public ResponseEntity<ApiResponseWrapper<SkuDuplicateMergeReport>> mergeDuplicateSkus() {
        String tenantId = SecurityUtils.requireTenantId();
        SkuDuplicateMergeReport report = duplicateMergeService.mergeTenant(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(report, "Duplicate SKU merge completed"));
    }

    /** For duplicates the automatic SKU-grouping can't pair (same product, different SKU). */
    @PostMapping("/variants/{targetVariantId}/merge/{sourceVariantId}")
    @PreAuthorize("@authz.has('settings.factory_reset')")
    public ResponseEntity<ApiResponseWrapper<SkuDuplicateMergeReport>> mergeSpecificVariants(
            @PathVariable String targetVariantId, @PathVariable String sourceVariantId) {
        String tenantId = SecurityUtils.requireTenantId();
        SkuDuplicateMergeReport report = duplicateMergeService.mergeSpecificVariants(tenantId, targetVariantId, sourceVariantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(report, "Variant merge completed"));
    }
}
