package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "purchase_invoice_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseInvoiceItem {
    @Id
    private String id;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_invoice_id", nullable = false)
    private PurchaseInvoice purchaseInvoice;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "sku")
    private String sku;

    @Column(name = "cost", nullable = false)
    private BigDecimal cost;

    @Column(name = "price", nullable = false)
    private BigDecimal price;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Column(name = "confidence_name")
    private BigDecimal confidenceName;

    @Column(name = "confidence_qty")
    private BigDecimal confidenceQty;

    @Column(name = "confidence_cost")
    private BigDecimal confidenceCost;

    @Column(name = "confidence_price")
    private BigDecimal confidencePrice;

    @Column(name = "barcode")
    private String barcode;

    @Column(name = "lot_number")
    private String lotNumber;

    @Column(name = "unit_name")
    private String unitName;

    @Column(name = "conversion_factor")
    private Integer conversionFactor;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "quantity_returned")
    @Builder.Default
    private Integer quantityReturned = 0;
}
