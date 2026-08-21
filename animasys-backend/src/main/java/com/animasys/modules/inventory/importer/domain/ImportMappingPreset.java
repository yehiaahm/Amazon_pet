package com.animasys.modules.inventory.importer.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A saved header -> {@link ImportField} mapping the user can reapply on a future upload
 * instead of re-picking columns every time, as long as the sheet's headers still match.
 */
@Entity
@Table(name = "import_mapping_presets")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportMappingPreset {

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "import_mode", nullable = false)
    @Builder.Default
    private ImportMode importMode = ImportMode.ADD_STOCK;

    /** JSON object: raw header text -> ImportField wire code. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String mapping;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
