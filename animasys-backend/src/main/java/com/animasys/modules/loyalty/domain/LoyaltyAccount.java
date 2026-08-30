package com.animasys.modules.loyalty.domain;

import com.animasys.modules.crm.domain.Customer;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.domain.Persistable;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "loyalty_accounts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyAccount implements Persistable<String> {

    /** Same id as the owning customer — one account per customer. */
    @Id
    @Column(name = "customer_id")
    private String customerId;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "pets"})
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "customer_id")
    private Customer customer;

    /** Denormalized for tenant-scoped queries without joining through customer. */
    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(nullable = false)
    @Builder.Default
    private BigDecimal balance = BigDecimal.ZERO;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    // See LoyaltySettings for why Persistable + isNew is required for a manually-assigned @MapsId id.
    @Transient
    @Builder.Default
    @JsonIgnore
    private boolean isNew = true;

    @Override
    @JsonIgnore
    public String getId() {
        return customerId;
    }

    @Override
    @JsonIgnore
    public boolean isNew() {
        return isNew;
    }

    @PrePersist
    @PostLoad
    void markNotNew() {
        this.isNew = false;
    }
}
