package com.animasys.modules.inventory.importer.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import com.animasys.modules.inventory.importer.dto.*;
import com.animasys.modules.inventory.importer.service.ImportCommitService;
import com.animasys.modules.inventory.importer.service.ImportErrorReportService;
import com.animasys.modules.inventory.importer.service.ImportMappingPresetService;
import com.animasys.modules.inventory.importer.service.ImportSessionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/v1/inventory/import")
@RequiredArgsConstructor
public class ImportController {

    private final ImportSessionService importSessionService;
    private final ImportCommitService importCommitService;
    private final ImportErrorReportService importErrorReportService;
    private final ImportMappingPresetService importMappingPresetService;

    @PostMapping(value = "/sessions", consumes = "multipart/form-data")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<ImportUploadResponse> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "mode", required = false, defaultValue = "ADD_STOCK") String mode) {
        ImportMode importMode;
        try {
            importMode = ImportMode.valueOf(mode);
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleException("وضع الاستيراد غير صالح: " + mode);
        }
        ImportUploadResponse response = importSessionService.upload(
                file, SecurityUtils.requireTenantId(), SecurityUtils.requireEmployeeId(), importMode);
        return ApiResponseWrapper.success(response, "تم رفع الملف بنجاح");
    }

    @PutMapping("/sessions/{id}/mapping")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<ImportMappingResponse> confirmMapping(@PathVariable("id") String sessionId,
                                                                      @RequestBody ColumnMappingRequest request) {
        ImportMappingResponse response = importSessionService.confirmMapping(sessionId, SecurityUtils.requireTenantId(), request);
        return ApiResponseWrapper.success(response, "تم تطبيق ربط الأعمدة والتحقق من البيانات");
    }

    @GetMapping("/sessions/{id}/preview")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<Page<ImportPreviewRow>> preview(@PathVariable("id") String sessionId,
                                                                @RequestParam(value = "status", required = false) String status,
                                                                @RequestParam(value = "search", required = false) String search,
                                                                @RequestParam(value = "page", defaultValue = "0") int page,
                                                                @RequestParam(value = "size", defaultValue = "50") int size) {
        Page<ImportPreviewRow> result = importSessionService.preview(sessionId, SecurityUtils.requireTenantId(), status, search,
                PageRequest.of(page, Math.min(size, 200)));
        return ApiResponseWrapper.success(result);
    }

    @PatchMapping("/sessions/{id}/duplicates")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<Void> resolveDuplicates(@PathVariable("id") String sessionId,
                                                        @RequestBody DuplicateResolutionRequest request) {
        importSessionService.resolveDuplicates(sessionId, SecurityUtils.requireTenantId(), request);
        return ApiResponseWrapper.success(null, "تم تحديث إجراء التكرارات");
    }

    @PostMapping("/sessions/{id}/commit")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<ImportSummary> commit(@PathVariable("id") String sessionId) {
        ImportSummary summary = importCommitService.commit(sessionId, SecurityUtils.requireTenantId(), SecurityUtils.requireEmployeeId());
        return ApiResponseWrapper.success(summary, "اكتمل الاستيراد");
    }

    @GetMapping("/sessions/{id}/error-report")
    @PreAuthorize("@authz.has('products.import')")
    public ResponseEntity<byte[]> errorReport(@PathVariable("id") String sessionId) {
        byte[] workbook = importErrorReportService.buildErrorReport(sessionId, SecurityUtils.requireTenantId());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"import-errors-" + sessionId + ".xlsx\"")
                .body(workbook);
    }

    // ── SAVED COLUMN MAPPINGS ────────────────────────────────────────────────

    @GetMapping("/mapping-presets")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<List<ImportMappingPresetDTO>> listMappingPresets(
            @RequestParam(value = "mode", required = false, defaultValue = "ADD_STOCK") String mode) {
        return ApiResponseWrapper.success(importMappingPresetService.list(SecurityUtils.requireTenantId(), mode));
    }

    @PostMapping("/mapping-presets")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<ImportMappingPresetDTO> saveMappingPreset(@Valid @RequestBody SaveImportMappingPresetRequest request) {
        ImportMappingPresetDTO saved = importMappingPresetService.save(
                SecurityUtils.requireTenantId(), SecurityUtils.requireEmployeeId(), request);
        return ApiResponseWrapper.success(saved, "تم حفظ التخطيط بنجاح");
    }

    @DeleteMapping("/mapping-presets/{id}")
    @PreAuthorize("@authz.has('products.import')")
    public ApiResponseWrapper<Void> deleteMappingPreset(@PathVariable("id") String presetId) {
        importMappingPresetService.delete(SecurityUtils.requireTenantId(), presetId);
        return ApiResponseWrapper.success(null, "تم حذف التخطيط");
    }
}
