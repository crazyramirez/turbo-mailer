-- Migration 0006_sour_talon was attempting to add 'agency' and 'role' columns.
-- Since these columns already exist in the database, we leave this migration empty
-- to mark it as "completed" in the Drizzle metadata table.
SELECT 1;