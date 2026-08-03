package com.animasys.modules.finance.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.finance.domain.AccountsPayableSettings;
import com.animasys.modules.finance.dto.*;
import com.animasys.modules.finance.service.AccountsPayableService;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/accounts-payable")
@RequiredArgsConstructor
public class AccountsPayableController {

    private final AccountsPayableService accountsPayableService;

    @GetMapping("/dashboard")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<AccountsPayableDashboard>> getDashboard() {
        String tenantId = SecurityUtils.requireTenantId();
        AccountsPayableDashboard dashboard = accountsPayableService.getDashboard(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(dashboard, "تم استرجاع لوحة حسابات الموردين"));
    }

    @GetMapping("/invoices/{invoiceId}/installments")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<List<InstallmentResponse>>> getInstallments(@PathVariable String invoiceId) {
        String tenantId = SecurityUtils.requireTenantId();
        List<InstallmentResponse> list = accountsPayableService.getInstallmentsForInvoice(tenantId, invoiceId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع دفعات الفاتورة"));
    }

    @PutMapping("/invoices/{invoiceId}/installments")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<PurchaseInvoice>> setInstallments(
            @PathVariable String invoiceId,
            @RequestBody SetInstallmentsRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        PurchaseInvoice updated = accountsPayableService.setInstallments(tenantId, invoiceId, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث جدول الدفعات"));
    }

    @PutMapping("/installments/{installmentId}/pay")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<InstallmentResponse>> payInstallment(
            @PathVariable String installmentId,
            @RequestBody PayInstallmentRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        InstallmentResponse result = accountsPayableService.payInstallment(tenantId, installmentId, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم تسجيل سداد الدفعة"));
    }

    @GetMapping("/settings")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<AccountsPayableSettings>> getSettings() {
        String tenantId = SecurityUtils.requireTenantId();
        AccountsPayableSettings settings = accountsPayableService.getSettings(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم استرجاع إعدادات التنبيه"));
    }

    @PutMapping("/settings")
    @PreAuthorize("@authz.has('finance.view_reports')")
    public ResponseEntity<ApiResponseWrapper<AccountsPayableSettings>> updateSettings(
            @RequestBody Map<String, Integer> body) {
        String tenantId = SecurityUtils.requireTenantId();
        int days = body.getOrDefault("reminderDaysBeforeDue", 7);
        AccountsPayableSettings settings = accountsPayableService.updateSettings(tenantId, days);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم تحديث إعدادات التنبيه"));
    }
}
