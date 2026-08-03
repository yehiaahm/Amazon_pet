package com.animasys.modules.crm.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.service.CustomerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/pets")
@RequiredArgsConstructor
public class PetController {

    private final CustomerService customerService;

    @GetMapping
    @PreAuthorize("@authz.has('pets.view')")
    public ResponseEntity<ApiResponseWrapper<List<Pet>>> getPets(
            @RequestParam(required = false) String customerId) {
        String tenantId = SecurityUtils.requireTenantId();
        List<Pet> list = customerId != null
                ? customerService.getPetsByCustomer(tenantId, customerId)
                : customerService.getAllPetsByTenant(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة الحيوانات الأليفة"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('pets.add')")
    public ResponseEntity<ApiResponseWrapper<Pet>> createPet(
            @RequestParam String customerId,
            @RequestBody Pet dto) {
        String tenantId = SecurityUtils.requireTenantId();
        Pet created = customerService.createPet(tenantId, customerId, dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل الحيوان الأليف بنجاح"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('pets.edit')")
    public ResponseEntity<ApiResponseWrapper<Pet>> updatePet(
            @PathVariable String id,
            @RequestBody Pet dto) {
        String tenantId = SecurityUtils.requireTenantId();
        Pet updated = customerService.updatePet(tenantId, id, dto);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث بيانات الحيوان الأليف"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('pets.delete')")
    public ResponseEntity<ApiResponseWrapper<Void>> deletePet(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        customerService.deletePet(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الحيوان الأليف"));
    }
}
