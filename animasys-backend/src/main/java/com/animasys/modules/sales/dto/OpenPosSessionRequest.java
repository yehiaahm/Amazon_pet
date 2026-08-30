package com.animasys.modules.sales.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class OpenPosSessionRequest {

    private String branchId = "b-1";

    private BigDecimal openingBalance = BigDecimal.ZERO;
}
