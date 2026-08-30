package com.animasys.modules.inventory.barcode;

import com.animasys.modules.inventory.domain.TemplateStyle;
import lombok.Builder;
import lombok.Getter;
import java.math.BigDecimal;

@Getter
@Builder
public class LabelPrintData {
    private final String productName;
    private final String sku;
    private final BigDecimal price;
    private final String barcode;
    private final String formatName;
    private final TemplateStyle style;
    private final int quantity;
    private final boolean includeName;
    private final boolean includeSku;
    private final boolean includePrice;
    private final boolean includeBarcodeNumber;
}
