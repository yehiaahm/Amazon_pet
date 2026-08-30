package com.animasys.modules.vaccination.domain;

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
@Table(name = "animal_follow_up_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimalFollowUpSettings implements Persistable<String> {

    @Id
    @Column(name = "tenant_id")
    private String tenantId;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "tenant_id")
    private Tenant tenant;

    @Column(name = "due_soon_threshold_days", nullable = false)
    @Builder.Default
    private int dueSoonThresholdDays = 30;

    // Same Persistable/isNew workaround as AccountsPayableSettings — the manually
    // assigned @Id means Spring Data's default isNew() always sees a non-null id
    // and calls merge() even for a brand-new row, which trips a Hibernate assertion
    // on a transient @MapsId association.
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
