package com.animasys.modules.loyalty.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.loyalty.dto.LoyaltyDashboardResponse;
import com.animasys.modules.loyalty.service.LoyaltyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/loyalty/dashboard")
@RequiredArgsConstructor
public class LoyaltyDashboardController {

    private final LoyaltyService loyaltyService;

    @GetMapping
    @PreAuthorize("@authz.has('customers.manage_loyalty')")
    public ResponseEntity<ApiResponseWrapper<LoyaltyDashboardResponse>> getDashboard() {
        String tenantId = SecurityUtils.requireTenantId();
        LoyaltyDashboardResponse dashboard = loyaltyService.buildDashboard(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(dashboard, "تم استرجاع لوحة تحكم الولاء"));
    }
}
