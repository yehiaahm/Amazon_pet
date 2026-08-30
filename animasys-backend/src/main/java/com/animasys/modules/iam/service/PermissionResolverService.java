package com.animasys.modules.iam.service;

import com.animasys.core.security.PermissionAuthority;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Permission;
import com.animasys.modules.iam.domain.Role;
import com.animasys.modules.iam.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PermissionResolverService {

    private final RoleRepository roleRepository;

    @Transactional(readOnly = true)
    public Set<String> resolvePermissionCodes(Employee employee) {
        if (employee == null || employee.getRole() == null || employee.getTenant() == null) {
            return Collections.emptySet();
        }
        String tenantId = employee.getTenant().getId();
        String roleCode = employee.getRole().trim().toUpperCase();

        return roleRepository.findByTenantIdAndCode(tenantId, roleCode)
                .map(role -> role.getPermissions().stream()
                        .map(Permission::getCode)
                        .collect(Collectors.toCollection(LinkedHashSet::new)))
                .orElseGet(LinkedHashSet::new);
    }

    @Transactional(readOnly = true)
    public List<String> resolvePermissionAuthorities(Employee employee) {
        return resolvePermissionCodes(employee).stream()
                .map(PermissionAuthority::toAuthority)
                .toList();
    }

    @Transactional(readOnly = true)
    public Role resolveRole(Employee employee) {
        if (employee == null || employee.getRole() == null || employee.getTenant() == null) {
            return null;
        }
        return roleRepository.findByTenantIdAndCode(
                employee.getTenant().getId(),
                employee.getRole().trim().toUpperCase()
        ).orElse(null);
    }
}
