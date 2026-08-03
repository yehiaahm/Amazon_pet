package com.animasys.modules.inventory.barcode;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;

@Service
public class BarcodeImageService {

    public static final int MAX_DIMENSION = 2000;
    public static final int MIN_DIMENSION = 50;

    public void validateDimensions(int width, int height) {
        if (width < MIN_DIMENSION || width > MAX_DIMENSION) {
            throw new IllegalArgumentException(
                    "Width must be between " + MIN_DIMENSION + " and " + MAX_DIMENSION + " pixels");
        }
        if (height < MIN_DIMENSION || height > MAX_DIMENSION) {
            throw new IllegalArgumentException(
                    "Height must be between " + MIN_DIMENSION + " and " + MAX_DIMENSION + " pixels");
        }
    }

    @Cacheable(value = "barcodeImages", key = "{#formatName, #content, #width, #height}")
    public byte[] generatePNG(String formatName, String content, int width, int height) {
        validateDimensions(width, height);
        try {
            BarcodeFormat format = resolveBarcodeFormat(formatName);
            MultiFormatWriter writer = new MultiFormatWriter();
            BitMatrix bitMatrix = writer.encode(content, format, width, height);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", baos);
            return baos.toByteArray();
        } catch (WriterException | IOException e) {
            throw new RuntimeException("Failed to generate PNG barcode image", e);
        }
    }

    @Cacheable(value = "barcodeImagesSvg", key = "{#formatName, #content, #width, #height}")
    public String generateSVG(String formatName, String content, int width, int height) {
        validateDimensions(width, height);
        try {
            BarcodeFormat format = resolveBarcodeFormat(formatName);
            MultiFormatWriter writer = new MultiFormatWriter();
            BitMatrix bitMatrix = writer.encode(content, format, width, height);
            return bitMatrixToSVG(bitMatrix);
        } catch (WriterException e) {
            throw new RuntimeException("Failed to generate SVG barcode image", e);
        }
    }

    public String generatePNGAsBase64(String formatName, String content, int width, int height) {
        byte[] pngBytes = generatePNG(formatName, content, width, height);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(pngBytes);
    }

    @CacheEvict(value = {"barcodeImages", "barcodeImagesSvg"}, key = "{#formatName, #content, #width, #height}")
    public void evictCache(String formatName, String content, int width, int height) {
    }

    private BarcodeFormat resolveBarcodeFormat(String name) {
        if (name == null) return BarcodeFormat.CODE_128;
        return switch (name.toUpperCase().trim()) {
            case "EAN_13", "EAN13" -> BarcodeFormat.EAN_13;
            case "UPC_A", "UPCA" -> BarcodeFormat.UPC_A;
            case "QR_CODE", "QR" -> BarcodeFormat.QR_CODE;
            default -> BarcodeFormat.CODE_128;
        };
    }

    private String bitMatrixToSVG(BitMatrix matrix) {
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        StringBuilder sb = new StringBuilder();
        sb.append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").append(width).append("\" height=\"").append(height).append("\" viewBox=\"0 0 ").append(width).append(" ").append(height).append("\">");
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
                    sb.append("M").append(startX).append(" ").append(y).append("h").append(rectWidth).append("v1h-").append(rectWidth).append("z ");
                }
            }
        }
        sb.append("\" fill=\"#000000\"/>");
        sb.append("</svg>");
        return sb.toString();
    }
}
