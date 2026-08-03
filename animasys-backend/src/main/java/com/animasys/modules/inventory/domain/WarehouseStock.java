package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "warehouse_stocks",
        uniqueConstraints = @UniqueConstraint(name = "uk_warehouse_variant", columnNames = {"warehouse_id", "product_variant_id"})
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WarehouseStock {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @Column(nullable = false)
    @Builder.Default
    private int quantity = 0;
}
