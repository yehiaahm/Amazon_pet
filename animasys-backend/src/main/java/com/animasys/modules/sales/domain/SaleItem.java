package com.animasys.modules.sales.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sale_items")
@Data
@EqualsAndHashCode(of = "id")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleItem {
    @Id
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @Column(nullable = false)
    private String type; // PRODUCT, SERVICE

    @Column(name = "item_id", nullable = false)
    private String itemId; // ProductVariant ID or Service ID

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private BigDecimal price;

    /** Catalog / list price at time of sale — never mutated by POS override. */
    @Column(name = "list_price", nullable = false)
    private BigDecimal listPrice;

    /** Per-line discount percent applied at the POS; null when the line had none. */
    @Column(name = "discount_percent", precision = 5, scale = 2)
    private BigDecimal discountPercent;

    /** Unit price before the per-line discount; {@link #price} is the net unit price actually charged. */
    @Column(name = "price_before_discount", precision = 10, scale = 2)
    private BigDecimal priceBeforeDiscount;

    @Column(nullable = false)
    private BigDecimal cost; // Reference cost at purchase line generation

    @Builder.Default
    @Column(name = "cogs", nullable = false, precision = 15, scale = 4)
    private BigDecimal cogs = BigDecimal.ZERO; // Permanent snapshotted total COGS from FIFO allocations

    @Builder.Default
    @Column(name = "gross_profit", nullable = false, precision = 15, scale = 4)
    private BigDecimal grossProfit = BigDecimal.ZERO; // Permanent snapshotted gross profit (Revenue - COGS)

    @Builder.Default
    @Column(name = "unit_cogs", nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCogs = BigDecimal.ZERO; // Weighted average unit COGS for this line item

    @Builder.Default
    @Column(name = "quantity_returned", nullable = false)
    private int quantityReturned = 0;

    @Builder.Default
    @OneToMany(mappedBy = "saleItem", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SaleItemBatchAllocation> allocations = new ArrayList<>();
}
