package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.barcode.BarcodeImageService;
import com.animasys.modules.inventory.barcode.QrLabelService;
import com.animasys.modules.inventory.barcode.QrPayload;
import com.animasys.modules.inventory.dto.QrLabelRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/v1/inventory/qr-labels")
@RequiredArgsConstructor
public class QrLabelController {

    private final QrLabelService qrLabelService;

    @GetMapping("/variants/{variantId}/payload")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<QrPayload>> getQrPayload(
            @PathVariable String variantId
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        QrPayload payload = qrLabelService.buildQrPayload(tenantId, variantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(payload, "QR payload generated"));
    }

    @GetMapping("/variants/{variantId}/image")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<?> getQrImage(
            @PathVariable String variantId,
            @RequestParam(required = false, defaultValue = "300") @Min(50) @Max(2000) int width,
            @RequestParam(required = false, defaultValue = "300") @Min(50) @Max(2000) int height,
            @RequestParam(required = false, defaultValue = "PNG") String format
    ) {
        String tenantId = SecurityUtils.requireTenantId();

        if ("SVG".equalsIgnoreCase(format)) {
            String svg = qrLabelService.generateQrSvg(tenantId, variantId, width, height);
            return ResponseEntity.ok()
                    .header("Content-Type", "image/svg+xml")
                    .body(svg);
        } else {
            byte[] png = qrLabelService.generateQrPng(tenantId, variantId, width, height);
            return ResponseEntity.ok()
                    .header("Content-Type", "image/png")
                    .body(png);
        }
    }

    @GetMapping("/variants/{variantId}/preview")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> getQrPreview(
            @PathVariable String variantId
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        QrPayload payload = qrLabelService.buildQrPayload(tenantId, variantId);
        String base64 = qrLabelService.generateQrPngBase64(tenantId, variantId, 300, 300);

        Map<String, Object> result = new HashMap<>();
        result.put("variantId", variantId);
        result.put("productName", payload.getProductName());
        result.put("sku", payload.getSku());
        result.put("price", payload.getPrice());
        result.put("barcode", payload.getBarcode());
        result.put("qrPayload", payload.toJson());
        result.put("base64Image", base64);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "QR label preview"));
    }

    @PostMapping(value = "/pdf", produces = "application/pdf")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<byte[]> printPdf(
            @Valid @RequestBody QrLabelRequest request
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        byte[] pdfBytes = qrLabelService.generateQrLabelPdf(
                tenantId, request.getVariantId(), request.getQuantity(), request.getStyle());
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"qr-label.pdf\"")
                .header("Content-Type", "application/pdf")
                .body(pdfBytes);
    }

    @PostMapping(value = "/zpl", produces = "text/plain")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<String> printZpl(
            @Valid @RequestBody QrLabelRequest request
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        String zpl = qrLabelService.generateQrLabelZpl(
                tenantId, request.getVariantId(), request.getQuantity(), request.getStyle());
        return ResponseEntity.ok()
                .header("Content-Type", "text/plain")
                .body(zpl);
    }
}
