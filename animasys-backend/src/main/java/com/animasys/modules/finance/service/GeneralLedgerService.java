package com.animasys.modules.finance.service;

import com.animasys.modules.finance.domain.*;
import com.animasys.modules.finance.repository.*;
import com.animasys.modules.iam.domain.Tenant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class GeneralLedgerService {
    private final JournalRepository journalRepository;
    private final JournalEntryRepository entryRepository;

    public Journal postJournalEntry(Tenant tenant, String description, Map<String, BigDecimal> debits, Map<String, BigDecimal> credits) {
        BigDecimal totalDebit = debits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCredit = credits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        // Verify balance equality
        if (totalDebit.compareTo(totalCredit) != 0) {
            throw new IllegalArgumentException("Debits ($" + totalDebit + ") must equal Credits ($" + totalCredit + ") to balance the ledger!");
        }

        Journal journal = Journal.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .description(description)
                .timestamp(Instant.now())
                .totalDebit(totalDebit)
                .totalCredit(totalCredit)
                .build();

        journal = journalRepository.save(journal);
        List<JournalEntry> entries = new ArrayList<>();

        for (Map.Entry<String, BigDecimal> e : debits.entrySet()) {
            JournalEntry entry = JournalEntry.builder()
                    .id(UUID.randomUUID().toString())
                    .journal(journal)
                    .accountCode(e.getKey())
                    .type("DEBIT")
                    .amount(e.getValue())
                    .build();
            entries.add(entryRepository.save(entry));
        }

        for (Map.Entry<String, BigDecimal> e : credits.entrySet()) {
            JournalEntry entry = JournalEntry.builder()
                    .id(UUID.randomUUID().toString())
                    .journal(journal)
                    .accountCode(e.getKey())
                    .type("CREDIT")
                    .amount(e.getValue())
                    .build();
            entries.add(entryRepository.save(entry));
        }

        journal.setEntries(entries);
        return journal;
    }
}
