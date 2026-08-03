package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.domain.ImportSession;
import com.animasys.modules.inventory.dto.ChunkImportRequest;
import com.animasys.modules.inventory.dto.StartImportRequest;
import com.animasys.modules.inventory.service.ImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/v1/import")
@RequiredArgsConstructor
public class ImportController {

    private final ImportService importService;

    @PostMapping("/session/start")
    @PreAuthorize("@authz.has('purchases.ocr_import')")
    public ResponseEntity<ApiResponseWrapper<ImportSession>> startSession(@RequestBody StartImportRequest request) {
        request.setUploadedBy(SecurityUtils.requireEmployeeId());
        ImportSession session = importService.startSession(request);
        return ResponseEntity.ok(ApiResponseWrapper.success(session, "Import session initialized"));
    }

    @PostMapping("/session/{id}/chunk")
    @PreAuthorize("@authz.has('purchases.ocr_import')")
    public ResponseEntity<ApiResponseWrapper<Void>> importChunk(
            @PathVariable String id,
            @RequestBody ChunkImportRequest request) {
        request.setEmployeeId(SecurityUtils.requireEmployeeId());
        importService.processChunk(id, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Chunk processed successfully"));
    }

    @PostMapping("/session/{id}/finalize")
    @PreAuthorize("@authz.has('purchases.ocr_import')")
    public ResponseEntity<ApiResponseWrapper<ImportSession>> finalizeSession(@PathVariable String id) {
        ImportSession session = importService.finalizeSession(id);
        return ResponseEntity.ok(ApiResponseWrapper.success(session, "Import session completed"));
    }

    @PostMapping("/session/{id}/undo")
    @PreAuthorize("@authz.has('purchases.ocr_import')")
    public ResponseEntity<ApiResponseWrapper<Void>> undoSession(
            @PathVariable String id,
            @RequestParam(required = false) String employeeId) {
        importService.undoSession(id, SecurityUtils.requireEmployeeId());
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Import session undone successfully"));
    }

    @DeleteMapping("/session/{id}")
    @PreAuthorize("@authz.has('settings.factory_reset')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteSession(
            @PathVariable String id,
            @RequestParam(required = false) String employeeId) {
        importService.deleteSessionAndProducts(id, SecurityUtils.requireEmployeeId());
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Import session and related products deleted successfully"));
    }

    @GetMapping("/history")
    @PreAuthorize("@authz.has('purchases.ocr_import')")
    public ResponseEntity<ApiResponseWrapper<List<ImportSession>>> getHistory() {
        List<ImportSession> history = importService.getHistory();
        return ResponseEntity.ok(ApiResponseWrapper.success(history, "Import history retrieved"));
    }
}
