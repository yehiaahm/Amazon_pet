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
public class SupplierPayableSummary {
    private String supplierId;
    private String supplierName;
    private BigDecimal totalDebt;
    private BigDecimal totalPaid;
    private BigDecimal remaining;
    private int overdueCount;
    private int dueSoonCount;
    private int openInvoiceCount;
    private List<InstallmentResponse> upcomingInstallments;
}
