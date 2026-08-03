package com.animasys.core.audit;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/v1/audit-logs")
@RequiredArgsConstructor
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    @GetMapping
    @PreAuthorize("@authz.has('settings.view')")
    public ResponseEntity<ApiResponseWrapper<List<AuditLog>>> getAllAuditLogs() {
        String tenantId = SecurityUtils.requireTenantId();
        List<AuditLog> list = auditLogRepository.findByTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "Audit logs retrieved successfully"));
    }
}
