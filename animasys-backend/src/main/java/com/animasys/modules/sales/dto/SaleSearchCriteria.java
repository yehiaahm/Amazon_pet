package com.animasys.modules.sales.dto;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;

@Value
@Builder
public class SaleSearchCriteria {
    int page;
    int size;
    String sort;
    String search;
    Instant dateFrom;
    Instant dateTo;
    String customer;
    String employee;
    String status;
    String paymentMethod;

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 5000;
}
