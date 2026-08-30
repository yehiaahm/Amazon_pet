package com.animasys.modules.vaccination.repository;

import com.animasys.modules.vaccination.domain.AnimalFollowUpSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AnimalFollowUpSettingsRepository extends JpaRepository<AnimalFollowUpSettings, String> {
}
