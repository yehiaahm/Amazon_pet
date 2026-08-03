package com.animasys.modules.finance.domain;

import com.animasys.modules.iam.domain.Tenant;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "accounts_payable_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountsPayableSettings {

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
}
