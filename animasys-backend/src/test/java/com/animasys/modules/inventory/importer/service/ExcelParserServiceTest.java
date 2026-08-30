package com.animasys.modules.inventory.importer.service;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ExcelParserServiceTest {

    private final ExcelParserService parser = new ExcelParserService();

    @Test
    void findsHeaderRowBelowTitleAndBlankRows() {
        // The shape almost every real inventory export has: a title, a date line, a spacer,
        // and only then the column labels. Taking row 0 as the header made every column
        // "Column1..N", which mapped to nothing and failed the whole upload.
        ParsedFile parsed = parse(
                List.of("جرد مخزن أمازون بيت"),
                List.of("تاريخ التقرير: 2026-08-01"),
                List.of(""),
                List.of("الباركود", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of("6221031000019", "دراي فود قطط", "12", "70", "95"));

        assertEquals(List.of("الباركود", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"), parsed.headers());
        assertEquals(1, parsed.rows().size());
        assertEquals("دراي فود قطط", parsed.rows().get(0).get("اسم المنتج"));
    }

    @Test
    void keepsFirstRowAsHeaderWhenThereIsNoTitleRow() {
        ParsedFile parsed = parse(
                List.of("الباركود", "اسم المنتج", "الكمية"),
                List.of("6221031000019", "دراي فود قطط", "12"),
                List.of("6221031000026", "رمل قطط", "8"));

        assertEquals(List.of("الباركود", "اسم المنتج", "الكمية"), parsed.headers());
        assertEquals(2, parsed.rows().size());
    }

    @Test
    void keepsBothColumnsWhenTwoHeadersShareALabel() {
        ParsedFile parsed = parse(
                List.of("اسم المنتج", "الكمية", "الكمية"),
                List.of("رمل قطط", "5", "9"));

        assertEquals(3, parsed.headers().size());
        assertEquals(3, parsed.headers().stream().distinct().count(), "duplicate labels must not collapse");
        assertEquals("5", parsed.rows().get(0).get(parsed.headers().get(1)));
        assertEquals("9", parsed.rows().get(0).get(parsed.headers().get(2)));
    }

    @Test
    void fillsAHeaderCellFromAMergedRegionInsteadOfLeavingItBlank() throws Exception {
        // A wide decorative label spanning two physical columns is a common template
        // layout. POI returns null for every cell in a merged region except its top-left
        // one, so without merge resolution the second column reads as blank and becomes a
        // meaningless "ColumnN" placeholder that can never be mapped.
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("Sheet1");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("الباركود");
            header.createCell(1).setCellValue("اسم المنتج");
            header.createCell(3).setCellValue("الكمية");
            sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 1, 2));
            Row data = sheet.createRow(1);
            data.createCell(0).setCellValue("6221031000019");
            data.createCell(1).setCellValue("دراي فود قطط سالمون");
            data.createCell(3).setCellValue("12");

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            ParsedFile parsed = parser.parse(new MockMultipartFile("file", "stock.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray()));

            assertEquals(List.of("الباركود", "اسم المنتج", "اسم المنتج (2)", "الكمية"), parsed.headers());
            assertEquals("12", parsed.rows().get(0).get("الكمية"));
        }
    }

    @Test
    void doesNotMistakeAMergedInstructionBannerForTheHeaderRow() throws Exception {
        // A real customer template: row 3 is a warning sentence ("املأ خانتَي (الباركود،
        // اسم المنتج) دائماً...") merged across all 18 columns as one long banner. Every
        // column used to inherit that same text via merge-fill during header-row scoring,
        // and because the sentence happens to mention "الباركود" and "اسم المنتج" as
        // examples, N duplicated "recognized-looking" cells out-scored the one real header
        // row below it.
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("الجرد");
            Row title = sheet.createRow(0);
            title.createCell(0).setCellValue("كشف جرد المحل");
            sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 17));

            Row banner = sheet.createRow(1);
            banner.createCell(0).setCellValue(
                    "تنبيه: املأ خانتَي (الباركود، اسم المنتج) دائماً — أما باقي الخانات فاتركها فارغة إن لم تتوفر بياناتها الآن.");
            sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(1, 1, 0, 17));

            Row header = sheet.createRow(2);
            String[] labels = {"الباركود", "كود الصنف (SKU)", "اسم المنتج", "الماركة", "الفئة",
                    "اسم الصنف / الوزن / الحجم", "الوحدة", "الكمية الحالية", "سعر التكلفة", "سعر البيع",
                    "حد الطلب الأدنى", "المخزن / الفرع", "المورد", "تاريخ الصلاحية", "رقم الباتش", "ملاحظات"};
            for (int c = 0; c < labels.length; c++) {
                header.createCell(c).setCellValue(labels[c]);
            }

            Row data = sheet.createRow(3);
            data.createCell(0).setCellValue("8681465603146");
            data.createCell(2).setCellValue("best pet salmon sterilised cat wet 400g");
            data.createCell(7).setCellValue("19");
            data.createCell(8).setCellValue("70");
            data.createCell(9).setCellValue("85");

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            ParsedFile parsed = parser.parse(new MockMultipartFile("file", "stock.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray()));

            assertEquals("الباركود", parsed.headers().get(0));
            assertEquals(1, parsed.rows().size());
            assertEquals("best pet salmon sterilised cat wet 400g", parsed.rows().get(0).get("اسم المنتج"));
        }
    }

    @Test
    void readsAHiddenColumnTheSameAsAVisibleOne() throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("Sheet1");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("الباركود");
            header.createCell(1).setCellValue("اسم المنتج");
            header.createCell(2).setCellValue("سعر البيع");
            sheet.setColumnHidden(2, true);
            Row data = sheet.createRow(1);
            data.createCell(0).setCellValue("6221031000019");
            data.createCell(1).setCellValue("دراي فود قطط");
            data.createCell(2).setCellValue("95");

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            ParsedFile parsed = parser.parse(new MockMultipartFile("file", "stock.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray()));

            assertEquals("95", parsed.rows().get(0).get("سعر البيع"), "a hidden column's data must not be dropped");
        }
    }

    @Test
    void dropsATrailingUnlabeledColumnThatCarriesNoData() {
        // Real templates often leave a spacer column between two sections — no header,
        // no values in any row.
        ParsedFile parsed = parse(
                List.of("الباركود", "اسم المنتج", "", "الكمية"),
                List.of("6221031000019", "دراي فود قطط", "", "12"));

        assertEquals(List.of("الباركود", "اسم المنتج", "الكمية"), parsed.headers());
    }

    @Test
    void parsesSemicolonSeparatedCsvWrittenByArabicLocaleExcel() {
        String csv = "الباركود;اسم المنتج;الكمية;سعر البيع\n6221031000019;دراي فود قطط;12;95\n";
        ParsedFile parsed = parser.parse(new MockMultipartFile(
                "file", "stock.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(List.of("الباركود", "اسم المنتج", "الكمية", "سعر البيع"), parsed.headers());
        assertEquals("دراي فود قطط", parsed.rows().get(0).get("اسم المنتج"));
    }

    @Test
    void skipsCsvPreambleAndByteOrderMark() {
        String csv = "﻿تقرير المخزون\n\nBarcode,Product Name,Qty\n6221031000019,Cat Litter,4\n";
        ParsedFile parsed = parser.parse(new MockMultipartFile(
                "file", "stock.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(List.of("Barcode", "Product Name", "Qty"), parsed.headers());
        assertEquals("Cat Litter", parsed.rows().get(0).get("Product Name"));
    }

    @Test
    void readsAWindows1256CsvFromALegacyArabicExportTool() {
        // Real export tools on Arabic Windows still write CSV in the OS codepage rather
        // than UTF-8; a hardcoded UTF-8 read turns every Arabic byte into mojibake/garbage,
        // and the mapping engine then sees unrecognizable headers.
        String csv = "الباركود,اسم المنتج,الكمية\n6221031000019,دراي فود قطط,12\n";
        byte[] windows1256Bytes = csv.getBytes(Charset.forName("windows-1256"));

        ParsedFile parsed = parser.parse(new MockMultipartFile("file", "stock.csv", "text/csv", windows1256Bytes));

        assertEquals(List.of("الباركود", "اسم المنتج", "الكمية"), parsed.headers());
        assertEquals("دراي فود قطط", parsed.rows().get(0).get("اسم المنتج"));
    }

    @SafeVarargs
    private ParsedFile parse(List<String>... rows) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("Sheet1");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].size(); c++) {
                    row.createCell(c).setCellValue(rows[r].get(c));
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return parser.parse(new MockMultipartFile("file", "stock.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
