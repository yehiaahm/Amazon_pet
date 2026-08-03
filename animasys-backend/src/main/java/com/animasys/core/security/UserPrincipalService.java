package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.service.PermissionResolverService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserPrincipalService implements UserDetailsService {
    private final EmployeeRepository employeeRepository;
    private final PermissionResolverService permissionResolverService;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Employee employee = employeeRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Employee username not found: " + username));
        List<String> permissions = new ArrayList<>(permissionResolverService.resolvePermissionCodes(employee));
        return new UserPrincipal(employee, permissions);
    }
}
