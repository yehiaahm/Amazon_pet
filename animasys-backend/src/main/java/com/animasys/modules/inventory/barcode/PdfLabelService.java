package com.animasys.modules.inventory.barcode;

import com.animasys.core.exception.BusinessRuleException;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.List;

@Service
public class PdfLabelService {

    public static final int MAX_TOTAL_LABELS = 500;

    /** Shop name printed at the top of every label. */
    private static final String SHOP_NAME = "Amazon Pet Shop";

    private final BarcodeImageService imageService;
    private final LabelTemplateService templateService;

    public PdfLabelService(BarcodeImageService imageService, LabelTemplateService templateService) {
        this.imageService = imageService;
        this.templateService = templateService;
    }

    public byte[] generateLabelsPdf(List<LabelPrintData> labelList) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (labelList == null || labelList.isEmpty()) {
            return new byte[0];
        }

        int totalLabels = 0;
        for (LabelPrintData data : labelList) {
            totalLabels += Math.max(1, data.getQuantity());
        }
        if (totalLabels > MAX_TOTAL_LABELS) {
            throw new BusinessRuleException(
                    "Total label count (" + totalLabels + ") exceeds maximum of " + MAX_TOTAL_LABELS + " per PDF.");
        }

        LabelPrintData first = labelList.get(0);
        LabelLayout layout = templateService.getLayout(first.getStyle());

        float widthPoints  = (layout.getWidthMm()  / 25.4f) * 72f;
        float heightPoints = (layout.getHeightMm() / 25.4f) * 72f;

        Rectangle pageSize = new Rectangle(widthPoints, heightPoints);
        Document document = new Document(pageSize, 3f, 3f, 3f, 3f);

        try {
            PdfWriter.getInstance(document, baos);
            document.open();

            boolean isFirstPage = true;
            for (LabelPrintData data : labelList) {
                for (int qty = 0; qty < data.getQuantity(); qty++) {
                    if (!isFirstPage) {
                        document.newPage();
                    }
                    isFirstPage = false;

                    // ── 1. Shop header: "Amazon Pet Shop" ────────────────────
                    float shopFontSize = Math.max(5f, layout.getTitleFontSize() * 0.85f);
                    Font shopFont = new Font(Font.HELVETICA, shopFontSize, Font.BOLD);
                    Paragraph shopPara = new Paragraph(SHOP_NAME, shopFont);
                    shopPara.setAlignment(Element.ALIGN_CENTER);
                    shopPara.setSpacingAfter(1.5f);
                    document.add(shopPara);

                    // ── 2. Product name ───────────────────────────────────────
                    if (data.isIncludeName()) {
                        Font titleFont = new Font(Font.HELVETICA, layout.getTitleFontSize(), Font.BOLD);
                        Paragraph titlePara = new Paragraph(data.getProductName(), titleFont);
                        titlePara.setAlignment(Element.ALIGN_CENTER);
                        titlePara.setSpacingAfter(1f);
                        document.add(titlePara);
                    }

                    // ── 3. Price line (ج.م) ───────────────────────────────────
                    if (data.isIncludeSku() || data.isIncludePrice()) {
                        Font subFont = new Font(Font.HELVETICA, layout.getSkuFontSize(), Font.NORMAL);
                        StringBuilder rowText = new StringBuilder();
                        if (data.isIncludeSku()) {
                            rowText.append("SKU: ").append(data.getSku());
                        }
                        if (data.isIncludePrice()) {
                            if (rowText.length() > 0) rowText.append("  |  ");
                            // Format price in Egyptian Pounds (ج.م)
                            String priceStr = data.getPrice() != null
                                    ? String.format("%.2f", data.getPrice()) + " \u062c.\u0645"
                                    : "---";
                            rowText.append(priceStr);
                        }
                        Paragraph subPara = new Paragraph(rowText.toString(), subFont);
                        subPara.setAlignment(Element.ALIGN_CENTER);
                        subPara.setSpacingAfter(2f);
                        document.add(subPara);
                    }

                    // ── 4. Barcode image (linear stripes) ─────────────────────
                    int imgWidth  = 250;
                    int imgHeight = 60;
                    byte[] pngBytes = imageService.generatePNG(
                            data.getFormatName(),
                            data.getBarcode(),
                            imgWidth,
                            imgHeight
                    );

                    Image img = Image.getInstance(pngBytes);
                    img.setAlignment(Element.ALIGN_CENTER);

                    float maxImgHeight = heightPoints * 0.42f;
                    float maxImgWidth  = widthPoints  - 8f;
                    img.scaleToFit(maxImgWidth, maxImgHeight);
                    document.add(img);

                    // ── 5. Human-readable barcode number below the stripes ────
                    if (data.isIncludeBarcodeNumber()) {
                        Font codeFont = new Font(Font.COURIER, layout.getBarcodeNumberFontSize(), Font.NORMAL);
                        Paragraph codePara = new Paragraph(data.getBarcode(), codeFont);
                        codePara.setAlignment(Element.ALIGN_CENTER);
                        codePara.setSpacingBefore(1f);
                        document.add(codePara);
                    }
                }
            }

            document.close();
        } catch (BusinessRuleException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to compile labels PDF", e);
        }

        return baos.toByteArray();
    }
}
