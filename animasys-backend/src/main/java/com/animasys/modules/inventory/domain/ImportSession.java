package com.animasys.modules.inventory.domain;

import com.animasys.modules.iam.domain.Employee;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "import_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportSession {
    @Id
    private String id;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "file_hash", nullable = false, length = 64)
    private String fileHash;

    @Column(nullable = false)
    private String status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by", nullable = false)
    @JsonIgnore
    private Employee uploadedBy;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @Column(name = "duplicate_strategy", nullable = false)
    private String duplicateStrategy;

    @Column(name = "target_type", nullable = false)
    private String targetType;

    @Column(name = "total_rows")
    private int totalRows;

    @Column(name = "success_rows")
    private int successRows;

    @Column(name = "warning_rows")
    private int warningRows;

    @Column(name = "error_rows")
    private int errorRows;

    @Column(name = "last_processed_row")
    private int lastProcessedRow;

    @Column(name = "completed_at")
    private Instant completedAt;
}
