package com.animasys.modules.inventory.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseReturnLineRequest {
    private String purchaseInvoiceItemId;
    private Integer quantity;
}
