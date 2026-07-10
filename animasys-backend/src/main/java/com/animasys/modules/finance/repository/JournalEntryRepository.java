package com.animasys.modules.finance.repository;

import com.animasys.modules.finance.domain.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, String> {
}
