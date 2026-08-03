package com.animasys.modules.inventory.barcode;

import com.animasys.modules.inventory.domain.TemplateStyle;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class LabelLayout {
    private final TemplateStyle style;
    private final float widthMm;
    private final float heightMm;
    private final float titleFontSize;
    private final float skuFontSize;
    private final float priceFontSize;
    private final float barcodeNumberFontSize;
    private final boolean showPriceLarge;
    private final boolean showBorder;
}
