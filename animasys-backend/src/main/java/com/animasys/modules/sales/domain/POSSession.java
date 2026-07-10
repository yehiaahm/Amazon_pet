package com.animasys.modules.sales.domain;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "pos_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class POSSession {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opened_by_id", nullable = false)
    private Employee openedBy;

    @Column(name = "opened_at", updatable = false)
    @Builder.Default
    private Instant openedAt = Instant.now();

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "opening_balance", nullable = false)
    private BigDecimal openingBalance;

    @Column(name = "closing_balance")
    private BigDecimal closingBalance;

    @Column(nullable = false)
    @Builder.Default
    private String status = "OPEN"; // OPEN, CLOSED
}
