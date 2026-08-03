package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "inventory_adjustments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryAdjustment {

    public enum AdjustmentReason {
        SHRINKAGE,
        DAMAGED,
        EXPIRED,
        COUNT_DISCREPANCY,
        FOUND
    }

    public enum AdjustmentStatus {
        PENDING,
        APPROVED,
        REJECTED
    }

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "warehouse_id", nullable = false)
    private String warehouseId;

    @Column(name = "adjustment_number", nullable = false, unique = true)
    private String adjustmentNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false)
    private AdjustmentReason reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private AdjustmentStatus status;

    @Column(name = "requested_by_id", nullable = false)
    private String requestedById;

    @Column(name = "approved_by_id")
    private String approvedById;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Builder.Default
    @OneToMany(mappedBy = "inventoryAdjustment", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InventoryAdjustmentItem> items = new ArrayList<>();
}
