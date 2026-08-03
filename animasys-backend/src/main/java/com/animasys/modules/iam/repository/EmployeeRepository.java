package com.animasys.modules.iam.repository;

import com.animasys.modules.iam.domain.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.List;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, String> {

    @Query("SELECT e FROM Employee e JOIN FETCH e.tenant JOIN FETCH e.branch WHERE e.username = :username")
    Optional<Employee> findByUsername(@Param("username") String username);

    Optional<Employee> findByEmail(String email);

    @Query("SELECT e FROM Employee e JOIN FETCH e.tenant LEFT JOIN FETCH e.branch WHERE e.id = :id")
    Optional<Employee> findByIdWithTenant(@Param("id") String id);

    @Query("SELECT e FROM Employee e JOIN FETCH e.tenant JOIN FETCH e.branch WHERE e.tenant.id = :tenantId")
    List<Employee> findByTenantId(@Param("tenantId") String tenantId);

    long countByTenantIdAndRole(String tenantId, String role);
}
