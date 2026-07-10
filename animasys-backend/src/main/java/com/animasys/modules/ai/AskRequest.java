package com.animasys.modules.ai;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AskRequest {
    @NotBlank
    private String tenantId;

    @NotBlank
    private String query;
}
