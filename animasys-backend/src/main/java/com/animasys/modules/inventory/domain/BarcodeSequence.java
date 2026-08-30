package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "barcode_sequences")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BarcodeSequence {
    @Id
    @Column(name = "tenant_id")
    private String tenantId;

    @Column(name = "last_number", nullable = false)
    @Builder.Default
    private Long lastNumber = 1000000L;

    @Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;
}
