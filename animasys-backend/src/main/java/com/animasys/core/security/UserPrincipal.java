package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import java.util.Collection;
import java.util.Collections;

@AllArgsConstructor
@Getter
public class UserPrincipal implements UserDetails {
    private final Employee employee;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + employee.getRole()));
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
