package com.animasys.modules.finance.domain;

import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "purchase_invoice_installments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseInvoiceInstallment {

    @Id
    private String id;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "items", "installments"})
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_invoice_id", nullable = false)
    private PurchaseInvoice purchaseInvoice;

    @Column(name = "installment_number", nullable = false)
    private int installmentNumber;

    /** Null means open-ended — payable any time, no forced due date. */
    @Column(name = "due_date")
    private String dueDate;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "paid_amount", nullable = false)
    @Builder.Default
    private BigDecimal paidAmount = BigDecimal.ZERO;

    /** PENDING, PARTIALLY_PAID, PAID */
    @Column(nullable = false)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(length = 500)
    private String notes;
}
