package com.animasys.modules.sales.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleSummaryDTO {
    private String id;
    private String saleNumber;
    private String posSessionId;
    private BigDecimal totalAmount;
    private BigDecimal tax;
    private BigDecimal discount;
    private String paymentMethod;
    private String employeeId;
    private String employeeFullName;
    private String customerId;
    private String customerName;
    private Instant date;
    private String status;
}
