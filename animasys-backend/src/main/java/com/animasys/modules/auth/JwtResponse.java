package com.animasys.modules.auth;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JwtResponse {
    private String token;
    @Builder.Default
    private String type = "Bearer";
    private String username;
    private String fullName;
    private String role;
    private String tenantId;
    private String branchId;
}
