package com.animasys.modules.auth;

import com.animasys.core.security.PinPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class PinLoginRequest {
    @NotBlank
    @Pattern(regexp = PinPolicy.PIN_REGEX, message = "رمز الدخول السري يجب أن يتكون من 4 أرقام بالضبط")
    private String pin;

    /** Optional — when omitted, desktop installs resolve tenant via subdomain {@code main}. */
    private String tenantId;
}
