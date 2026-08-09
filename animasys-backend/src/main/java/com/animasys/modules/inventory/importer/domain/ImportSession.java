package com.animasys.modules.inventory.importer.domain;

import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "import_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSession {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by", nullable = false)
    private Employee uploadedBy;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "file_type", nullable = false)
    private String fileType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ImportSessionStatus status;

    @Column(name = "column_headers", columnDefinition = "TEXT")
    private String columnHeaders;

    @Column(name = "column_mapping", columnDefinition = "TEXT")
    private String columnMapping;

    @Column(name = "duplicate_strategy_default", nullable = false)
    @Builder.Default
    private String duplicateStrategyDefault = "UPDATE_EXISTING";

    @Column(name = "total_rows", nullable = false)
    @Builder.Default
    private int totalRows = 0;

    @Column(name = "new_rows", nullable = false)
    @Builder.Default
    private int newRows = 0;

    @Column(name = "update_rows", nullable = false)
    @Builder.Default
    private int updateRows = 0;

    @Column(name = "duplicate_rows", nullable = false)
    @Builder.Default
    private int duplicateRows = 0;

    @Column(name = "error_rows", nullable = false)
    @Builder.Default
    private int errorRows = 0;

    @Column(name = "imported_count", nullable = false)
    @Builder.Default
    private int importedCount = 0;

    @Column(name = "updated_count", nullable = false)
    @Builder.Default
    private int updatedCount = 0;

    @Column(name = "skipped_count", nullable = false)
    @Builder.Default
    private int skippedCount = 0;

    @Column(name = "failed_count", nullable = false)
    @Builder.Default
    private int failedCount = 0;

    @Column(name = "execution_time_ms")
    private Long executionTimeMs;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
