package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

@Getter
public class UserPrincipal implements UserDetails {
    private final Employee employee;
    private final Collection<? extends GrantedAuthority> authorities;
    private final List<String> permissionCodes;

    public UserPrincipal(Employee employee, Collection<String> permissionCodes) {
        this.employee = employee;
        this.permissionCodes = permissionCodes != null
                ? List.copyOf(permissionCodes)
                : Collections.emptyList();
        this.authorities = buildAuthorities(employee, this.permissionCodes);
    }

    /** Backward-compatible constructor — no RBAC permissions loaded. */
    public UserPrincipal(Employee employee) {
        this(employee, Collections.emptyList());
    }

    private static Collection<? extends GrantedAuthority> buildAuthorities(
            Employee employee,
            List<String> permissionCodes) {
        List<GrantedAuthority> result = new ArrayList<>();
        if (employee.getRole() != null && !employee.getRole().isBlank()) {
            result.add(new SimpleGrantedAuthority("ROLE_" + employee.getRole().trim().toUpperCase()));
        }
        for (String code : permissionCodes) {
            result.add(new SimpleGrantedAuthority(PermissionAuthority.toAuthority(code)));
        }
        return result;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return employee.getPasswordHash();
    }

    @Override
    public String getUsername() {
        return employee.getUsername();
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return employee.isActive();
    }
}
