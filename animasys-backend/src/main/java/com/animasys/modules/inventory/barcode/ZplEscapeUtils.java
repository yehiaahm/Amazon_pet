package com.animasys.modules.inventory.barcode;

public final class ZplEscapeUtils {

    private ZplEscapeUtils() {}

    public static String escape(String text) {
        if (text == null) return "";
        return text
                .replace("~", "~~")
                .replace("^", "^^");
    }
}
