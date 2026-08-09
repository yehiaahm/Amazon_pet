-- The bulk Excel/CSV product import feature has been removed from the system.
-- Drop child table first (FK to import_sessions).
DROP TABLE IF EXISTS import_session_items;
DROP TABLE IF EXISTS import_sessions;
