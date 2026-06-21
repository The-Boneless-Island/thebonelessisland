-- Marker migration: nuggies transaction reason copy backfill runs at API boot
-- via backfillNuggiesTransactionReasons() (idempotent, tracked in server_settings).

SELECT 1;
