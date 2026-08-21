package com.animasys.modules.vaccination.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.vaccination.dto.AdministerVaccinationRequest;
import com.animasys.modules.vaccination.dto.VaccinationHistoryResponse;
import com.animasys.modules.vaccination.dto.VaccinationRecordResponse;
import com.animasys.modules.vaccination.dto.VaccinationRequest;
import com.animasys.modules.vaccination.service.AnimalFollowUpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/vaccinations")
@RequiredArgsConstructor
public class VaccinationController {

    private final AnimalFollowUpService followUpService;

    @GetMapping
    @PreAuthorize("@authz.has('vaccinations.view')")
    public ResponseEntity<ApiResponseWrapper<List<VaccinationRecordResponse>>> getVaccinations(
            @RequestParam(required = false) String petId) {
        String tenantId = SecurityUtils.requireTenantId();
        List<VaccinationRecordResponse> list = followUpService.getVaccinations(tenantId, petId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع سجلات التطعيمات"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('vaccinations.manage')")
    public ResponseEntity<ApiResponseWrapper<VaccinationRecordResponse>> createVaccination(
            @RequestBody VaccinationRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee actor = SecurityUtils.requireEmployee();
        VaccinationRecordResponse created = followUpService.createVaccination(tenantId, actor, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل جدول التطعيم"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('vaccinations.manage')")
    public ResponseEntity<ApiResponseWrapper<VaccinationRecordResponse>> updateVaccination(
            @PathVariable String id,
            @RequestBody VaccinationRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        VaccinationRecordResponse updated = followUpService.updateVaccination(tenantId, id, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث جدول التطعيم"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('vaccinations.manage')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteVaccination(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        followUpService.deleteVaccination(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف جدول التطعيم"));
    }

    @PostMapping("/{id}/administer")
    @PreAuthorize("@authz.has('vaccinations.manage')")
    public ResponseEntity<ApiResponseWrapper<VaccinationRecordResponse>> administerVaccination(
            @PathVariable String id,
            @RequestBody(required = false) AdministerVaccinationRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee actor = SecurityUtils.requireEmployee();
        AdministerVaccinationRequest body = request != null ? request : new AdministerVaccinationRequest();
        VaccinationRecordResponse updated = followUpService.administerVaccination(tenantId, actor, id, body);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تسجيل أخذ التطعيم"));
    }

    @GetMapping("/{id}/history")
    @PreAuthorize("@authz.has('vaccinations.view')")
    public ResponseEntity<ApiResponseWrapper<List<VaccinationHistoryResponse>>> getHistory(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        List<VaccinationHistoryResponse> history = followUpService.getVaccinationHistory(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(history, "تم استرجاع سجل التطعيمات السابقة"));
    }
}
