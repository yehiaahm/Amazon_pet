package com.animasys.modules.vaccination.repository;

import com.animasys.modules.vaccination.domain.AnimalReminder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AnimalReminderRepository extends JpaRepository<AnimalReminder, String> {

    @Query("SELECT r FROM AnimalReminder r JOIN FETCH r.pet p JOIN FETCH p.customer WHERE p.id = :petId")
    List<AnimalReminder> findByPetId(@Param("petId") String petId);

    @Query("SELECT r FROM AnimalReminder r JOIN FETCH r.pet p JOIN FETCH p.customer c WHERE c.tenant.id = :tenantId")
    List<AnimalReminder> findByPetCustomerTenantId(@Param("tenantId") String tenantId);

    @Query("SELECT r FROM AnimalReminder r JOIN FETCH r.pet p JOIN FETCH p.customer WHERE r.id = :id")
    Optional<AnimalReminder> findByIdWithPetAndCustomer(@Param("id") String id);
}
