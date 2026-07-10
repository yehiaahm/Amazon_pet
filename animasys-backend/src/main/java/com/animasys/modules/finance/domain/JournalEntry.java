package com.animasys.modules.finance.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "journal_entries")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JournalEntry {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_id", nullable = false)
    private Journal journal;

    @Column(name = "account_code", nullable = false)
    private String accountCode; // e.g. 'CASH_DRAWER', 'SALES_REVENUE'

    @Column(nullable = false)
    private String type; // DEBIT, CREDIT

    @Column(nullable = false)
    private BigDecimal amount;
}
