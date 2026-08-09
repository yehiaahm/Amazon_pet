package com.animasys.modules.sales.domain;

import com.animasys.modules.inventory.domain.InventoryBatch;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "sale_item_batch_allocations")
@Data
@EqualsAndHashCode(of = "id")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleItemBatchAllocation {

    @Id
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_item_id", nullable = false)
    private SaleItem saleItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_batch_id", nullable = false)
    private InventoryBatch inventoryBatch;

    @Column(name = "quantity_allocated", nullable = false)
    private int quantityAllocated;

    @Column(name = "unit_cost_at_sale", nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCostAtSale;

    @Column(name = "total_allocated_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal totalAllocatedCost;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
