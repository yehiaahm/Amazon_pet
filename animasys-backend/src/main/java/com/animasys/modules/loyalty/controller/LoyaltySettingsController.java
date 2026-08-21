package com.animasys.modules.loyalty.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.loyalty.domain.LoyaltySettings;
import com.animasys.modules.loyalty.dto.UpdateLoyaltySettingsRequest;
import com.animasys.modules.loyalty.service.LoyaltySettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/loyalty/settings")
@RequiredArgsConstructor
public class LoyaltySettingsController {

    private final LoyaltySettingsService settingsService;

    @GetMapping
    @PreAuthorize("@authz.has('customers.view')")
    public ResponseEntity<ApiResponseWrapper<LoyaltySettings>> getSettings() {
        String tenantId = SecurityUtils.requireTenantId();
        return ResponseEntity.ok(ApiResponseWrapper.success(settingsService.getSettings(tenantId), "تم استرجاع إعدادات الولاء"));
    }

    @PutMapping
    @PreAuthorize("@authz.has('customers.manage_loyalty')")
    public ResponseEntity<ApiResponseWrapper<LoyaltySettings>> updateSettings(@RequestBody UpdateLoyaltySettingsRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        LoyaltySettings settings = settingsService.updateSettings(tenantId, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم تحديث إعدادات الولاء"));
    }

    @PutMapping("/status")
    @PreAuthorize("@authz.has('customers.manage_loyalty')")
    public ResponseEntity<ApiResponseWrapper<LoyaltySettings>> updateStatus(@RequestBody Map<String, Boolean> body) {
        String tenantId = SecurityUtils.requireTenantId();
        boolean open = Boolean.TRUE.equals(body.get("open"));
        LoyaltySettings settings = settingsService.setProgramOpen(tenantId, open);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, open ? "تم فتح برنامج الولاء" : "تم إغلاق برنامج الولاء"));
    }
}
