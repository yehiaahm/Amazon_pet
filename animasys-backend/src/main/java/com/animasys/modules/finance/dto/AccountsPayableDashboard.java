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
public class AccountsPayableDashboard {
    private BigDecimal totalOutstanding;
    private BigDecimal totalPaid;
    private BigDecimal totalRemaining;
    private int overdueCount;
    private int dueSoonCount;
    private int openInstallmentCount;
    private int reminderDaysBeforeDue;
    private List<InstallmentResponse> priorityQueue;
    private List<InstallmentResponse> alerts;
    private List<SupplierPayableSummary> supplierSummaries;
}
