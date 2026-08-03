package com.animasys.modules.ai;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AskRequest {
    /** Ignored — tenant is taken from JWT. Kept optional for backward-compatible clients. */
    private String tenantId;

    @NotBlank
    private String query;

    /** Optional rich context assembled by the frontend from live ERP queries */
    private String clientContext;
}
