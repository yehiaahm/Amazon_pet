package com.animasys.core.exception;

public class InsufficientStockException extends BusinessRuleException {
    public InsufficientStockException(String message) {
        super(message);
    }

    public InsufficientStockException(String productVariantId, int requested, int available) {
        super(String.format("Insufficient stock for product variant [%s]. Requested: %d, Available in active batches: %d", 
                productVariantId, requested, available));
    }
}
