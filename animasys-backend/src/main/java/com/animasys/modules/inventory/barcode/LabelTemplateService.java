package com.animasys.modules.inventory.barcode;

import com.animasys.modules.inventory.domain.TemplateStyle;
import org.springframework.stereotype.Service;

@Service
public class LabelTemplateService {

    public LabelLayout getLayout(TemplateStyle style) {
        if (style == null) {
            style = TemplateStyle.PET_SHOP_SMALL;
        }
        return switch (style) {
            case PET_SHOP_MEDIUM -> LabelLayout.builder()
                    .style(TemplateStyle.PET_SHOP_MEDIUM)
                    .widthMm(50)
                    .heightMm(25)
                    .titleFontSize(8f)
                    .skuFontSize(6f)
                    .priceFontSize(10f)
                    .barcodeNumberFontSize(6f)
                    .showPriceLarge(false)
                    .showBorder(true)
                    .build();
            case SHELF_LABEL -> LabelLayout.builder()
                    .style(TemplateStyle.SHELF_LABEL)
                    .widthMm(60)
                    .heightMm(40)
                    .titleFontSize(11f)
                    .skuFontSize(8f)
                    .priceFontSize(14f)
                    .barcodeNumberFontSize(8f)
                    .showPriceLarge(true)
                    .showBorder(true)
                    .build();
            case PRICE_TAG -> LabelLayout.builder()
                    .style(TemplateStyle.PRICE_TAG)
                    .widthMm(40)
                    .heightMm(20)
                    .titleFontSize(6f)
                    .skuFontSize(5f)
                    .priceFontSize(12f)
                    .barcodeNumberFontSize(5f)
                    .showPriceLarge(true)
                    .showBorder(false)
                    .build();
            case WAREHOUSE_LABEL -> LabelLayout.builder()
                    .style(TemplateStyle.WAREHOUSE_LABEL)
                    .widthMm(100)
                    .heightMm(50)
                    .titleFontSize(14f)
                    .skuFontSize(12f)
                    .priceFontSize(10f)
                    .barcodeNumberFontSize(10f)
                    .showPriceLarge(false)
                    .showBorder(true)
                    .build();
            case PET_SHOP_SMALL -> LabelLayout.builder()
                    .style(TemplateStyle.PET_SHOP_SMALL)
                    .widthMm(40)
                    .heightMm(20)
                    .titleFontSize(7f)
                    .skuFontSize(5f)
                    .priceFontSize(8f)
                    .barcodeNumberFontSize(5f)
                    .showPriceLarge(false)
                    .showBorder(true)
                    .build();
            default -> LabelLayout.builder()
                    .style(TemplateStyle.PET_SHOP_SMALL)
                    .widthMm(40)
                    .heightMm(20)
                    .titleFontSize(7f)
                    .skuFontSize(5f)
                    .priceFontSize(8f)
                    .barcodeNumberFontSize(5f)
                    .showPriceLarge(false)
                    .showBorder(true)
                    .build();
        };
    }
}
