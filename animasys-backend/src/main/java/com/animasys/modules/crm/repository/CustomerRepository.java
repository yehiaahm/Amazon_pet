package com.animasys.modules.crm.repository;

import com.animasys.modules.crm.domain.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, String> {
    List<Customer> findByTenantId(String tenantId);
}
