package com.animasys.modules.crm.repository;

import com.animasys.modules.crm.domain.Pet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface PetRepository extends JpaRepository<Pet, String> {
    List<Pet> findByCustomerId(String customerId);
}
