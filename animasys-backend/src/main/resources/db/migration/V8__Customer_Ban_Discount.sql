-- CRM: persist ban status and promotional discount %
ALTER TABLE customers ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN discount INT NOT NULL DEFAULT 0;
