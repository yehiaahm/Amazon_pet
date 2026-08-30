package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSession;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.importer.repository.ImportSessionRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds the downloadable "Excel Error Report": one row per rejected item (validation
 * failure at mapping time, or a commit-time failure) with its reasons, so the user can fix
 * the source file and re-upload instead of re-reading a preview table.
 */
@Service
@RequiredArgsConstructor
public class ImportErrorReportService {

    private static final Set<ImportRowStatus> REPORTABLE = EnumSet.of(ImportRowStatus.ERROR, ImportRowStatus.FAILED);
    private static final String[] COLUMNS = {
            "رقم الصف", "الحالة", "SKU", "الباركود", "اسم المنتج", "سبب الفشل",
    };

    private final ImportSessionRepository importSessionRepository;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public byte[] buildErrorReport(String sessionId, String tenantId) {
        ImportSession session = importSessionRepository.findByIdAndTenantId(sessionId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Import session not found"));

        List<ImportSessionItem> failed = importSessionItemRepository.findBySessionIdOrderByRowNumberAsc(sessionId)
                .stream().filter(i -> REPORTABLE.contains(i.getStatus())).toList();

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Errors");
            CellStyle headerStyle = workbook.createCellStyle();
            Font boldFont = workbook.createFont();
            boldFont.setBold(true);
            headerStyle.setFont(boldFont);

            Row header = sheet.createRow(0);
            for (int c = 0; c < COLUMNS.length; c++) {
                Cell cell = header.createCell(c);
                cell.setCellValue(COLUMNS[c]);
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (ImportSessionItem item : failed) {
                Map<String, String> mapped = readJsonMap(item.getMappedData());
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(item.getRowNumber());
                row.createCell(1).setCellValue(item.getStatus().name());
                row.createCell(2).setCellValue(mapped.getOrDefault(ImportField.SKU.code(), ""));
                row.createCell(3).setCellValue(mapped.getOrDefault(ImportField.BARCODE.code(), ""));
                row.createCell(4).setCellValue(mapped.getOrDefault(ImportField.PRODUCT_NAME.code(), ""));
                row.createCell(5).setCellValue(failureReason(item));
            }
            for (int c = 0; c < COLUMNS.length; c++) {
                sheet.autoSizeColumn(c);
            }
            if (failed.isEmpty()) {
                sheet.createRow(1).createCell(0).setCellValue("لا توجد أخطاء في هذه الجلسة");
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessRuleException("تعذر إنشاء تقرير الأخطاء");
        }
    }

    private String failureReason(ImportSessionItem item) {
        if (item.getResultMessage() != null && !item.getResultMessage().isBlank()) {
            return item.getResultMessage();
        }
        List<ValidationIssue> errors = readJsonIssues(item.getValidationErrors());
        if (!errors.isEmpty()) {
            return errors.stream().map(ValidationIssue::getMessage).reduce((a, b) -> a + "؛ " + b).orElse("");
        }
        return "غير معروف";
    }

    private Map<String, String> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }

    private List<ValidationIssue> readJsonIssues(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return List.of();
        }
    }
}
