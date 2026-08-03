package com.animasys.modules.analytics.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.analytics.bre.BusinessRulesEngine;
import com.animasys.modules.analytics.kpi.KPIEngine;
import com.animasys.modules.analytics.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final KPIEngine kpiEngine;
    private final DashboardService dashboardService;
    private final BusinessRulesEngine businessRulesEngine;

    @GetMapping("/kpis")
    @PreAuthorize("@authz.has('dashboard.financial_kpis')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> getKpis() {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> metrics = kpiEngine.calculateKPIMetrics(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(metrics, "تم استرجاع مؤشرات الأداء بنجاح"));
    }

    @GetMapping("/dashboard")
    @PreAuthorize("@authz.has('dashboard.view')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> getDashboard() {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> metrics = dashboardService.buildDashboardMetrics(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(metrics, "تم استرجاع بيانات لوحة التحكم بنجاح"));
    }

    @GetMapping("/alerts")
    @PreAuthorize("@authz.has('dashboard.alerts')")
    public ResponseEntity<ApiResponseWrapper<List<Map<String, Object>>>> getAlerts() {
        List<Map<String, Object>> alerts = businessRulesEngine.evaluateBusinessRules();
        return ResponseEntity.ok(ApiResponseWrapper.success(alerts, "تم استرجاع التنبيهات بنجاح"));
    }
}
