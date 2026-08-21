package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSession;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import com.animasys.modules.inventory.importer.domain.ImportSessionStatus;
import com.animasys.modules.inventory.importer.dto.ImportSummary;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.importer.repository.ImportSessionRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Orchestrates the commit phase: partitions eligible rows into fixed-size batches and
 * runs each through {@link ImportBatchExecutor} in its own transaction, so one bad batch
 * never aborts the rest of the import.
 */
@Service
@RequiredArgsConstructor
public class ImportCommitService {

    private static final Logger log = LoggerFactory.getLogger(ImportCommitService.class);
    private static final int BATCH_SIZE = 100;
    private static final int RESULT_MESSAGE_MAX_LENGTH = 500;

    private final ImportSessionRepository importSessionRepository;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final ImportBatchExecutor importBatchExecutor;

    @Transactional
    public ImportSummary commit(String sessionId, String tenantId, String employeeId) {
        ImportSession session = importSessionRepository.findByIdAndTenantId(sessionId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Import session not found"));
        if (session.getStatus() == ImportSessionStatus.COMPLETED) {
            throw new BusinessRuleException("تم استيراد هذه الجلسة بالفعل");
        }
        if (session.getStatus() != ImportSessionStatus.MAPPED) {
            throw new BusinessRuleException("يجب تأكيد ربط الأعمدة قبل تنفيذ الاستيراد");
        }

        session.setStatus(ImportSessionStatus.COMMITTING);
        importSessionRepository.save(session);

        long start = System.currentTimeMillis();
        List<String> eligibleIds = importSessionItemRepository.findBySessionIdOrderByRowNumberAsc(sessionId).stream()
                .filter(i -> i.getStatus() == ImportRowStatus.NEW
                        || i.getStatus() == ImportRowStatus.DUPLICATE
                        || i.getStatus() == ImportRowStatus.COUNT_MATCHED
                        || i.getStatus() == ImportRowStatus.ERROR)
                .map(ImportSessionItem::getId)
                .collect(Collectors.toList());

        int imported = 0, updated = 0, skipped = 0, failed = 0;
        for (List<String> batch : partition(eligibleIds, BATCH_SIZE)) {
            try {
                ImportBatchExecutor.BatchOutcome outcome =
                        importBatchExecutor.processBatch(batch, tenantId, employeeId, sessionId, session.getImportMode());
                imported += outcome.imported();
                updated += outcome.updated();
                skipped += outcome.skipped();
                failed += outcome.failed();
            } catch (Exception e) {
                log.error("Import batch failed for session {}: {}", sessionId, e.getMessage(), e);
                markBatchFailed(batch, e.getMessage());
                failed += batch.size();
            }
        }

        long executionTime = System.currentTimeMillis() - start;
        session.setStatus(ImportSessionStatus.COMPLETED);
        session.setImportedCount(imported);
        session.setUpdatedCount(updated);
        session.setSkippedCount(skipped);
        session.setFailedCount(failed);
        session.setExecutionTimeMs(executionTime);
        session.setCompletedAt(LocalDateTime.now());
        importSessionRepository.save(session);

        return ImportSummary.builder()
                .sessionId(sessionId)
                .imported(imported)
                .updated(updated)
                .skipped(skipped)
                .failed(failed)
                .executionTimeMs(executionTime)
                .build();
    }

    private void markBatchFailed(List<String> itemIds, String message) {
        // A driver-level message can run far past result_message's column width; an
        // overflow here would escape commit() and abort the whole import instead of
        // just recording this batch as failed.
        String reason = "فشل استيراد الدفعة: " + message;
        if (reason.length() > RESULT_MESSAGE_MAX_LENGTH) {
            reason = reason.substring(0, RESULT_MESSAGE_MAX_LENGTH - 1) + "…";
        }
        List<ImportSessionItem> items = importSessionItemRepository.findAllById(itemIds);
        for (ImportSessionItem item : items) {
            item.setStatus(ImportRowStatus.FAILED);
            item.setResultMessage(reason);
        }
        importSessionItemRepository.saveAll(items);
    }

    private static List<List<String>> partition(List<String> ids, int size) {
        List<List<String>> batches = new ArrayList<>();
        for (int i = 0; i < ids.size(); i += size) {
            batches.add(ids.subList(i, Math.min(i + size, ids.size())));
        }
        return batches;
    }
}
