package com.animasys.modules.inventory.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class PurchaseReturnRequest {

    /** Empty/null = return every still-returnable unit on every item (full return). */
    private List<PurchaseReturnLineRequest> lines;

    /**
     * Used only for invoices with no line items (lump-sum invoices entered as a total
     * value with no product breakdown). Null/empty on such an invoice returns the full
     * remaining balance.
     */
    private BigDecimal amount;

    private String reason;
}
