package com.animasys.modules.finance.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.finance.domain.CashDeposit;
import com.animasys.modules.finance.service.CashDepositService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/v1/cash-deposits")
@RequiredArgsConstructor
public class CashDepositController {

    private final CashDepositService cashDepositService;

    @GetMapping
    @PreAuthorize("@authz.has('finance.view_deposits')")
    public ResponseEntity<ApiResponseWrapper<List<CashDeposit>>> getDeposits(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = SecurityUtils.requireTenantId();
        List<CashDeposit> list;
        if (from != null && to != null) {
            list = cashDepositService.getByTenantAndDateRange(tenantId, from, to);
        } else {
            list = cashDepositService.getAllByTenant(tenantId);
        }
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة الإيداعات النقدية بنجاح"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('finance.add_deposit')")
    public ResponseEntity<ApiResponseWrapper<CashDeposit>> createDeposit(@RequestBody CashDeposit dto) {
        String tenantId = SecurityUtils.requireTenantId();
        String branchId = SecurityUtils.requireBranchId();
        CashDeposit created = cashDepositService.createDeposit(tenantId, branchId, dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل الإيداع النقدي بنجاح"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('finance.view_deposits')")
    public ResponseEntity<ApiResponseWrapper<CashDeposit>> getDepositById(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        CashDeposit deposit = cashDepositService.getById(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(deposit, "تم استرجاع تفاصيل الإيداع"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('finance.delete_deposit')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteDeposit(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        cashDepositService.deleteDeposit(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الإيداع النقدي بنجاح"));
    }
}
