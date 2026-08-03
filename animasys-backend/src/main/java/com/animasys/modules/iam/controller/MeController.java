package com.animasys.modules.iam.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.service.PermissionResolverService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/v1/me")
@RequiredArgsConstructor
public class MeController {

    private final PermissionResolverService permissionResolverService;

    @GetMapping("/permissions")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponseWrapper<List<String>>> myPermissions() {
        Employee employee = SecurityUtils.requireEmployee();
        List<String> permissions = new ArrayList<>(permissionResolverService.resolvePermissionCodes(employee));
        return ResponseEntity.ok(ApiResponseWrapper.success(permissions, "OK"));
    }
}
