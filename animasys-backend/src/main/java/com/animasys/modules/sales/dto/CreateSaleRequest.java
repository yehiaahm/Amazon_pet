package com.animasys.modules.sales.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CreateSaleRequest {

    @NotBlank
    private String posSessionId;

    private String customerId;

    @NotNull
    private BigDecimal totalAmount;

    @NotNull
    private BigDecimal tax;

    @NotNull
    private BigDecimal discount;

    @NotBlank
    private String paymentMethod;

    @NotEmpty
    @Valid
    private List<SaleLineRequest> items;

    private String managerUsername;
    private String managerPassword;
}
