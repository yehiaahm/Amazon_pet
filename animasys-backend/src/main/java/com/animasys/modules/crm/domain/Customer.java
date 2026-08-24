package com.animasys.modules.crm.domain;

import com.animasys.modules.iam.domain.Tenant;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "customers")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Customer {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    @JsonIgnore
    private Tenant tenant;

    @Column(nullable = false)
    private String name;

    private String phone;
    private String email;

    /**
     * Kept in sync with {@link #phone} (normalized, null when blank) by CustomerService on every
     * write. Backs the DB-level {@code uk_customers_tenant_phone_dedupe} unique constraint added
     * in V49 — {@code phone} itself isn't the unique column so historical duplicate rows from
     * before that migration can keep their original phone value untouched. Never set directly by
     * callers/JSON.
     */
    @Column(name = "phone_dedupe_key")
    @JsonIgnore
    private String phoneDedupeKey;

    /** When true, customer is banned from purchasing. */
    @Column(name = "is_banned", nullable = false)
    @Builder.Default
    @JsonProperty("isBanned")
    private Boolean isBanned = false;

    /** Promotional discount percent (0–100) applied at POS when this customer is selected. */
    @Column(nullable = false)
    @Builder.Default
    private Integer discount = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    /**
     * Internal staff notes about this customer (e.g. payment behaviour, preferences).
     * Shown to the cashier at POS when this customer is selected.
     */
    @Column(columnDefinition = "TEXT")
    private String notes;
}
