package com.animasys.modules.inventory.domain;

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

    @Column(name = "`row_number`", nullable = false)
    private int rowNumber;

    @Column(nullable = false)
    private String status;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "affected_entity_id")
    private String affectedEntityId;

    /** Quantity of stock added by this import row (used for safe undo). */
    @Column(name = "stock_delta", nullable = false)
    @Builder.Default
    private int stockDelta = 0;
}
