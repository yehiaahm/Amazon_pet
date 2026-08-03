package com.animasys.modules.sales.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class SaleLineRequest {

    private String type = "PRODUCT";

    @NotBlank
    private String itemId;

    private String name;

    @NotNull
    @Min(1)
    private Integer quantity;

    @NotNull
    private BigDecimal price;

    private BigDecimal listPrice;

    @NotNull
    private BigDecimal cost;
}
