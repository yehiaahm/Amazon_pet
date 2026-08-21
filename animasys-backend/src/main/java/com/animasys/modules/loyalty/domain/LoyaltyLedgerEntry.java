package com.animasys.modules.loyalty.domain;

import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.sales.domain.Sale;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One row per balance change. Every LoyaltyAccount.balance mutation must be accompanied
 * by exactly one of these, written via LoyaltyService#applyLedgerEntry.
 */
@Entity
@Table(name = "loyalty_ledger_entries")
@Data
@EqualsAndHashCode(of = "id")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyLedgerEntry {

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    @JsonIgnore
    private Customer customer;

    @JsonProperty("customerId")
    public String getCustomerId() { return customer != null ? customer.getId() : null; }

    /** Null for MANUAL_ADJUSTMENT and account-level EXPIRED entries. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id")
    @JsonIgnore
    private Sale sale;

    @JsonProperty("saleId")
    public String getSaleId() { return sale != null ? sale.getId() : null; }

    @JsonProperty("saleNumber")
    public String getSaleNumber() { return sale != null ? sale.getSaleNumber() : null; }

    /** Who performed the action (cashier at checkout, manager for manual adjustment). Null for system-run expiry. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    @JsonIgnore
    private Employee employee;

    @JsonProperty("employeeId")
    public String getEmployeeId() { return employee != null ? employee.getId() : null; }

    @JsonProperty("employeeName")
    public String getEmployeeName() { return employee != null ? employee.getFullName() : null; }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LoyaltyLedgerType type;

    /** Signed: positive credits the balance, negative debits it. */
    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "balance_before", nullable = false)
    private BigDecimal balanceBefore;

    @Column(name = "balance_after", nullable = false)
    private BigDecimal balanceAfter;

    /** Reason text — required for MANUAL_ADJUSTMENT, optional elsewhere (e.g. balance-went-negative notes). */
    @Column(columnDefinition = "TEXT")
    private String note;

    /** Links a RETURN_REVERSAL back to the EARNED/USED entry it reverses. */
    @Column(name = "related_entry_id")
    private String relatedEntryId;

    /** FIFO-consumption tracker, only meaningful on EARNED rows (expiry bookkeeping). */
    @Column(name = "remaining_amount")
    private BigDecimal remainingAmount;

    /** Only set on EARNED rows when expiration is enabled. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
