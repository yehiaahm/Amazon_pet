package com.animasys.modules.inventory.barcode;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.TemplateStyle;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfWriter;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class QrLabelService {

    private static final int MAX_QR_LABELS_PDF = 200;

    private final ProductVariantRepository variantRepository;
    private final BarcodeImageService barcodeImageService;

    public QrPayload buildQrPayload(String tenantId, String variantId) {
        ProductVariant variant = variantRepository.findByIdWithProduct(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found"));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        String barcode = variant.getBarcode();
        if (barcode == null || barcode.isBlank()) {
            throw new BusinessRuleException("المنتج لا يحتوي على باركود. قم بتوليد باركود أولاً.");
        }

        return QrPayload.forProduct(
                tenantId,
                variantId,
                barcode,
                variant.getSku(),
                variant.getProduct().getName(),
                variant.getPrice() != null ? variant.getPrice().toPlainString() : "0"
        );
    }

    @Cacheable(value = "qrImages", key = "{#variantId, #width, #height}")
    public byte[] generateQrPng(String tenantId, String variantId, int width, int height) {
        QrPayload payload = buildQrPayload(tenantId, variantId);
        barcodeImageService.validateDimensions(width, height);
        try {
            BitMatrix matrix = new MultiFormatWriter().encode(
                    payload.toJson(), BarcodeFormat.QR_CODE, width, height);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", baos);
            return baos.toByteArray();
        } catch (WriterException | IOException e) {
            throw new RuntimeException("Failed to generate QR code image", e);
        }
    }

    public String generateQrPngBase64(String tenantId, String variantId, int width, int height) {
        byte[] png = generateQrPng(tenantId, variantId, width, height);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(png);
    }

    @Cacheable(value = "qrImagesSvg", key = "{#variantId, #width, #height}")
    public String generateQrSvg(String tenantId, String variantId, int width, int height) {
        QrPayload payload = buildQrPayload(tenantId, variantId);
        barcodeImageService.validateDimensions(width, height);
        try {
            BitMatrix matrix = new MultiFormatWriter().encode(
                    payload.toJson(), BarcodeFormat.QR_CODE, width, height);
            return bitMatrixToSvg(matrix, width, height);
        } catch (WriterException e) {
            throw new RuntimeException("Failed to generate QR code SVG", e);
        }
    }

    public byte[] generateQrLabelPdf(String tenantId, String variantId, int quantity, TemplateStyle style) {
        if (quantity < 1 || quantity > MAX_QR_LABELS_PDF) {
            throw new BusinessRuleException("Quantity must be between 1 and " + MAX_QR_LABELS_PDF);
        }

        QrPayload payload = buildQrPayload(tenantId, variantId);
        ProductVariant variant = variantRepository.findByIdWithProduct(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found"));

        float labelWidthMm = 50;
        float labelHeightMm = 60;
        float widthPoints = (labelWidthMm / 25.4f) * 72f;
        float heightPoints = (labelHeightMm / 25.4f) * 72f;

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Rectangle pageSize = new Rectangle(widthPoints, heightPoints);
        Document document = new Document(pageSize, 5f, 5f, 5f, 5f);

        try {
            PdfWriter.getInstance(document, baos);
            document.open();

            boolean isFirst = true;
            for (int i = 0; i < quantity; i++) {
                if (!isFirst) document.newPage();
                isFirst = false;

            Font storeFont = new Font(Font.HELVETICA, 8f, Font.BOLD);
            Paragraph storePara = new Paragraph("Amazon Pet Shop", storeFont);
            storePara.setAlignment(Element.ALIGN_CENTER);
            storePara.setSpacingAfter(2f);
            document.add(storePara);

            Font nameFont = new Font(Font.HELVETICA, 10f, Font.BOLD);
            Paragraph namePara = new Paragraph(variant.getProduct().getName(), nameFont);
            namePara.setAlignment(Element.ALIGN_CENTER);
            namePara.setSpacingAfter(2f);
            document.add(namePara);

            Font priceFont = new Font(Font.HELVETICA, 12f, Font.BOLD);
            String priceStr = "$" + (variant.getPrice() != null ? variant.getPrice().toPlainString() : "0");
            Paragraph pricePara = new Paragraph(priceStr, priceFont);
            pricePara.setAlignment(Element.ALIGN_CENTER);
            pricePara.setSpacingAfter(4f);
            document.add(pricePara);

            byte[] qrPng = generateQrPng(tenantId, variantId, 300, 300);
            Image qrImage = Image.getInstance(qrPng);
            float maxQrSize = heightPoints * 0.55f;
            qrImage.scaleToFit(maxQrSize, maxQrSize);
            qrImage.setAlignment(Element.ALIGN_CENTER);
            document.add(qrImage);
            }

            document.close();
        } catch (BusinessRuleException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate QR label PDF", e);
        }

        return baos.toByteArray();
    }

    public String generateQrLabelZpl(String tenantId, String variantId, int quantity, TemplateStyle style) {
        if (quantity < 1 || quantity > 500) {
            throw new BusinessRuleException("Quantity must be between 1 and 500");
        }

        QrPayload payload = buildQrPayload(tenantId, variantId);
        ProductVariant variant = variantRepository.findByIdWithProduct(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found"));

        String safeName = ZplEscapeUtils.escape(variant.getProduct().getName());
        String priceStr = "$" + (variant.getPrice() != null ? variant.getPrice().toPlainString() : "0");

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < quantity; i++) {
            sb.append("^XA\n");
            sb.append("^CI28\n");
            sb.append("^PW600\n");
            sb.append("^LL600\n");
            sb.append("^FO150,20^A0N,24,24^FDAmazon Pet Shop^FS\n");
            sb.append("^FO50,60^A0N,32,32^FD").append(safeName).append("^FS\n");
            sb.append("^FO200,110^A0N,36,36^FD").append(priceStr).append("^FS\n");
            sb.append("^FO100,170^BQN,2,5^FDMA,").append(payload.toJson()).append("^FS\n");
            sb.append("^XZ\n");
        }

        return sb.toString();
    }

    private String bitMatrixToSvg(BitMatrix matrix, int width, int height) {
        StringBuilder sb = new StringBuilder();
        sb.append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").append(width)
          .append("\" height=\"").append(height)
          .append("\" viewBox=\"0 0 ").append(width).append(" ").append(height).append("\">");
        sb.append("<rect width=\"100%\" height=\"100%\" fill=\"#FFFFFF\"/>");
        sb.append("<path d=\"");
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                if (matrix.get(x, y)) {
                    int startX = x;
                    while (x < width && matrix.get(x, y)) {
                        x++;
                    }
                    int rectWidth = x - startX;
                    sb.append("M").append(startX).append(" ").append(y)
                      .append("h").append(rectWidth).append("v1h-")
                      .append(rectWidth).append("z ");
                }
            }
        }
        sb.append("\" fill=\"#000000\"/>");
        sb.append("</svg>");
        return sb.toString();
    }
}
