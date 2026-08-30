package com.animasys.modules.inventory.dto;

import com.animasys.modules.inventory.domain.TemplateStyle;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class QrLabelRequest {
    @NotBlank(message = "variantId must not be blank")
    private String variantId;

    @Min(value = 1, message = "quantity must be at least 1")
    @Max(value = 200, message = "quantity must not exceed 200")
    private int quantity = 1;

    private TemplateStyle style;
}
