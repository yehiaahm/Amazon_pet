package com.animasys.modules.inventory.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseInvoiceLineReceiptWarning {
    private int lineIndex;
    private String purchaseInvoiceItemId;
    private String sku;
    private String productName;
    private String code;
    private String messageAr;
}
