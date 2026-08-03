package com.animasys.modules.finance.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.finance.domain.DailyClosing;
import com.animasys.modules.finance.service.DailyClosingService;
import com.animasys.modules.iam.repository.BranchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/daily-closings")
@RequiredArgsConstructor
public class DailyClosingController {

    private final DailyClosingService dailyClosingService;
    private final BranchRepository branchRepository;

    @GetMapping
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<List<DailyClosing>>> getDailyClosings(
            @RequestParam(defaultValue = "b-1") String branchId) {
        String tenantId = SecurityUtils.requireTenantId();
        branchRepository.findById(branchId)
                .filter(branch -> branch.getTenant() != null && tenantId.equals(branch.getTenant().getId()))
                .orElseThrow(() -> new BusinessRuleException("الفرع غير موجود"));
        List<DailyClosing> list = dailyClosingService.getByBranch(branchId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة إغلاقات الصندوق بنجاح"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<DailyClosing>> createDailyClosing(
            @RequestParam(defaultValue = "b-1") String branchId,
            @RequestParam(required = false) String closedById,
            @RequestBody DailyClosing dto) {
        String tenantId = SecurityUtils.requireTenantId();
        branchRepository.findById(branchId)
                .filter(branch -> branch.getTenant() != null && tenantId.equals(branch.getTenant().getId()))
                .orElseThrow(() -> new BusinessRuleException("الفرع غير موجود"));
        DailyClosing created = dailyClosingService.createDailyClosing(branchId, SecurityUtils.requireEmployeeId(), dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل إغلاق الصندوق بنجاح"));
    }
}
