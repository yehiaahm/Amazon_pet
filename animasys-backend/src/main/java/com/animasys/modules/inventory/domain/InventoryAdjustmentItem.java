package com.animasys.modules.inventory.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(name = "inventory_adjustment_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryAdjustmentItem {

    @Id
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjustment_id", nullable = false)
    private InventoryAdjustment inventoryAdjustment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_batch_id")
    private InventoryBatch inventoryBatch;

    @Column(name = "system_quantity", nullable = false)
    private int systemQuantity;

    @Column(name = "counted_quantity", nullable = false)
    private int countedQuantity;

    @Column(name = "quantity_difference", nullable = false)
    private int quantityDifference;

    @Column(name = "unit_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "total_variance_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal totalVarianceCost;
}
