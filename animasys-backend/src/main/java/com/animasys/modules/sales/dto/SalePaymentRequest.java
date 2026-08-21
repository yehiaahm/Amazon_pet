package com.animasys.modules.sales.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class SalePaymentRequest {

    @NotBlank
    private String method;

    @NotNull
    @DecimalMin(value = "0.01")
    private BigDecimal amount;
}
