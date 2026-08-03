package com.animasys.modules.sales.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.dto.ClosePosSessionRequest;
import com.animasys.modules.sales.dto.OpenPosSessionRequest;
import com.animasys.modules.sales.service.POSSessionService;
import com.animasys.modules.sales.repository.POSSessionRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/v1/pos-sessions")
@RequiredArgsConstructor
public class POSSessionController {

    private final POSSessionService sessionService;
    private final POSSessionRepository sessionRepository;
    private final BranchRepository branchRepository;

    @GetMapping
    @PreAuthorize("@authz.has('sales.open_shift')")
    public ResponseEntity<ApiResponseWrapper<List<POSSession>>> getSessions(
            @RequestParam(defaultValue = "b-1") String branchId) {
        requireBranchForTenant(branchId);
        List<POSSession> list = sessionRepository.findByBranchId(branchId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع جلسات البيع بنجاح"));
    }

    @PostMapping("/open")
    @PreAuthorize("@authz.has('sales.open_shift')")
    public ResponseEntity<ApiResponseWrapper<POSSession>> openSession(
            @Valid @RequestBody OpenPosSessionRequest request) {
        String branchId = request.getBranchId() != null ? request.getBranchId() : "b-1";
        requireBranchForTenant(branchId);
        String openedById = SecurityUtils.requireEmployeeId();
        BigDecimal openingBalance = request.getOpeningBalance() != null
                ? request.getOpeningBalance()
                : BigDecimal.ZERO;

        POSSession session = sessionService.startSession(branchId, openedById, openingBalance);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(session, "تم فتح الوردية بنجاح"));
    }

    @PostMapping("/{id}/close")
    @PreAuthorize("@authz.has('sales.close_shift')")
    public ResponseEntity<ApiResponseWrapper<POSSession>> closeSession(
            @PathVariable String id,
            @Valid @RequestBody ClosePosSessionRequest request) {
        String closedById = SecurityUtils.requireEmployeeId();

        POSSession session = sessionService.closeSession(
                id,
                request.getClosingBalance(),
                request.getExpectedBalance(),
                request.getPhysicalBalance(),
                closedById);
        return ResponseEntity.ok(ApiResponseWrapper.success(session, "تم إغلاق الوردية بنجاح"));
    }

    @GetMapping("/active")
    @PreAuthorize("@authz.has('sales.open_shift')")
    public ResponseEntity<ApiResponseWrapper<POSSession>> getActiveSession(
            @RequestParam(defaultValue = "b-1") String branchId) {
        requireBranchForTenant(branchId);
        POSSession session = sessionRepository.findByBranchIdAndStatus(branchId, "OPEN")
                .orElse(null);
        return ResponseEntity.ok(ApiResponseWrapper.success(session, "تم استرجاع الوردية النشطة"));
    }

    private void requireBranchForTenant(String branchId) {
        String tenantId = SecurityUtils.requireTenantId();
        branchRepository.findById(branchId)
                .filter(branch -> branch.getTenant() != null && tenantId.equals(branch.getTenant().getId()))
                .orElseThrow(() -> new BusinessRuleException("الفرع غير موجود"));
    }
}
