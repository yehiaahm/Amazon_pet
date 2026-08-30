package com.animasys.modules.iam.repository;

import com.animasys.modules.iam.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, String> {

    List<Role> findByTenantIdOrderByNameAsc(String tenantId);

    @Query("SELECT DISTINCT r FROM Role r LEFT JOIN FETCH r.permissions WHERE r.tenant.id = :tenantId AND UPPER(r.code) = UPPER(:code)")
    Optional<Role> findByTenantIdAndCode(@Param("tenantId") String tenantId, @Param("code") String code);

    @Query("SELECT DISTINCT r FROM Role r LEFT JOIN FETCH r.permissions WHERE r.tenant.id = :tenantId AND r.id = :roleId")
    Optional<Role> findByIdWithPermissions(@Param("tenantId") String tenantId, @Param("roleId") String roleId);

    @Query("SELECT DISTINCT r FROM Role r LEFT JOIN FETCH r.permissions WHERE r.tenant.id = :tenantId ORDER BY r.name")
    List<Role> findByTenantIdWithPermissions(@Param("tenantId") String tenantId);

    long countByTenantId(String tenantId);

    boolean existsByTenantIdAndCode(String tenantId, String code);
}
