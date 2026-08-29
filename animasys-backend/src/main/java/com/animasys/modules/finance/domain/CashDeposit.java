package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Tenant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "cash_deposits")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CashDeposit {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "tenant"})
    private Branch branch;

    @Column(nullable = false)
    private String source; // OWNER_INJECTION, LOAN, FLOAT_TOPUP, OTHER

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private LocalDate date;

    private String description;

    @Column(name = "deposited_to", nullable = false)
    private String depositedTo; // CASH, BANK
}
