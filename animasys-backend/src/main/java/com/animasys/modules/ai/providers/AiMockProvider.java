package com.animasys.modules.ai.providers;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Development-only mock AI provider. Enabled via {@code app.ai.mock-enabled=true}.
 * Must never be active in production (enforced by {@link com.animasys.modules.ai.config.AiStartupValidator}).
 */
@Component
public class AiMockProvider implements AIProvider {

    @Override
    public String generateResponse(String prompt) {
        return generateMockResponse(prompt);
    }

    @Override
    public String generateVisionResponse(String prompt, String imageBase64, String mimeType) {
        return generateMockVisionResponse(prompt);
    }

    private String generateMockVisionResponse(String prompt) {
        String p = prompt.toLowerCase();

        if (p.contains("accessories") || p.contains("toy") || p.contains("ألعاب") || p.contains("إكسسوار")) {
            return mockAccessoriesInvoice();
        }
        if (p.contains("med") || p.contains("pharmacy") || p.contains("دواء") || p.contains("صيدلية")) {
            return mockPharmacyInvoice();
        }
        return mockDefaultInvoice();
    }

    private String mockDefaultInvoice() {
        return """
                {
                  "supplierName": "Royal Egypt",
                  "phone": "01234567890",
                  "address": "التجمع الخامس، القاهرة",
                  "taxNumber": "100-200-300",
                  "invoiceNumber": "INV-RC-5542",
                  "invoiceDate": "2026-07-12",
                  "currency": "EGP",
                  "vat": 350.00,
                  "discount": 150.00,
                  "shipping": 80.00,
                  "netTotal": 2500.00,
                  "grandTotal": 2780.00,
                  "items": [
                    {
                      "productName": "Adult Medium Dry Dog Food",
                      "sku": "RC-DOG-ADULT-10",
                      "unitCost": 35.00,
                      "lineTotal": 420.00,
                      "price": 65.00,
                      "quantity": 12,
                      "categoryName": "أغذية الحيوانات الأليفة",
                      "brand": "Royal Canin"
                    }
                  ]
                }
                """;
    }

    private String mockAccessoriesInvoice() {
        return """
                {
                  "supplierName": "الأهرام لمستلزمات الحيوانات",
                  "invoiceNumber": "INV-ACCESS-9820",
                  "invoiceDate": "2026-07-10",
                  "currency": "EGP",
                  "vat": 420.00,
                  "netTotal": 3000.00,
                  "grandTotal": 3370.00,
                  "items": [
                    {
                      "productName": "Classic Rubber Chew Toy",
                      "sku": "KG-TOY-DOG-CLASSIC",
                      "unitCost": 6.50,
                      "lineTotal": 117.00,
                      "price": 15.00,
                      "quantity": 18
                    }
                  ]
                }
                """;
    }

    private String mockPharmacyInvoice() {
        return """
                {
                  "supplierName": "الشركة المصرية للأدوية البيطرية",
                  "invoiceNumber": "INV-VETMED-771",
                  "invoiceDate": "2026-07-11",
                  "currency": "EGP",
                  "vat": 182.00,
                  "netTotal": 1300.00,
                  "grandTotal": 1522.00,
                  "items": [
                    {
                      "productName": "Flea & Tick Chewable Tablets",
                      "sku": "BV-MED-DOG-LARGE",
                      "unitCost": 24.00,
                      "lineTotal": 288.00,
                      "price": 42.00,
                      "quantity": 12
                    }
                  ]
                }
                """;
    }

    private String generateMockResponse(String prompt) {
        if (prompt != null && (prompt.contains("actual Excel headers") || prompt.contains("Excel headers")
                || prompt.contains("sku") || prompt.contains("productName"))) {
            return mockImportMapping(prompt);
        }

        if (prompt != null && (prompt.contains("إجمالي_الإيرادات") || prompt.contains("Amazon Pet")
                || prompt.contains("رسالة صاحب المحل"))) {
            return "Mock advisor response for development only. Configure GEMINI_API_KEY for live AI.";
        }

        return "Mock AI response for development only.";
    }

    private String mockImportMapping(String prompt) {
        String headersPart = "";
        int startIdx = prompt.indexOf("Actual Excel headers:");
        if (startIdx == -1) {
            startIdx = prompt.indexOf("headers:");
        }
        if (startIdx != -1) {
            headersPart = prompt.substring(startIdx + "Actual Excel headers:".length());
            int endIdx = headersPart.indexOf("]");
            if (endIdx != -1) {
                headersPart = headersPart.substring(0, endIdx + 1);
            }
        }

        List<String> headers = new java.util.ArrayList<>();
        if (!headersPart.isEmpty()) {
            headersPart = headersPart.replace("[", "").replace("]", "").replace("\"", "").replace("'", "");
            for (String h : headersPart.split(",")) {
                headers.add(h.trim());
            }
        }

        Map<String, String> mapping = new HashMap<>();
        Map<String, Double> confidence = new HashMap<>();
        String[] fields = {"sku", "productName", "variantName", "cost", "price", "stock", "categoryName", "brand", "supplier"};

        Map<String, String[]> synonyms = new HashMap<>();
        synonyms.put("sku", new String[]{"sku", "code", "كود", "barcode"});
        synonyms.put("productName", new String[]{"product", "name", "الاسم", "اسم المنتج"});
        synonyms.put("cost", new String[]{"cost", "سعر الشراء", "التكلفة"});
        synonyms.put("price", new String[]{"price", "سعر البيع", "السعر"});

        for (String field : fields) {
            mapping.put(field, "");
            confidence.put(field, 0.0);
            String[] synList = synonyms.get(field);
            if (synList == null) {
                continue;
            }
            for (String synonym : synList) {
                for (String header : headers) {
                    if (header.equalsIgnoreCase(synonym)) {
                        mapping.put(field, header);
                        confidence.put(field, 0.99);
                        break;
                    }
                }
            }
        }

        StringBuilder json = new StringBuilder("{\n  \"mapping\": {\n");
        for (int i = 0; i < fields.length; i++) {
            json.append("    \"").append(fields[i]).append("\": \"").append(mapping.get(fields[i])).append("\"");
            if (i < fields.length - 1) {
                json.append(",\n");
            }
        }
        json.append("\n  },\n  \"confidence\": {\n");
        for (int i = 0; i < fields.length; i++) {
            json.append("    \"").append(fields[i]).append("\": ").append(confidence.get(fields[i]));
            if (i < fields.length - 1) {
                json.append(",\n");
            }
        }
        json.append("\n  }\n}");
        return json.toString();
    }
}
