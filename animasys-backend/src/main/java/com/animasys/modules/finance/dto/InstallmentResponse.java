package com.animasys.modules.finance.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InstallmentResponse {
    private String id;
    private String purchaseInvoiceId;
    private String invoiceNumber;
    private String supplierId;
    private String supplierName;
    private int installmentNumber;
    private String dueDate;
    private BigDecimal amount;
    private BigDecimal paidAmount;
    private BigDecimal remainingAmount;
    private String status;
    private String paidAt;
    private String notes;
    private int daysUntilDue;
    private boolean overdue;
    private boolean dueSoon;
}
