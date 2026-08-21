package com.animasys.modules.loyalty.domain;

import com.animasys.modules.iam.domain.Tenant;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "loyalty_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltySettings implements Persistable<String> {

    @Id
    @Column(name = "tenant_id")
    private String tenantId;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "tenant_id")
    private Tenant tenant;

    /** Master ON/OFF switch for the whole loyalty feature. */
    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = false;

    /** Open = eligible invoices earn loyalty normally. Closed = no new earning, but redeeming an existing balance still works. */
    @Column(name = "program_open", nullable = false)
    @Builder.Default
    private boolean programOpen = true;

    @Column(name = "earn_rate_percent", nullable = false)
    @Builder.Default
    private BigDecimal earnRatePercent = new BigDecimal("2.00");

    /** Max % of the pre-loyalty invoice total redeemable in one sale. Null = no percent cap. */
    @Column(name = "max_usage_percent")
    private BigDecimal maxUsagePercent;

    /** Max absolute amount redeemable in one sale. Null = no absolute cap. */
    @Column(name = "max_usage_amount")
    private BigDecimal maxUsageAmount;

    @ElementCollection
    @CollectionTable(name = "loyalty_eligible_categories", joinColumns = @JoinColumn(name = "tenant_id"))
    @Column(name = "category_id")
    @Builder.Default
    private Set<String> eligibleCategoryIds = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "loyalty_excluded_categories", joinColumns = @JoinColumn(name = "tenant_id"))
    @Column(name = "category_id")
    @Builder.Default
    private Set<String> excludedCategoryIds = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "loyalty_eligible_products", joinColumns = @JoinColumn(name = "tenant_id"))
    @Column(name = "product_id")
    @Builder.Default
    private Set<String> eligibleProductIds = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "loyalty_excluded_products", joinColumns = @JoinColumn(name = "tenant_id"))
    @Column(name = "product_id")
    @Builder.Default
    private Set<String> excludedProductIds = new HashSet<>();

    @Column(name = "expiration_enabled", nullable = false)
    @Builder.Default
    private boolean expirationEnabled = false;

    /** Months after earning before a lot expires. Only meaningful when expirationEnabled. */
    @Column(name = "expiration_months")
    private Integer expirationMonths;

    // The @Id above is assigned manually (mirrors tenantId, not @GeneratedValue), so
    // Spring Data's default isNew() check (id == null) always sees a non-null id and
    // calls merge() even for a brand-new row. merge() on a transient @MapsId entity
    // trips a Hibernate assertion ("null identifier") because the mapped tenant
    // association isn't resolvable yet. Persistable.isNew() lets save() call
    // persist() for genuinely new settings and merge() only after they're loaded.
    @Transient
    @Builder.Default
    @JsonIgnore
    private boolean isNew = true;

    @Override
    @JsonIgnore
    public String getId() {
        return tenantId;
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
