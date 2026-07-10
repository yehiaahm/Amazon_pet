package com.animasys.modules.auth;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.JwtTokenProvider;
import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.iam.domain.Employee;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;

    @PostMapping("/login")
    public ResponseEntity<ApiResponseWrapper<JwtResponse>> authenticateEmployee(@Valid @RequestBody LoginRequest loginRequest) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        loginRequest.getUsername(),
                        loginRequest.getPassword()
                )
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = tokenProvider.generateToken(authentication);

        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        Employee employee = userPrincipal.getEmployee();

        JwtResponse jwtResponse = JwtResponse.builder()
                .token(jwt)
                .username(employee.getUsername())
                .fullName(employee.getFullName())
                .role(employee.getRole())
                .tenantId(employee.getTenant().getId())
                .branchId(employee.getBranch().getId())
                .build();

        return ResponseEntity.ok(ApiResponseWrapper.success(jwtResponse, "Employee authenticated successfully"));
    }
}
