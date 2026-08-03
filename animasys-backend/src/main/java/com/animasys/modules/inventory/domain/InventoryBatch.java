package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "inventory_batches")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryBatch {

    public enum BatchStatus {
        ACTIVE,
        EXHAUSTED,
        EXPIRED,
        QUARANTINED
    }

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_invoice_id")
    private PurchaseInvoice purchaseInvoice;

    @Column(name = "batch_number", nullable = false)
    private String batchNumber;

    @Column(name = "unit_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "initial_quantity", nullable = false)
    private int initialQuantity;

    @Column(name = "remaining_quantity", nullable = false)
    private int remainingQuantity;

    @Column(name = "purchase_date", nullable = false)
    private Instant purchaseDate;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private BatchStatus status;

    @Version
    private Integer version;

    public void deductQuantity(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Deduction quantity must be positive");
        }
        if (amount > this.remainingQuantity) {
            throw new IllegalStateException("Cannot deduct " + amount + " from batch " + batchNumber + " with remaining " + remainingQuantity);
        }
        this.remainingQuantity -= amount;
        if (this.remainingQuantity == 0) {
            this.status = BatchStatus.EXHAUSTED;
        }
    }

    public void restoreQuantity(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Restoration quantity must be positive");
        }
        if (this.remainingQuantity + amount > this.initialQuantity) {
            throw new IllegalStateException(
                    "Cannot restore " + amount + " to batch " + batchNumber + "; would exceed initial quantity " + initialQuantity);
        }
        this.remainingQuantity += amount;
        if (this.remainingQuantity > 0 && this.status == BatchStatus.EXHAUSTED) {
            this.status = BatchStatus.ACTIVE;
        }
    }
}
