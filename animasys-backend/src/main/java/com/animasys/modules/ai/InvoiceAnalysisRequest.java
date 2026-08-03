package com.animasys.modules.ai;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class InvoiceAnalysisRequest {
    @NotBlank
    private String imageBase64;

    private String mimeType;
}
