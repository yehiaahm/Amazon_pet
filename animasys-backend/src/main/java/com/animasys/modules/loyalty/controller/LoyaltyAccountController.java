package com.animasys.modules.loyalty.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.service.CustomerService;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.loyalty.domain.LoyaltyAccount;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerEntry;
import com.animasys.modules.loyalty.dto.ManualAdjustmentRequest;
import com.animasys.modules.loyalty.repository.LoyaltyLedgerEntryRepository;
import com.animasys.modules.loyalty.service.LoyaltyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/loyalty/customers")
@RequiredArgsConstructor
public class LoyaltyAccountController {

    private final LoyaltyService loyaltyService;
    private final CustomerService customerService;
    private final LoyaltyLedgerEntryRepository ledgerRepository;

    @GetMapping("/{customerId}")
    @PreAuthorize("@authz.has('customers.view')")
    public ResponseEntity<ApiResponseWrapper<LoyaltyAccount>> getAccount(@PathVariable String customerId) {
        String tenantId = SecurityUtils.requireTenantId();
        Customer customer = customerService.getById(tenantId, customerId);
        LoyaltyAccount account = loyaltyService.getAccount(customer);
        return ResponseEntity.ok(ApiResponseWrapper.success(account, "تم استرجاع رصيد الولاء"));
    }

    @GetMapping("/{customerId}/ledger")
    @PreAuthorize("@authz.has('customers.view')")
    public ResponseEntity<ApiResponseWrapper<Page<LoyaltyLedgerEntry>>> getLedger(
            @PathVariable String customerId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        String tenantId = SecurityUtils.requireTenantId();
        // Validates the customer belongs to this tenant before exposing their ledger.
        customerService.getById(tenantId, customerId);
        Page<LoyaltyLedgerEntry> ledger = ledgerRepository.findByCustomer_IdOrderByCreatedAtDesc(
                customerId, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return ResponseEntity.ok(ApiResponseWrapper.success(ledger, "تم استرجاع سجل حركات الولاء"));
    }

    @PostMapping("/{customerId}/adjust")
    @PreAuthorize("@authz.has('customers.manage_loyalty')")
    public ResponseEntity<ApiResponseWrapper<LoyaltyLedgerEntry>> adjust(
            @PathVariable String customerId,
            @Valid @RequestBody ManualAdjustmentRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Customer customer = customerService.getById(tenantId, customerId);
        Employee actor = SecurityUtils.requireEmployee();
        LoyaltyLedgerEntry entry = loyaltyService.manualAdjustment(
                tenantId, customer, request.getAmount(), request.getReason(), actor);
        return ResponseEntity.ok(ApiResponseWrapper.success(entry, "تم تعديل رصيد الولاء"));
    }
}
