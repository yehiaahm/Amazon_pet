package com.animasys.modules.crm.repository;

import com.animasys.modules.crm.domain.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, String> {

    List<Customer> findByTenantId(String tenantId);

    Page<Customer> findByTenantId(String tenantId, Pageable pageable);

    Optional<Customer> findByIdAndTenantId(String id, String tenantId);

    Optional<Customer> findByPhoneAndTenantId(String phone, String tenantId);

    Page<Customer> findByTenantIdAndNameContainingIgnoreCaseOrTenantIdAndPhoneContaining(
            String tenantId1, String name, String tenantId2, String phone, Pageable pageable);

    @Query("""
            SELECT c FROM Customer c
            WHERE c.tenant.id = :tenantId
              AND (
                LOWER(c.name) LIKE LOWER(CONCAT('%', :query, '%'))
                OR c.phone LIKE CONCAT('%', :query, '%')
                OR LOWER(c.email) LIKE LOWER(CONCAT('%', :query, '%'))
              )
            ORDER BY c.name ASC
            """)
    List<Customer> searchByTenantId(@Param("tenantId") String tenantId, @Param("query") String query);
}
