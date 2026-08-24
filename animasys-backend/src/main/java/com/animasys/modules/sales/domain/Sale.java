package com.animasys.modules.sales.domain;

import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sales")
@Data
@EqualsAndHashCode(of = "id")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Sale {
    @Id
    private String id;

    @Column(name = "sale_number", nullable = false, unique = true)
    private String saleNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pos_session_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "sales"})
    private POSSession posSession;

    @JsonProperty("posSessionId")
    public String getPosSessionId() { return posSession != null ? posSession.getId() : null; }

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private BigDecimal tax;

    @Column(nullable = false)
    private BigDecimal discount;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod; // CASH, CARD, MOBILE, INSTAPAY, VODAFONE_CASH

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Employee employee;

    @JsonProperty("employeeId")
    public String getEmployeeId() { return employee != null ? employee.getId() : null; }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "pets"})
    private Customer customer;

    @JsonProperty("customerId")
    public String getCustomerId() { return customer != null ? customer.getId() : null; }

    @Builder.Default
    private Instant date = Instant.now();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<SaleItem> items = new ArrayList<>();

    /** One row per tender: a single row for a normal sale, two rows for a split (e.g. cash + card) sale. */
    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<SalePayment> payments = new ArrayList<>();

    @Builder.Default
    @Column(nullable = true)
    private String status = "COMPLETED";

    @Builder.Default
    @Column(name = "is_delivery", nullable = false)
    private boolean delivery = false;

    @Builder.Default
    @Column(name = "delivery_fee", nullable = false)
    private BigDecimal deliveryFee = BigDecimal.ZERO;

    /** Loyalty balance credited from this sale (written post-commit once earning is computed). */
    @Builder.Default
    @Column(name = "loyalty_earned", nullable = false)
    private BigDecimal loyaltyEarned = BigDecimal.ZERO;

    /** Loyalty balance spent as payment on this sale. */
    @Builder.Default
    @Column(name = "loyalty_redeemed", nullable = false)
    private BigDecimal loyaltyRedeemed = BigDecimal.ZERO;

    /** Cumulative loyaltyEarned already clawed back by returns on this sale (so repeat partial returns don't double-reverse). */
    @Builder.Default
    @Column(name = "loyalty_earned_reversed", nullable = false)
    private BigDecimal loyaltyEarnedReversed = BigDecimal.ZERO;

    /** Cumulative loyaltyRedeemed already refunded back by returns on this sale. */
    @Builder.Default
    @Column(name = "loyalty_redeemed_reversed", nullable = false)
    private BigDecimal loyaltyRedeemedReversed = BigDecimal.ZERO;

    /**
     * PENDING (not yet attempted), POSTED (journals confirmed posted), or FAILED (posting was
     * attempted and threw -- see journalFailureReason). Set by JournalPostingExecutor, never by
     * request DTOs. Backs the reconciliation job that guarantees every completed sale ends up
     * with accounting entries even if the post-commit posting step failed the first time.
     */
    @Builder.Default
    @Column(name = "journal_status", nullable = false)
    private String journalStatus = "PENDING";

    @Column(name = "journal_failure_reason", length = 1000)
    private String journalFailureReason;
}
