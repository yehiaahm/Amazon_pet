package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.domain.Supplier;
import com.animasys.modules.inventory.service.SupplierService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/suppliers")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    @PreAuthorize("@authz.has('products.manage_suppliers')")
    public ResponseEntity<ApiResponseWrapper<List<Supplier>>> getSuppliers() {
        String tenantId = SecurityUtils.requireTenantId();
        List<Supplier> list = supplierService.getAllByTenant(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة الموردين بنجاح"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('products.manage_suppliers')")
    public ResponseEntity<ApiResponseWrapper<Supplier>> createSupplier(@RequestBody Supplier dto) {
        String tenantId = SecurityUtils.requireTenantId();
        Supplier created = supplierService.createSupplier(tenantId, dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل المورد بنجاح"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('products.manage_suppliers')")
    public ResponseEntity<ApiResponseWrapper<Supplier>> getSupplierById(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Supplier supplier = supplierService.getById(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(supplier, "تم استرجاع تفاصيل المورد"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('products.manage_suppliers')")
    public ResponseEntity<ApiResponseWrapper<Supplier>> updateSupplier(
            @PathVariable String id,
            @RequestBody Supplier dto) {
        String tenantId = SecurityUtils.requireTenantId();
        Supplier updated = supplierService.updateSupplier(tenantId, id, dto);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث بيانات المورد بنجاح"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('products.manage_suppliers')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteSupplier(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        supplierService.deleteSupplier(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف المورد بنجاح"));
    }
}
