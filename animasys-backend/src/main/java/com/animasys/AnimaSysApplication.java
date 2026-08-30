package com.animasys;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.Locale;

@SpringBootApplication
@EnableAsync
@EnableScheduling
@EnableCaching
public class AnimaSysApplication {
    static {
        // Root cause: String.format/NumberFormat/DecimalFormat calls that don't pass an
        // explicit Locale fall back to the JVM default locale. If that default is ever
        // an Arabic locale (e.g. the host OS is configured for ar_EG), ICU's default
        // numbering system for "ar" is Arabic-Indic digits, so %d/%f conversions used
        // throughout the codebase (SKU/PIN/label generation, error messages, KPIs)
        // would silently render ٠١٢٣٤٥٦٧٨٩ instead of 0-9. Pinning only the FORMAT
        // category keeps any locale-dependent display behavior untouched.
        Locale.setDefault(Locale.Category.FORMAT, Locale.US);

        java.io.File envFile = new java.io.File(".env");
        if (!envFile.exists()) {
            envFile = new java.io.File("animasys-backend/.env");
        }
        if (envFile.exists()) {
            try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(envFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) {
                        continue;
                    }
                    int eqIndex = line.indexOf('=');
                    if (eqIndex > 0) {
                        String key = line.substring(0, eqIndex).trim();
                        String value = line.substring(eqIndex + 1).trim();
                        // Only set if not already present in environment or system properties
                        if (System.getenv(key) == null && System.getProperty(key) == null) {
                            System.setProperty(key, value);
                        }
                    }
                }
            } catch (java.io.IOException e) {
                System.err.println("Warning: Failed to load local .env file: " + e.getMessage());
            }
        }
    }

    public static void main(String[] args) {
        SpringApplication.run(AnimaSysApplication.class, args);
    }
}
