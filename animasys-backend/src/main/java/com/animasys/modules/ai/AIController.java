package com.animasys.modules.ai;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.ai.engine.BusinessContextBuilder;
import com.animasys.modules.ai.engine.PromptBuilder;
import com.animasys.modules.ai.service.AiService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/ai")
@RequiredArgsConstructor
public class AIController {

    private final BusinessContextBuilder contextBuilder;
    private final PromptBuilder promptBuilder;
    private final AiService aiService;

    @GetMapping("/insights")
    @PreAuthorize("@authz.has('ai.insights')")
    public ResponseEntity<ApiResponseWrapper<String>> getBusinessInsights() {
        String tenantId = SecurityUtils.requireTenantId();
        String context = contextBuilder.buildContextString(tenantId);
        String prompt = promptBuilder.assembleInsightsPrompt(context);
        String response = aiService.generateInsights(prompt);

        return ResponseEntity.ok(ApiResponseWrapper.success(response, "تم تجميع تشخيص مؤشرات الأعمال بنجاح"));
    }

    @PostMapping("/ask")
    @PreAuthorize("@authz.has('ai.use_assistant')")
    public ResponseEntity<ApiResponseWrapper<String>> askAdvisor(@Valid @RequestBody AskRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        String context = contextBuilder.buildContextString(tenantId, request.getClientContext());
        String prompt = promptBuilder.assembleChatPrompt(context, request.getQuery());
        String response = aiService.askAdvisor(prompt);

        return ResponseEntity.ok(ApiResponseWrapper.success(response, "تمت معالجة سؤال المستشار بنجاح"));
    }

    @PostMapping("/analyze-invoice")
    @PreAuthorize("@authz.has('ai.ocr_analysis')")
    public ResponseEntity<ApiResponseWrapper<String>> analyzeInvoice(@Valid @RequestBody InvoiceAnalysisRequest request) {
        String prompt = "You are an expert OCR and Supplier Purchase Invoice Parser. Analyze the uploaded invoice image or PDF document and extract all products/items and supplier metadata.\n" +
                        "Respond ONLY with a valid JSON object string (NO markdown codeblocks like ```json):\n" +
                        "{\n" +
                        "  \"supplierName\": \"Supplier Name (Arabic or English)\",\n" +
                        "  \"phone\": \"Supplier Phone (if any)\",\n" +
                        "  \"address\": \"Supplier Address (if any)\",\n" +
                        "  \"taxNumber\": \"Supplier Tax Number / الرقم الضريبي (if any)\",\n" +
                        "  \"invoiceNumber\": \"Invoice Number (if any)\",\n" +
                        "  \"invoiceDate\": \"Invoice Date (YYYY-MM-DD or raw string)\",\n" +
                        "  \"currency\": \"Currency (EGP, USD, EUR, etc. default EGP)\",\n" +
                        "  \"vat\": 140.00,\n" +
                        "  \"discount\": 50.00,\n" +
                        "  \"shipping\": 30.00,\n" +
                        "  \"netTotal\": 1000.00,\n" +
                        "  \"grandTotal\": 1120.00,\n" +
                        "  \"items\": [\n" +
                        "    {\n" +
                        "      \"productName\": \"Product Name / Item description\",\n" +
                        "      \"barcode\": \"Barcode number if visible (EAN13 / UPC)\",\n" +
                        "      \"sku\": \"Supplier SKU / Item Code (if any, else empty)\",\n" +
                        "      \"unitCost\": 110.00,\n" +
                        "      \"lineTotal\": 1320.00,\n" +
                        "      \"quantity\": 12,\n" +
                        "      \"unitName\": \"Packaging unit if visible e.g. Carton, Box, Piece, Bottle\",\n" +
                        "      \"conversionFactor\": 1,\n" +
                        "      \"price\": 140.00,\n" +
                        "      \"lotNumber\": \"LOT / Batch No if printed (e.g. B2026-09)\",\n" +
                        "      \"expiryDate\": \"Expiry Date (YYYY-MM-DD) if printed\",\n" +
                        "      \"categoryName\": \"Suggested category name (e.g. 'أغذية الحيوانات الأليفة', 'مستلزمات الحيوانات الأليفة')\",\n" +
                        "      \"brand\": \"Suggested Brand Name (e.g. Royal Canin)\",\n" +
                        "      \"confidence\": {\n" +
                        "        \"productName\": 0.95,\n" +
                        "        \"barcode\": 0.90,\n" +
                        "        \"sku\": 0.90,\n" +
                        "        \"unitCost\": 0.92,\n" +
                        "        \"lineTotal\": 0.90,\n" +
                        "        \"quantity\": 0.98,\n" +
                        "        \"price\": 0.70\n" +
                        "      }\n" +
                        "    }\n" +
                        "  ]\n" +
                        "}\n" +
                        "Rules for OCR Extraction:\n" +
                        "- unitCost MUST be unit purchase cost only (سعر الوحدة). NEVER put the line total in unitCost.\n" +
                        "- lineTotal MUST be the line subtotal amount.\n" +
                        "- quantity MUST be line purchase quantity.\n" +
                        "- If LOT/Batch or Expiry date (EXP) is visible on line or header, populate lotNumber and expiryDate.\n" +
                        "- Do not use markdown format formatting. Return ONLY raw JSON object string.";

        String response = aiService.analyzeInvoice(
                prompt, request.getImageBase64(), request.getMimeType());
        return ResponseEntity.ok(ApiResponseWrapper.success(response, "تم تحليل الفاتورة بنجاح"));
    }
}
