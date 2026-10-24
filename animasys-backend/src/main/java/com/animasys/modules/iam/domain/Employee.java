package com.animasys.modules.iam.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "employees")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Employee {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    private Branch branch;

    @Column(nullable = false, unique = true)
    private String username;

    @JsonIgnore
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String role; // OWNER, MANAGER, CASHIER, GROOMER

    @Builder.Default
    private boolean active = true;

    /**
     * Revocation counter for already-issued JWTs. Each token carries the value that was
     * current when it was minted; {@code JwtAuthenticationFilter} refuses any token whose
     * value no longer matches, so incrementing this invalidates every token outstanding for
     * this employee. Bumped on logout and on any PIN change, which is what makes those
     * operations actually end live sessions instead of only clearing the browser's copy.
     *
     * Not serialised — internal, and it would change the employee JSON the SPA consumes.
     */
    @JsonIgnore
    @Column(name = "token_version", nullable = false)
    @Builder.Default
    private int tokenVersion = 0;
}
