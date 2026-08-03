package com.animasys.modules.sales.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalePageResponse {
    private List<SaleSummaryDTO> content;
    private long totalElements;
    private int totalPages;
    private int page;
    private int size;
    private String sort;
}
