package com.animasys.modules.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PinLoginRequest {
    @NotBlank
    @Size(min = 4, max = 8)
    private String pin;

    /** Optional — when omitted, desktop installs resolve tenant via subdomain {@code main}. */
    private String tenantId;
}
