package com.animasys.modules.inventory.domain;

import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "variant_barcode_history")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BarcodeHistory {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_variant_id", nullable = false)
    private ProductVariant productVariant;

    @Column(name = "old_barcode")
    private String oldBarcode;

    @Column(name = "new_barcode", nullable = false)
    private String newBarcode;

    @Enumerated(EnumType.STRING)
    @Column(name = "barcode_format", nullable = false)
    private BarcodeFormat barcodeFormat;

    @Enumerated(EnumType.STRING)
    @Column(name = "barcode_source", nullable = false)
    private BarcodeSource barcodeSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_state", nullable = false)
    @Builder.Default
    private BarcodeStatus statusState = BarcodeStatus.ACTIVE;

    @Column(name = "reason")
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "generated_by_employee_id", nullable = false)
    private Employee generatedByEmployee;

    @Column(name = "generated_at", nullable = false)
    @Builder.Default
    private Instant generatedAt = Instant.now();
}
