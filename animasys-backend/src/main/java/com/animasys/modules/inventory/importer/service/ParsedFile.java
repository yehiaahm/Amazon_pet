package com.animasys.modules.inventory.importer.service;

import java.util.List;
import java.util.Map;

/** Result of parsing an uploaded Excel/CSV file: ordered headers + rows keyed by raw header text. */
public record ParsedFile(String sheetName, List<String> headers, List<Map<String, String>> rows) {
}
