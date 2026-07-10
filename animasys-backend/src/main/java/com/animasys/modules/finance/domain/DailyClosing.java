package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "daily_closings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailyClosing {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(name = "cashbox_id", nullable = false)
    private String cashboxId;

    @Column(name = "opening_balance", nullable = false)
    private BigDecimal openingBalance;

    @Column(name = "closing_balance", nullable = false)
    private BigDecimal closingBalance;

    @Column(name = "system_expected", nullable = false)
    private BigDecimal systemExpected;

    @Column(name = "physical_actual", nullable = false)
    private BigDecimal physicalActual;

    @Column(nullable = false)
    private BigDecimal difference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "closed_by_id", nullable = false)
    private Employee closedBy;

    @Column(nullable = false)
    private LocalDate date;
}
