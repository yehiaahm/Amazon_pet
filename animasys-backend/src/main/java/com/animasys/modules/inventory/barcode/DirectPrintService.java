package com.animasys.modules.inventory.barcode;

import com.animasys.core.exception.BusinessRuleException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.print.*;
import javax.print.attribute.HashPrintRequestAttributeSet;
import javax.print.attribute.PrintRequestAttributeSet;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Sends raw ZPL bytes directly to a named printer via the Java PrintService API.
 * Works for printers connected via USB, Network, or shared printer on Windows/Linux.
 */
@Service
public class DirectPrintService {

    private static final Logger log = LoggerFactory.getLogger(DirectPrintService.class);

    /**
     * Returns the names of all printers currently available on the OS.
     */
    public List<String> listPrinters() {
        PrintService[] services = PrintServiceLookup.lookupPrintServices(null, null);
        List<String> names = new ArrayList<>();
        for (PrintService service : services) {
            names.add(service.getName());
        }
        return names;
    }

    /**
     * Sends raw ZPL text directly to the named printer.
     *
     * @param printerName the exact name of the printer as returned by {@link #listPrinters()}
     * @param zplContent  the ZPL string to send
     * @throws BusinessRuleException if the printer is not found or printing fails
     */
    public void printRaw(String printerName, String zplContent) {
        if (printerName == null || printerName.isBlank()) {
            throw new BusinessRuleException("اسم الطابعة مطلوب");
        }
        if (zplContent == null || zplContent.isBlank()) {
            throw new BusinessRuleException("لا يوجد محتوى ZPL للطباعة");
        }

        PrintService[] services = PrintServiceLookup.lookupPrintServices(null, null);
        PrintService target = null;
        for (PrintService service : services) {
            if (service.getName().equalsIgnoreCase(printerName.trim())) {
                target = service;
                break;
            }
        }

        if (target == null) {
            // Try partial/contains match as fallback
            for (PrintService service : services) {
                if (service.getName().toLowerCase().contains(printerName.trim().toLowerCase())) {
                    target = service;
                    break;
                }
            }
        }

        if (target == null) {
            throw new BusinessRuleException(
                    "الطابعة غير موجودة: \"" + printerName + "\". " +
                    "الطابعات المتاحة: " + listPrinters()
            );
        }

        // Use the AUTOSENSE flavour — this sends raw bytes as-is without any conversion.
        DocFlavor flavor = DocFlavor.BYTE_ARRAY.AUTOSENSE;

        if (!target.isDocFlavorSupported(flavor)) {
            // Fallback: use input stream autosense
            flavor = DocFlavor.INPUT_STREAM.AUTOSENSE;
        }

        try {
            byte[] zplBytes = zplContent.getBytes(StandardCharsets.US_ASCII);
            DocPrintJob job = target.createPrintJob();
            PrintRequestAttributeSet attrs = new HashPrintRequestAttributeSet();

            Doc doc;
            if (flavor == DocFlavor.BYTE_ARRAY.AUTOSENSE) {
                doc = new SimpleDoc(zplBytes, flavor, null);
            } else {
                InputStream stream = new ByteArrayInputStream(zplBytes);
                doc = new SimpleDoc(stream, flavor, null);
            }

            job.print(doc, attrs);
            log.info("ZPL sent directly to printer '{}' ({} bytes)", target.getName(), zplBytes.length);

        } catch (PrintException e) {
            log.error("Direct print failed for printer '{}': {}", printerName, e.getMessage(), e);
            throw new BusinessRuleException("فشل الإرسال للطابعة: " + e.getMessage());
        }
    }
}
