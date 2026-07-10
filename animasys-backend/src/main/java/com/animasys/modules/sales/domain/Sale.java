package com.animasys.modules.sales.domain;

import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
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
@Table(name = "sales")
@Data
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
    private POSSession posSession;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private BigDecimal tax;

    @Column(nullable = false)
    private BigDecimal discount;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod; // CASH, CARD, MOBILE

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Builder.Default
    private Instant date = Instant.now();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SaleItem> items = new ArrayList<>();
}
