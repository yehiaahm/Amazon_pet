package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "inventory_ledger_transactions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryLedgerTransaction {

    public enum TransactionType {
        PURCHASE_RECEIPT,
        OPENING_ADJUSTMENT,
        SALE_DEDUCTION,
        CUSTOMER_RETURN,
        SUPPLIER_RETURN,
        SHRINKAGE_ADJUSTMENT,
        EXPIRED_WRITE_OFF,
        TRANSFER_OUT,
        TRANSFER_IN
    }

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "warehouse_id", nullable = false)
    private String warehouseId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_batch_id")
    private InventoryBatch inventoryBatch;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false)
    private TransactionType transactionType;

    @Column(name = "reference_type", nullable = false)
    private String referenceType;

    @Column(name = "reference_id", nullable = false)
    private String referenceId;

    @Column(name = "quantity_change", nullable = false)
    private int quantityChange;

    @Column(name = "unit_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "total_cost", nullable = false, precision = 15, scale = 4)
    private BigDecimal totalCost;

    @Column(name = "employee_id")
    private String employeeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
