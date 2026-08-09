package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellAddress;
import org.apache.poi.ss.util.CellRangeAddress;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Parses uploaded .xlsx / .csv product-import files server-side.
 * Never evaluates spreadsheet formulas (formula-injection guard) — formula cells
 * are read as their literal formula text, not executed.
 */
@Service
public class ExcelParserService {

    public static final int MAX_ROWS = 50_000;
    /** How far down the sheet to look for the real header row before giving up. */
    static final int HEADER_SCAN_DEPTH = 20;
    private static final char[] CSV_DELIMITER_CANDIDATES = {',', ';', '\t', '|'};
    /** Skip resolving a merged region if it's implausibly large — a formatting artifact, not real data. */
    private static final int MAX_MERGED_REGION_CELLS = 10_000;
    /** Legacy single-byte encodings real Arabic-locale spreadsheet tools still export CSV in. */
    private static final List<Charset> CSV_FALLBACK_CHARSETS = List.of(
            Charset.forName("windows-1256"), Charset.forName("ISO-8859-6"), StandardCharsets.ISO_8859_1);

    public ParsedFile parse(MultipartFile file) {
        String fileType = detectFileType(file);
        try {
            return switch (fileType) {
                case "CSV" -> parseCsv(file);
                case "XLSX" -> parseXlsx(file);
                default -> throw new BusinessRuleException("نوع الملف غير مدعوم. يرجى رفع ملف Excel (.xlsx) أو CSV (.csv)");
            };
        } catch (IOException e) {
            throw new BusinessRuleException("تعذر قراءة الملف — قد يكون تالفًا: " + e.getMessage());
        }
    }

    public String detectFileType(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null) {
            throw new BusinessRuleException("اسم الملف غير صالح");
        }
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || lower.endsWith(".xls")) {
            return "XLSX";
        }
        if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
            return "CSV";
        }
        throw new BusinessRuleException("نوع الملف غير مدعوم. يرجى رفع ملف Excel (.xlsx) أو CSV (.csv)");
    }

    private ParsedFile parseXlsx(MultipartFile file) throws IOException {
        Workbook workbook;
        try {
            workbook = WorkbookFactory.create(file.getInputStream());
        } catch (Exception e) {
            throw new BusinessRuleException("ملف Excel تالف أو غير صالح");
        }
        try (workbook) {
            Sheet sheet = detectDataSheet(workbook);
            if (sheet == null) {
                throw new BusinessRuleException("لم يتم العثور على بيانات في أي ورقة عمل بالملف");
            }
            DataFormatter formatter = new DataFormatter();
            // A cell's own text takes priority; this only fills in the cells a merged
            // region leaves blank (every cell but its top-left one) with the anchor's
            // value, so a merged title/label doesn't come out empty.
            Map<Long, CellAddress> mergedLookup = buildMergedRegionLookup(sheet);

            int headerRowIdx = detectHeaderRow(sheet, formatter);
            Row headerRow = sheet.getRow(headerRowIdx);
            if (headerRow == null) {
                throw new BusinessRuleException("لم يتم العثور على صف عناوين الأعمدة");
            }
            List<String> rawHeaders = new ArrayList<>();
            int lastCol = Math.max(headerRow.getLastCellNum(), widestRowLength(sheet, headerRowIdx));
            for (int c = 0; c < lastCol; c++) {
                rawHeaders.add(sanitize(cellText(sheet, mergedLookup, headerRowIdx, c, formatter)));
            }
            List<String> headers = uniqueHeaders(rawHeaders);

            List<Map<String, String>> rows = new ArrayList<>();
            for (int r = headerRowIdx + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null || isRowBlank(row, formatter)) {
                    continue;
                }
                Map<String, String> rowData = new LinkedHashMap<>();
                for (int c = 0; c < headers.size(); c++) {
                    rowData.put(headers.get(c), sanitize(cellText(sheet, mergedLookup, r, c, formatter)));
                }
                rows.add(rowData);
                if (rows.size() > MAX_ROWS) {
                    throw new BusinessRuleException("الملف يحتوي على أكثر من " + MAX_ROWS + " صف — يرجى تقسيمه");
                }
            }
            dropEmptyPlaceholderColumns(headers, rawHeaders, rows);
            return new ParsedFile(sheet.getSheetName(), headers, rows);
        }
    }

    /**
     * Finds the row that actually carries the column labels. Real-world exports routinely
     * start with a company title, a date line, or blank spacer rows, and taking the first
     * physical row as the header turns every column into "Column1..N" — after which nothing
     * maps and the whole upload fails.
     *
     * <p>Deliberately reads cells directly here, without merged-region fill: a banner or
     * instruction line merged across the whole sheet width must count as the single cell it
     * is, not as one recognized-looking "column" per cell it visually spans. A real template
     * seen in practice merges a warning sentence across every column that happens to mention
     * "الباركود" and "اسم المنتج" as examples — with merge-fill applied to the scoring pass,
     * that single sentence would out-score the genuine header row by looking like N different
     * recognized columns instead of the one long one it actually is.</p>
     */
    private int detectHeaderRow(Sheet sheet, DataFormatter formatter) {
        int first = sheet.getFirstRowNum();
        int last = Math.min(sheet.getLastRowNum(), first + HEADER_SCAN_DEPTH);
        int bestRow = first;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (int r = first; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                continue;
            }
            List<String> cells = new ArrayList<>();
            for (int c = 0; c < row.getLastCellNum(); c++) {
                cells.add(sanitize(cellToText(row.getCell(c), formatter)));
            }
            double score = headerRowScore(cells);
            if (score > bestScore) {
                bestScore = score;
                bestRow = r;
            }
        }
        return bestRow;
    }

    /**
     * Scores how much a row looks like a header: recognized column labels count heavily,
     * plain filled text cells count a little, and numeric cells count against it (a data
     * row is mostly numbers, a header row never is).
     */
    static double headerRowScore(List<String> cells) {
        int filled = 0, recognized = 0, numeric = 0;
        for (String cell : cells) {
            if (cell.isEmpty()) {
                continue;
            }
            filled++;
            if (isNumericText(cell)) {
                numeric++;
            } else if (ColumnMappingEngine.isRecognizedHeader(cell)) {
                recognized++;
            }
        }
        if (filled < 2) {
            return Double.NEGATIVE_INFINITY;
        }
        return (recognized * 10.0) + filled - (numeric * 3.0);
    }

    private static boolean isNumericText(String value) {
        try {
            new BigDecimal(HeaderNormalizer.toLatinDigits(value).replace(",", "").trim());
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Data rows can be wider than the header row when the template has unlabeled columns. */
    private int widestRowLength(Sheet sheet, int headerRowIdx) {
        int widest = 0;
        int last = Math.min(sheet.getLastRowNum(), headerRowIdx + HEADER_SCAN_DEPTH);
        for (int r = headerRowIdx + 1; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row != null) {
                widest = Math.max(widest, row.getLastCellNum());
            }
        }
        return widest;
    }

    /**
     * Row data is keyed by header text, so two columns sharing a label (or two blanks)
     * would silently overwrite each other — one of them losing all its values.
     */
    static List<String> uniqueHeaders(List<String> rawHeaders) {
        List<String> headers = new ArrayList<>(rawHeaders.size());
        Set<String> seen = new HashSet<>();
        for (int c = 0; c < rawHeaders.size(); c++) {
            String header = rawHeaders.get(c);
            if (header.isEmpty()) {
                header = "Column" + (c + 1);
            }
            String candidate = header;
            int suffix = 2;
            while (!seen.add(candidate)) {
                candidate = header + " (" + suffix++ + ")";
            }
            headers.add(candidate);
        }
        return headers;
    }

    /**
     * Drops columns that had no label at all AND carry no value in any row — a spacer
     * column real templates leave in, not data the user asked to import. A column with a
     * real label is always kept even if this particular file left it empty, since the user
     * may still want it mapped.
     */
    static void dropEmptyPlaceholderColumns(List<String> headers, List<String> rawHeaders, List<Map<String, String>> rows) {
        List<String> toRemove = new ArrayList<>();
        for (int i = 0; i < headers.size() && i < rawHeaders.size(); i++) {
            if (!rawHeaders.get(i).isEmpty()) {
                continue;
            }
            String header = headers.get(i);
            boolean allBlank = rows.stream().allMatch(row -> {
                String v = row.get(header);
                return v == null || v.isEmpty();
            });
            if (allBlank) {
                toRemove.add(header);
            }
        }
        if (toRemove.isEmpty()) {
            return;
        }
        headers.removeAll(toRemove);
        for (Map<String, String> row : rows) {
            toRemove.forEach(row::remove);
        }
    }

    /** Auto-detects the worksheet with the most content (first non-empty sheet wins ties). */
    private Sheet detectDataSheet(Workbook workbook) {
        Sheet best = null;
        int bestRows = 0;
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            Sheet sheet = workbook.getSheetAt(i);
            int rows = sheet.getPhysicalNumberOfRows();
            if (rows > bestRows) {
                bestRows = rows;
                best = sheet;
            }
        }
        return best;
    }

    private boolean isRowBlank(Row row, DataFormatter formatter) {
        for (Cell cell : row) {
            if (!sanitize(formatter.formatCellValue(cell)).isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Every cell in a merged region except its top-left one comes back blank from POI —
     * that's correct for genuinely empty cells, but wrong for a merged header/label, whose
     * text only exists on the anchor cell. Falls back to the anchor's value only when the
     * direct cell is itself blank, so real per-cell data is never overwritten.
     */
    private String cellText(Sheet sheet, Map<Long, CellAddress> mergedLookup, int r, int c, DataFormatter formatter) {
        Row row = sheet.getRow(r);
        Cell direct = row == null ? null : row.getCell(c);
        String value = cellToText(direct, formatter);
        if (!value.isEmpty()) {
            return value;
        }
        CellAddress anchor = mergedLookup.get(mergeKey(r, c));
        if (anchor == null) {
            return value;
        }
        Row anchorRow = sheet.getRow(anchor.getRow());
        Cell anchorCell = anchorRow == null ? null : anchorRow.getCell(anchor.getColumn());
        return cellToText(anchorCell, formatter);
    }

    private static Map<Long, CellAddress> buildMergedRegionLookup(Sheet sheet) {
        Map<Long, CellAddress> lookup = new HashMap<>();
        for (CellRangeAddress region : sheet.getMergedRegions()) {
            long cellCount = (long) region.getNumberOfCells();
            if (cellCount > MAX_MERGED_REGION_CELLS) {
                continue;
            }
            CellAddress anchor = new CellAddress(region.getFirstRow(), region.getFirstColumn());
            for (int r = region.getFirstRow(); r <= region.getLastRow(); r++) {
                for (int c = region.getFirstColumn(); c <= region.getLastColumn(); c++) {
                    if (r == region.getFirstRow() && c == region.getFirstColumn()) {
                        continue;
                    }
                    lookup.put(mergeKey(r, c), anchor);
                }
            }
        }
        return lookup;
    }

    private static long mergeKey(int row, int col) {
        return ((long) row << 20) | (col & 0xFFFFFL);
    }

    /**
     * Reads a cell as plain text without Excel's display quirks. Barcodes/SKUs/batch
     * numbers stored as numeric cells (e.g. a 13-digit barcode) get rendered by Excel's
     * own "General" format as scientific notation ("8.68147E+12") once they exceed ~11
     * significant digits — {@link DataFormatter} faithfully reproduces that, corrupting
     * the value. Whole numbers are read via their raw double and written out as plain
     * digits instead; date-formatted and fractional cells keep the normal formatting.
     *
     * <p>Hidden columns/rows are read the same as visible ones — "hidden" is a display
     * flag only, the data is still there.</p>
     */
    private String cellToText(Cell cell, DataFormatter formatter) {
        if (cell == null) {
            return "";
        }
        if (cell.getCellType() == CellType.NUMERIC && !DateUtil.isCellDateFormatted(cell)) {
            double value = cell.getNumericCellValue();
            if (!Double.isNaN(value) && !Double.isInfinite(value)) {
                BigDecimal exact = BigDecimal.valueOf(value).stripTrailingZeros();
                if (exact.scale() <= 0) {
                    return exact.toBigInteger().toString();
                }
                return exact.toPlainString();
            }
        }
        return formatter.formatCellValue(cell);
    }

    private ParsedFile parseCsv(MultipartFile file) throws IOException {
        List<List<String>> records = readCsvRecords(file);
        if (records.isEmpty()) {
            throw new BusinessRuleException("الملف لا يحتوي على أي صفوف بيانات");
        }

        int headerIdx = 0;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < Math.min(records.size(), HEADER_SCAN_DEPTH); i++) {
            double score = headerRowScore(records.get(i));
            if (score > bestScore) {
                bestScore = score;
                headerIdx = i;
            }
        }

        int width = 0;
        for (List<String> record : records) {
            width = Math.max(width, record.size());
        }
        List<String> rawHeaders = new ArrayList<>(padded(records.get(headerIdx), width));
        List<String> headers = uniqueHeaders(rawHeaders);

        List<Map<String, String>> rows = new ArrayList<>();
        for (int i = headerIdx + 1; i < records.size(); i++) {
            List<String> record = padded(records.get(i), width);
            Map<String, String> rowData = new LinkedHashMap<>();
            boolean blank = true;
            for (int c = 0; c < headers.size(); c++) {
                String value = record.get(c);
                if (!value.isEmpty()) {
                    blank = false;
                }
                rowData.put(headers.get(c), value);
            }
            if (blank) {
                continue;
            }
            rows.add(rowData);
            if (rows.size() > MAX_ROWS) {
                throw new BusinessRuleException("الملف يحتوي على أكثر من " + MAX_ROWS + " صف — يرجى تقسيمه");
            }
        }
        dropEmptyPlaceholderColumns(headers, rawHeaders, rows);
        return new ParsedFile("CSV", headers, rows);
    }

    /**
     * Reads the CSV without assuming a header row, a delimiter, or an encoding. Excel under
     * an Arabic (or any non-US) locale writes {@code ;}-separated files, and legacy export
     * tools still write CSV in the OS's native single-byte codepage instead of UTF-8 — for
     * Arabic Windows that's windows-1256, where every non-ASCII byte would otherwise turn
     * into replacement characters under a hardcoded UTF-8 read.
     */
    private List<List<String>> readCsvRecords(MultipartFile file) throws IOException {
        byte[] content = readAll(file);
        String text = stripBom(decodeCsv(content));
        char delimiter = detectDelimiter(text);
        try (CSVParser parser = CSVFormat.DEFAULT.builder()
                .setDelimiter(delimiter)
                .setAllowMissingColumnNames(true)
                .setIgnoreEmptyLines(true)
                .setIgnoreSurroundingSpaces(true)
                .setTrim(true)
                .build()
                .parse(new java.io.StringReader(text))) {
            List<List<String>> records = new ArrayList<>();
            for (CSVRecord record : parser) {
                List<String> cells = new ArrayList<>(record.size());
                for (String value : record) {
                    cells.add(sanitize(value));
                }
                records.add(cells);
            }
            return records;
        } catch (IllegalArgumentException e) {
            throw new BusinessRuleException("ملف CSV تالف أو غير صالح: " + e.getMessage());
        }
    }

    /**
     * A byte-order mark settles it outright; otherwise a strict UTF-8 decode either
     * succeeds (the common case) or trips on the first invalid byte sequence, in which
     * case each legacy single-byte fallback is tried in turn — those never fail to decode
     * (every byte value is valid in them), so the first one is kept.
     */
    static String decodeCsv(byte[] content) {
        if (hasUtf8Bom(content)) {
            return new String(content, 3, content.length - 3, StandardCharsets.UTF_8);
        }
        Charset utf8Strict = StandardCharsets.UTF_8;
        try {
            CharsetDecoder decoder = utf8Strict.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            return decoder.decode(java.nio.ByteBuffer.wrap(content)).toString();
        } catch (Exception notUtf8) {
            for (Charset candidate : CSV_FALLBACK_CHARSETS) {
                try {
                    return candidate.newDecoder()
                            .onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT)
                            .decode(java.nio.ByteBuffer.wrap(content)).toString();
                } catch (Exception ignored) {
                    // try the next legacy codepage
                }
            }
            // Nothing decoded cleanly; fall back to a lossy UTF-8 read rather than fail the upload.
            return new String(content, StandardCharsets.UTF_8);
        }
    }

    private static boolean hasUtf8Bom(byte[] content) {
        return content.length >= 3 && (content[0] & 0xFF) == 0xEF
                && (content[1] & 0xFF) == 0xBB && (content[2] & 0xFF) == 0xBF;
    }

    /** Picks the delimiter that splits the first few lines into the most (and most consistent) columns. */
    static char detectDelimiter(String text) {
        String[] lines = text.split("\\R", HEADER_SCAN_DEPTH + 1);
        char best = ',';
        int bestCount = 0;
        for (char candidate : CSV_DELIMITER_CANDIDATES) {
            int count = 0;
            for (int i = 0; i < Math.min(lines.length, HEADER_SCAN_DEPTH); i++) {
                count = Math.max(count, countOutsideQuotes(lines[i], candidate));
            }
            if (count > bestCount) {
                bestCount = count;
                best = candidate;
            }
        }
        return best;
    }

    private static int countOutsideQuotes(String line, char delimiter) {
        int count = 0;
        boolean inQuotes = false;
        for (char c : line.toCharArray()) {
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == delimiter && !inQuotes) {
                count++;
            }
        }
        return count;
    }

    private static byte[] readAll(MultipartFile file) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return in.readAllBytes();
        }
    }

    private static String stripBom(String text) {
        return text.startsWith("﻿") ? text.substring(1) : text;
    }

    private static List<String> padded(List<String> record, int width) {
        if (record.size() >= width) {
            return record;
        }
        List<String> padded = new ArrayList<>(record);
        while (padded.size() < width) {
            padded.add("");
        }
        return padded;
    }

    /**
     * Strips control characters and neutralizes leading formula-trigger characters
     * (=, +, -, @) so a value read from an untrusted file can never re-activate as a
     * formula if it's later written into a generated report/export workbook.
     */
    static String sanitize(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "").trim();
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return s;
    }
}
