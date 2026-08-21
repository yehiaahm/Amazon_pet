package com.animasys.modules.inventory.dto;

import com.animasys.modules.inventory.domain.PurchaseInvoice;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseReturnResult {
    private PurchaseInvoice invoice;
    private BigDecimal returnedAmount;
    /** Money the supplier now owes back — the invoice balance couldn't absorb the whole return. */
    private BigDecimal excessCredit;
    private boolean fullReturn;

    @Builder.Default
    private List<PurchaseReturnLineRequest> linesProcessed = new ArrayList<>();
}
