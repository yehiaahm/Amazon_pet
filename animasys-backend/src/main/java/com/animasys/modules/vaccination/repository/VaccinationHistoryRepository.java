package com.animasys.modules.vaccination.repository;

import com.animasys.modules.vaccination.domain.VaccinationHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VaccinationHistoryRepository extends JpaRepository<VaccinationHistory, String> {

    List<VaccinationHistory> findByVaccinationRecordIdOrderByAdministeredDateDesc(String vaccinationRecordId);
}
