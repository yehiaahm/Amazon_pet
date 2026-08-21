package com.animasys.modules.loyalty.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ManualAdjustmentRequest {
    /** Signed: positive credits the customer, negative debits them. */
    @NotNull
    private BigDecimal amount;

    @NotBlank
    private String reason;
}
