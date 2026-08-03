-- Add optimistic locking version column to barcode_sequences
ALTER TABLE barcode_sequences ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
