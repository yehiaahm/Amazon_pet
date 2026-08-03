package com.animasys.modules.inventory.barcode;

import com.animasys.modules.inventory.domain.TemplateStyle;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;

@Service
public class ZplLabelService {

    private static final String SHOP_NAME = "Amazon Pet Shop";

    public String generateZpl(
            String name,
            String sku,
            BigDecimal price,
            String barcode,
            String formatName,
            TemplateStyle style,
            boolean includeName,
            boolean includeSku,
            boolean includePrice,
            boolean includeBarcodeNumber
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("^XA\n");
        sb.append("^CI28\n");   // UTF-8 character set

        String safeName  = ZplEscapeUtils.escape(name);
        String safeSku   = ZplEscapeUtils.escape(sku);
        String priceStr  = (price != null) ? String.format("%.2f", price) + " EGP" : "---";

        if (style == TemplateStyle.PET_SHOP_MEDIUM) {
            // 50 x 25 mm  →  400 x 200 dots @ 203 dpi
            sb.append("^PW400\n");
            sb.append("^LL200\n");
            // Shop name header
            sb.append("^FO20,8^A0N,20,20^FD").append(SHOP_NAME).append("^FS\n");
            sb.append("^FO20,30^GB360,1,1^FS\n");  // separator line
            if (includeName) {
                sb.append("^FO20,38^A0N,22,22^FD").append(safeName).append("^FS\n");
            }
            if (includeSku || includePrice) {
                String subText = buildSubText(safeSku, priceStr, includeSku, includePrice);
                sb.append("^FO20,68^A0N,18,18^FD").append(ZplEscapeUtils.escape(subText)).append("^FS\n");
            }
            sb.append("^FO20,92^BY2^BCN,65,").append(includeBarcodeNumber ? "Y" : "N").append(",N,N^FD").append(barcode).append("^FS\n");

        } else if (style == TemplateStyle.SHELF_LABEL) {
            // 60 x 40 mm  →  480 x 320 dots
            sb.append("^PW480\n");
            sb.append("^LL320\n");
            sb.append("^FO20,10^A0N,24,24^FD").append(SHOP_NAME).append("^FS\n");
            sb.append("^FO20,36^GB440,1,1^FS\n");
            if (includeName) {
                sb.append("^FO20,45^A0N,30,30^FD").append(safeName).append("^FS\n");
            }
            if (includePrice) {
                sb.append("^FO20,82^A0N,36,36^FD").append(priceStr).append("^FS\n");
            }
            if (includeSku) {
                sb.append("^FO250,88^A0N,18,18^FDSKU: ").append(safeSku).append("^FS\n");
            }
            sb.append("^FO20,140^BY2^BCN,100,").append(includeBarcodeNumber ? "Y" : "N").append(",N,N^FD").append(barcode).append("^FS\n");

        } else if (style == TemplateStyle.PRICE_TAG) {
            // 40 x 20 mm  →  320 x 160 dots
            sb.append("^PW320\n");
            sb.append("^LL160\n");
            sb.append("^FO15,5^A0N,16,16^FD").append(SHOP_NAME).append("^FS\n");
            sb.append("^FO15,23^GB290,1,1^FS\n");
            if (includePrice) {
                sb.append("^FO15,30^A0N,32,32^FD").append(priceStr).append("^FS\n");
            }
            if (includeName) {
                sb.append("^FO15,68^A0N,16,16^FD").append(safeName).append("^FS\n");
            }
            sb.append("^FO15,92^BY1^BCN,40,").append(includeBarcodeNumber ? "Y" : "N").append(",N,N^FD").append(barcode).append("^FS\n");

        } else if (style == TemplateStyle.WAREHOUSE_LABEL) {
            // 100 x 50 mm  →  800 x 400 dots
            sb.append("^PW800\n");
            sb.append("^LL400\n");
            sb.append("^FO30,12^A0N,30,30^FD").append(SHOP_NAME).append("^FS\n");
            sb.append("^FO30,45^GB740,1,2^FS\n");
            if (includeName) {
                sb.append("^FO30,55^A0N,42,42^FD").append(safeName).append("^FS\n");
            }
            if (includeSku) {
                sb.append("^FO30,105^A0N,28,28^FDSKU: ").append(safeSku).append("^FS\n");
            }
            if (includePrice) {
                sb.append("^FO500,105^A0N,28,28^FD").append(priceStr).append("^FS\n");
            }
            sb.append("^FO30,155^BY3^BCN,150,").append(includeBarcodeNumber ? "Y" : "N").append(",N,N^FD").append(barcode).append("^FS\n");

        } else {
            // Default: PET_SHOP_SMALL — 40 x 20 mm  →  320 x 160 dots
            sb.append("^PW320\n");
            sb.append("^LL160\n");
            sb.append("^FO15,5^A0N,16,16^FD").append(SHOP_NAME).append("^FS\n");
            sb.append("^FO15,23^GB290,1,1^FS\n");
            if (includeName) {
                sb.append("^FO15,30^A0N,18,18^FD").append(safeName).append("^FS\n");
            }
            if (includeSku || includePrice) {
                String subText = buildSubText(safeSku, priceStr, includeSku, includePrice);
                sb.append("^FO15,52^A0N,14,14^FD").append(ZplEscapeUtils.escape(subText)).append("^FS\n");
            }
            sb.append("^FO15,70^BY2^BCN,50,").append(includeBarcodeNumber ? "Y" : "N").append(",N,N^FD").append(barcode).append("^FS\n");
        }

        sb.append("^XZ");
        return sb.toString();
    }

    private String buildSubText(String safeSku, String priceStr, boolean includeSku, boolean includePrice) {
        StringBuilder sub = new StringBuilder();
        if (includeSku)   sub.append("SKU: ").append(safeSku);
        if (includePrice) {
            if (sub.length() > 0) sub.append("  ");
            sub.append(priceStr);
        }
        return sub.toString();
    }
}
