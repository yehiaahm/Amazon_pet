package com.animasys.modules.iam.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.dto.*;
import com.animasys.modules.iam.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    @PreAuthorize("@authz.has('roles.view')")
    public ResponseEntity<ApiResponseWrapper<List<RoleSummaryDto>>> listRoles() {
        String tenantId = SecurityUtils.requireTenantId();
        return ResponseEntity.ok(ApiResponseWrapper.success(
                roleService.listRoles(tenantId), "Roles retrieved successfully"));
    }

    @GetMapping("/permissions")
    @PreAuthorize("@authz.has('roles.view')")
    public ResponseEntity<ApiResponseWrapper<List<PermissionModuleDto>>> listPermissions() {
        return ResponseEntity.ok(ApiResponseWrapper.success(
                roleService.listPermissionsGrouped(), "Permissions retrieved successfully"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('roles.view')")
    public ResponseEntity<ApiResponseWrapper<RoleDetailDto>> getRole(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        return ResponseEntity.ok(ApiResponseWrapper.success(
                roleService.getRole(tenantId, id), "Role retrieved successfully"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('roles.create')")
    public ResponseEntity<ApiResponseWrapper<RoleDetailDto>> createRole(@RequestBody RoleCreateRequest request) {
        Employee current = SecurityUtils.requireEmployee();
        Tenant tenant = current.getTenant();
        RoleDetailDto created = roleService.createRole(tenant.getId(), tenant, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "Role created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('roles.edit')")
    public ResponseEntity<ApiResponseWrapper<RoleDetailDto>> updateRole(
            @PathVariable String id,
            @RequestBody RoleUpdateRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        return ResponseEntity.ok(ApiResponseWrapper.success(
                roleService.updateRole(tenantId, id, request), "Role updated successfully"));
    }

    @PutMapping("/{id}/permissions")
    @PreAuthorize("@authz.has('roles.assign_permissions')")
    public ResponseEntity<ApiResponseWrapper<RoleDetailDto>> updateRolePermissions(
            @PathVariable String id,
            @RequestBody RolePermissionsUpdateRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        return ResponseEntity.ok(ApiResponseWrapper.success(
                roleService.updateRolePermissions(tenantId, id, request), "Role permissions updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('roles.delete')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteRole(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        roleService.deleteRole(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Role deleted successfully"));
    }
}
