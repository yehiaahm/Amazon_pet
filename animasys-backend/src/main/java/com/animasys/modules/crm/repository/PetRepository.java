package com.animasys.modules.crm.repository;

import com.animasys.modules.crm.domain.Pet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

@Repository
public interface PetRepository extends JpaRepository<Pet, String> {

    @Query("SELECT p FROM Pet p WHERE p.customer.id = :customerId")
    List<Pet> findByCustomerId(@Param("customerId") String customerId);

    @Query("SELECT p FROM Pet p JOIN FETCH p.customer c WHERE c.tenant.id = :tenantId")
    List<Pet> findByCustomerTenantId(@Param("tenantId") String tenantId);

    @Query("SELECT p FROM Pet p JOIN FETCH p.customer WHERE p.id = :id")
    java.util.Optional<Pet> findByIdWithCustomer(@Param("id") String id);
}
