package com.animasys.modules.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class FirstSetupRequest {

    @NotBlank(message = "اسم المحل مطلوب")
    @Size(min = 2, max = 100)
    private String shopName;

    @NotBlank(message = "الاسم الكامل مطلوب")
    @Size(min = 2, max = 100)
    private String ownerFullName;

    @NotBlank(message = "رمز الدخول السري مطلوب")
    @Size(min = 4, max = 4, message = "رمز الدخول السري يجب أن يكون 4 أرقام بالضبط")
    private String pin;
}
