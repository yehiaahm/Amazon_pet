package com.animasys.modules.iam.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.domain.Permission;
import com.animasys.modules.iam.domain.Role;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.dto.*;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.PermissionRepository;
import com.animasys.modules.iam.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional(readOnly = true)
    public List<RoleSummaryDto> listRoles(String tenantId) {
        return roleRepository.findByTenantIdWithPermissions(tenantId).stream()
                .map(role -> toSummary(role, tenantId))
                .toList();
    }

    @Transactional(readOnly = true)
    public RoleDetailDto getRole(String tenantId, String roleId) {
        Role role = roleRepository.findByIdWithPermissions(tenantId, roleId)
                .orElseThrow(() -> new BusinessRuleException("Role not found"));
        return toDetail(role, tenantId);
    }

    @Transactional(readOnly = true)
    public List<PermissionModuleDto> listPermissionsGrouped() {
        List<Permission> all = permissionRepository.findAllByOrderByModuleAscNameAsc();
        Map<String, List<Permission>> byModule = all.stream()
                .collect(Collectors.groupingBy(Permission::getModule, LinkedHashMap::new, Collectors.toList()));

        return byModule.entrySet().stream()
                .map(entry -> PermissionModuleDto.builder()
                        .module(entry.getKey())
                        .permissions(entry.getValue().stream().map(this::toPermissionDto).toList())
                        .build())
                .toList();
    }

    @Transactional
    public RoleDetailDto createRole(String tenantId, Tenant tenant, RoleCreateRequest request) {
        if (request.getCode() == null || request.getCode().isBlank()) {
            throw new BusinessRuleException("Role code is required");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new BusinessRuleException("Role name is required");
        }
        String code = request.getCode().trim().toUpperCase();
        if (roleRepository.existsByTenantIdAndCode(tenantId, code)) {
            throw new BusinessRuleException("Role code already exists");
        }
        if (isReservedSystemCode(code)) {
            throw new BusinessRuleException("Cannot create role with reserved system code: " + code);
        }

        Role role = Role.builder()
                .id("role-" + tenantId + "-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .code(code)
                .name(request.getName().trim())
                .description(request.getDescription())
                .systemRole(false)
                .permissions(new HashSet<>())
                .build();

        Role saved = roleRepository.save(role);
        return toDetail(saved, tenantId);
    }

    @Transactional
    public RoleDetailDto updateRole(String tenantId, String roleId, RoleUpdateRequest request) {
        Role role = requireTenantRole(tenantId, roleId);
        if (request.getName() != null && !request.getName().isBlank()) {
            role.setName(request.getName().trim());
        }
        if (request.getDescription() != null) {
            role.setDescription(request.getDescription().trim());
        }
        return toDetail(roleRepository.save(role), tenantId);
    }

    @Transactional
    public RoleDetailDto updateRolePermissions(String tenantId, String roleId, RolePermissionsUpdateRequest request) {
        Role role = roleRepository.findByIdWithPermissions(tenantId, roleId)
                .orElseThrow(() -> new BusinessRuleException("Role not found"));

        List<String> codes = request.getPermissionCodes() != null ? request.getPermissionCodes() : List.of();
        Set<Permission> permissions = new HashSet<>();
        for (String code : codes) {
            Permission permission = permissionRepository.findByCode(code.trim())
                    .orElseThrow(() -> new BusinessRuleException("Unknown permission: " + code));
            permissions.add(permission);
        }
        if (role.getPermissions() == null) {
            role.setPermissions(new HashSet<>());
        } else {
            role.getPermissions().clear();
        }
        role.getPermissions().addAll(permissions);
        Role saved = roleRepository.saveAndFlush(role);
        return toDetail(saved, tenantId);
    }

    @Transactional
    public void deleteRole(String tenantId, String roleId) {
        Role role = requireTenantRole(tenantId, roleId);
        if (role.isSystemRole()) {
            throw new BusinessRuleException("System roles cannot be deleted");
        }
        long employees = employeeRepository.countByTenantIdAndRole(tenantId, role.getCode());
        if (employees > 0) {
            throw new BusinessRuleException("Cannot delete role assigned to " + employees + " employee(s)");
        }
        roleRepository.delete(role);
    }

    private Role requireTenantRole(String tenantId, String roleId) {
        return roleRepository.findById(roleId)
                .filter(r -> r.getTenant() != null && tenantId.equals(r.getTenant().getId()))
                .orElseThrow(() -> new BusinessRuleException("Role not found"));
    }

    private RoleSummaryDto toSummary(Role role, String tenantId) {
        int permCount = role.getPermissions() != null ? role.getPermissions().size() : 0;
        return RoleSummaryDto.builder()
                .id(role.getId())
                .code(role.getCode())
                .name(role.getName())
                .description(role.getDescription())
                .systemRole(role.isSystemRole())
                .employeeCount(employeeRepository.countByTenantIdAndRole(tenantId, role.getCode()))
                .permissionCount(permCount)
                .build();
    }

    private RoleDetailDto toDetail(Role role, String tenantId) {
        List<String> codes = role.getPermissions() != null
                ? role.getPermissions().stream().map(Permission::getCode).sorted().toList()
                : List.of();
        return RoleDetailDto.builder()
                .id(role.getId())
                .code(role.getCode())
                .name(role.getName())
                .description(role.getDescription())
                .systemRole(role.isSystemRole())
                .employeeCount(employeeRepository.countByTenantIdAndRole(tenantId, role.getCode()))
                .permissionCodes(codes)
                .build();
    }

    private PermissionDto toPermissionDto(Permission p) {
        return PermissionDto.builder()
                .id(p.getId())
                .code(p.getCode())
                .name(p.getName())
                .module(p.getModule())
                .description(p.getDescription())
                .build();
    }

    private boolean isReservedSystemCode(String code) {
        return Set.of("OWNER", "MANAGER", "CASHIER", "GROOMER").contains(code);
    }
}
