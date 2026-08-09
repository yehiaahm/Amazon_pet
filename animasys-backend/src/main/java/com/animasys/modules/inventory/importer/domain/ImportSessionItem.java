package com.animasys.modules.inventory.importer.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "import_session_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSessionItem {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ImportSession session;

    @Column(name = "row_number", nullable = false)
    private int rowNumber;

    @Column(name = "raw_data", nullable = false, columnDefinition = "TEXT")
    private String rawData;

    @Column(name = "mapped_data", columnDefinition = "TEXT")
    private String mappedData;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ImportRowStatus status = ImportRowStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "duplicate_match_type")
    private DuplicateMatchType duplicateMatchType;

    @Column(name = "duplicate_product_id")
    private String duplicateProductId;

    @Enumerated(EnumType.STRING)
    private DuplicateResolution resolution;

    @Column(name = "validation_errors", columnDefinition = "TEXT")
    private String validationErrors;

    @Column(columnDefinition = "TEXT")
    private String warnings;

    @Column(name = "result_message")
    private String resultMessage;
}
