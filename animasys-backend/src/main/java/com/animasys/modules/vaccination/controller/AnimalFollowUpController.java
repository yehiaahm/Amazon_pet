package com.animasys.modules.vaccination.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.vaccination.domain.AnimalFollowUpSettings;
import com.animasys.modules.vaccination.dto.AnimalFollowUpDashboard;
import com.animasys.modules.vaccination.service.AnimalFollowUpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/animal-follow-up")
@RequiredArgsConstructor
public class AnimalFollowUpController {

    private final AnimalFollowUpService followUpService;

    @GetMapping("/dashboard")
    @PreAuthorize("@authz.has('vaccinations.view')")
    public ResponseEntity<ApiResponseWrapper<AnimalFollowUpDashboard>> getDashboard() {
        String tenantId = SecurityUtils.requireTenantId();
        AnimalFollowUpDashboard dashboard = followUpService.getDashboard(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(dashboard, "تم استرجاع لوحة متابعة الحيوانات"));
    }

    @GetMapping("/settings")
    @PreAuthorize("@authz.has('vaccinations.view')")
    public ResponseEntity<ApiResponseWrapper<AnimalFollowUpSettings>> getSettings() {
        String tenantId = SecurityUtils.requireTenantId();
        AnimalFollowUpSettings settings = followUpService.getSettings(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم استرجاع إعدادات التنبيه"));
    }

    @PutMapping("/settings")
    @PreAuthorize("@authz.has('vaccinations.manage')")
    public ResponseEntity<ApiResponseWrapper<AnimalFollowUpSettings>> updateSettings(
            @RequestBody Map<String, Integer> body) {
        String tenantId = SecurityUtils.requireTenantId();
        int days = body.getOrDefault("dueSoonThresholdDays", 30);
        AnimalFollowUpSettings settings = followUpService.updateSettings(tenantId, days);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم تحديث إعدادات التنبيه"));
    }
}
