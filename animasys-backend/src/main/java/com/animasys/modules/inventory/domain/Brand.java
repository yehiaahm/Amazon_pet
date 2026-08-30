package com.animasys.modules.inventory.domain;

import com.animasys.modules.iam.domain.Tenant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "brands",
        uniqueConstraints = @UniqueConstraint(name = "uk_brands_tenant_name", columnNames = {"tenant_id", "name"})
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Brand {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    /** Unique per tenant (see uk_brands_tenant_name), not globally. */
    @Column(nullable = false)
    private String name;
}
