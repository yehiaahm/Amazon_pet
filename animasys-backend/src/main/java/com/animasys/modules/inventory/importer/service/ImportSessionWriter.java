package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSession;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import com.animasys.modules.inventory.importer.domain.ImportSessionStatus;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.importer.repository.ImportSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Owns the transactional write of a freshly parsed upload. Split out of
 * {@link ImportSessionService} so column auto-mapping — which can call the AI provider over
 * the network — happens outside any database transaction.
 */
@Service
@RequiredArgsConstructor
public class ImportSessionWriter {

    private final TenantRepository tenantRepository;
    private final EmployeeRepository employeeRepository;
    private final ImportSessionRepository importSessionRepository;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public ImportSession createSession(String tenantId, String employeeId, MultipartFile file,
                                       String fileType, ParsedFile parsed, String columnHeadersJson, ImportMode mode) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found"));
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found"));

        ImportSession session = ImportSession.builder()
                .id("imp-" + UUID.randomUUID().toString().substring(0, 12))
                .tenant(tenant)
                .uploadedBy(employee)
                .fileName(file.getOriginalFilename())
                .fileSize(file.getSize())
                .fileType(fileType)
                .status(ImportSessionStatus.PENDING_MAPPING)
                .columnHeaders(columnHeadersJson)
                .importMode(mode != null ? mode : ImportMode.ADD_STOCK)
                .totalRows(parsed.rows().size())
                .build();
        importSessionRepository.save(session);

        List<ImportSessionItem> items = new ArrayList<>();
        int rowNumber = 1;
        for (Map<String, String> row : parsed.rows()) {
            items.add(ImportSessionItem.builder()
                    .id("impi-" + UUID.randomUUID().toString().substring(0, 12))
                    .session(session)
                    .rowNumber(rowNumber++)
                    .rawData(writeJson(row))
                    .status(ImportRowStatus.PENDING)
                    .build());
        }
        importSessionItemRepository.saveAll(items);
        return session;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessRuleException("تعذر معالجة بيانات الصف");
        }
    }
}
