package com.animasys.modules.sales.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ClosePosSessionRequest {

    @NotNull
    private BigDecimal closingBalance;

    private BigDecimal expectedBalance;

    @NotNull
    private BigDecimal physicalBalance;
}
