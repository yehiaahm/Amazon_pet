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
public class InstallmentRequest {
    private int installmentNumber;
    private String dueDate;
    private BigDecimal amount;
    private String notes;
}
