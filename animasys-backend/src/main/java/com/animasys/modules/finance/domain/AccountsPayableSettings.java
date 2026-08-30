package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Tenant;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "accounts_payable_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountsPayableSettings implements Persistable<String> {

    @Id
    @Column(name = "tenant_id")
    private String tenantId;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "tenant_id")
    private Tenant tenant;

    @Column(name = "reminder_days_before_due", nullable = false)
    @Builder.Default
    private int reminderDaysBeforeDue = 7;

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
