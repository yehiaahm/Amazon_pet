package com.animasys.modules.iam.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.service.PermissionResolverService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/v1/me")
@RequiredArgsConstructor
public class MeController {

    private final PermissionResolverService permissionResolverService;
    private final EmployeeRepository employeeRepository;

    @GetMapping("/permissions")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponseWrapper<List<String>>> myPermissions() {
        Employee employee = SecurityUtils.requireEmployee();
        List<String> permissions = new ArrayList<>(permissionResolverService.resolvePermissionCodes(employee));
        return ResponseEntity.ok(ApiResponseWrapper.success(permissions, "OK"));
    }

    /**
     * Server-side logout: bumps the employee's revocation counter, so every token already
     * issued for them stops being accepted (see Employee.tokenVersion).
     *
     * Until this existed, logging out only removed the token from the browser's localStorage.
     * The token itself stayed valid for the remainder of its 24-hour lifetime, so a copy
     * lifted from that machine — or from the shared till in a shop where staff hand the
     * terminal around — kept working long after the shift ended.
     *
     * It lives under /v1/me rather than /auth because everything under /auth is permitAll and
     * skips JwtAuthenticationFilter, so there would be no authenticated employee to revoke.
     */
    @PostMapping("/logout")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponseWrapper<Void>> logout() {
        String employeeId = SecurityUtils.requireEmployeeId();
        employeeRepository.findById(employeeId).ifPresent(employee -> {
            employee.setTokenVersion(employee.getTokenVersion() + 1);
            employeeRepository.save(employee);
        });
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم تسجيل الخروج"));
    }
}
