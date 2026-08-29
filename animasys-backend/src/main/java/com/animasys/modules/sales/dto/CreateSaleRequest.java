package com.animasys.modules.sales.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CreateSaleRequest {

    @NotBlank
    private String posSessionId;

    private String customerId;

    @NotNull
    private BigDecimal totalAmount;

    @NotNull
    private BigDecimal tax;

    @NotNull
    private BigDecimal discount;

    /** Single-tender payment method. Ignored when {@link #payments} carries a split (2-tender) payment. */
    private String paymentMethod;

    /** Optional split payment (exactly 2 tenders, e.g. cash + card). Null/empty ⇒ use {@link #paymentMethod}. */
    @Valid
    private List<SalePaymentRequest> payments;

    @NotEmpty
    @Valid
    private List<SaleLineRequest> items;

    private String managerUsername;
    private String managerPassword;

    private boolean delivery;
    private BigDecimal deliveryFee;
    private String deliveryAddress;

    /** Amount of the customer's loyalty balance the cashier asked to redeem on this sale. Clamped server-side. */
    private BigDecimal loyaltyRedeem;
}
