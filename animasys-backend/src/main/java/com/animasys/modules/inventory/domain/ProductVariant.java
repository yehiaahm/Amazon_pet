package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(
        name = "product_variants",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_product_variants_product", columnNames = "product_id"),
                @UniqueConstraint(name = "uk_product_variants_tenant_sku", columnNames = {"tenant_id", "sku"}),
                @UniqueConstraint(name = "uk_product_variants_tenant_barcode", columnNames = {"tenant_id", "barcode"})
        }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductVariant {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(nullable = false, length = 50)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private BigDecimal price;

    /** Optional bulk/wholesale selling price. */
    @Column(name = "wholesale_price")
    private BigDecimal wholesalePrice;

    @Column(nullable = false)
    private BigDecimal cost;

    @Column(name = "stock_quantity", nullable = false)
    @Builder.Default
    private int stockQuantity = 0;

    @Column(name = "barcode")
    private String barcode;

    @Enumerated(EnumType.STRING)
    @Column(name = "barcode_format")
    private BarcodeFormat barcodeFormat;

    @Column(name = "barcode_generated")
    @Builder.Default
    private Boolean barcodeGenerated = false;

    @Column(name = "barcode_generated_at")
    private java.time.Instant barcodeGeneratedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "generated_by_employee_id")
    private com.animasys.modules.iam.domain.Employee generatedByEmployee;

    @Enumerated(EnumType.STRING)
    @Column(name = "barcode_source")
    private BarcodeSource barcodeSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "barcode_status")
    @Builder.Default
    private BarcodeStatus barcodeStatus = BarcodeStatus.ACTIVE;
}
