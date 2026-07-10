package com.animasys.modules.inventory.domain;

import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "stock_movements")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockMovement {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @Column(nullable = false)
    private int quantity; // Positive for additions, negative for reductions

    @Column(nullable = false)
    private String type; // SALE, PURCHASE, ADJUSTMENT, TRANSFER

    @Builder.Default
    private Instant timestamp = Instant.now();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;
}
