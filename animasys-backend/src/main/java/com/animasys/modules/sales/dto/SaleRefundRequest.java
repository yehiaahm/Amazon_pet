package com.animasys.modules.sales.dto;

import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

@Data
public class SaleRefundRequest {

    @Valid
    private List<SaleRefundLineRequest> lines;

    private String managerUsername;
    private String managerPassword;
}
