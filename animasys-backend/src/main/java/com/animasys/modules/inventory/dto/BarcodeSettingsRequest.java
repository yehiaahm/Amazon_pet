package com.animasys.modules.inventory.dto;

import com.animasys.modules.inventory.domain.BarcodeFormat;
import com.animasys.modules.inventory.domain.TemplateStyle;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class BarcodeSettingsRequest {
    private boolean autoGenerateBarcode = true;

    @NotNull(message = "defaultBarcodeFormat must not be null")
    private BarcodeFormat defaultBarcodeFormat = BarcodeFormat.CODE_128;

    private String defaultLabelSize = "50x25";

    private boolean includePrice = true;
    private boolean includeName = true;
    private boolean includeSku = true;

    @NotNull(message = "defaultTemplateStyle must not be null")
    private TemplateStyle defaultTemplateStyle = TemplateStyle.PET_SHOP_SMALL;
}
