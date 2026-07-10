package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Tenant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "journals")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Journal {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @Builder.Default
    private Instant timestamp = Instant.now();

    @Column(nullable = false)
    private String description;

    @Column(name = "total_debit", nullable = false)
    private BigDecimal totalDebit;

    @Column(name = "total_credit", nullable = false)
    private BigDecimal totalCredit;

    @OneToMany(mappedBy = "journal", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<JournalEntry> entries = new ArrayList<>();
}
