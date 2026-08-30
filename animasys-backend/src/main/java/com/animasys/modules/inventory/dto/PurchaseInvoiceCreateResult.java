package com.animasys.modules.inventory.dto;

import com.animasys.modules.inventory.domain.PurchaseInvoice;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseInvoiceCreateResult {
    private PurchaseInvoice invoice;

    @Builder.Default
    private List<PurchaseInvoiceLineReceiptWarning> stockReceiptWarnings = new ArrayList<>();
}
