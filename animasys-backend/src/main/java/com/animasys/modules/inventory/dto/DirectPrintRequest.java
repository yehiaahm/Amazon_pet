package com.animasys.modules.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import java.util.List;

@Data
public class DirectPrintRequest {

    /** Exact or partial name of the OS printer to send to. */
    @NotBlank(message = "printerName is required")
    private String printerName;

    /** Items to print */
    @NotEmpty(message = "items must not be empty")
    private List<BulkPrintRequestItem> items;

    /** Label template style (optional, uses tenant default if null) */
    private String style;
}
