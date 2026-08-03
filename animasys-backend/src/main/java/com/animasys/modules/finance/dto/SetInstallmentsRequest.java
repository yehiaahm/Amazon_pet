package com.animasys.modules.finance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SetInstallmentsRequest {
    /** LUMP_SUM or INSTALLMENTS */
    private String paymentType;
    private List<InstallmentRequest> installments;
}
