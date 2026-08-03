package com.animasys.modules.inventory.domain;

import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Entity
@Table(name = "purchase_invoices")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseInvoice {
    @Id
    private String id;

    @Column(name = "invoice_number", nullable = false)
    private String invoiceNumber;

    @Column(name = "invoice_date", nullable = false)
    private String invoiceDate;

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    @Column(name = "supplier_name", nullable = false)
    private String supplierName;

    @Column(name = "currency", nullable = false)
    private String currency;

    @Column(name = "vat")
    private BigDecimal vat;

    @Column(name = "discount")
    private BigDecimal discount;

    @Column(name = "shipping")
    private BigDecimal shipping;

    @Column(name = "net_total", nullable = false)
    private BigDecimal netTotal;

    @Column(name = "grand_total", nullable = false)
    private BigDecimal grandTotal;

    @Column(name = "uploaded_at")
    private Instant uploadedAt;

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by", nullable = false)
    private Employee uploadedBy;

    @Lob
    @Column(name = "image_url", columnDefinition = "LONGTEXT")
    private String imageUrl;

    @Column(name = "status", nullable = false)
    private String status; // DRAFT, COMPLETED

    @Column(name = "due_date")
    private String dueDate;

    @Column(name = "payment_status", nullable = false)
    private String paymentStatus; // UNPAID, PARTIALLY_PAID, PAID

    @Column(name = "paid_amount")
    private BigDecimal paidAmount;

    @Column(name = "fingerprint", nullable = false, unique = true)
    private String fingerprint;

    @Lob
    @Column(name = "raw_ocr_json", columnDefinition = "LONGTEXT")
    private String rawOcrJson;

    /** LUMP_SUM or INSTALLMENTS */
    @Column(name = "payment_type", nullable = false)
    @Builder.Default
    private String paymentType = "LUMP_SUM";

    @OneToMany(mappedBy = "purchaseInvoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PurchaseInvoiceItem> items;

    @OneToMany(mappedBy = "purchaseInvoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<com.animasys.modules.finance.domain.PurchaseInvoiceInstallment> installments;
}
