-- Cleanup legacy PDF schema fields
ALTER TABLE scan_results DROP COLUMN IF EXISTS pdf_report;
ALTER TABLE email_submissions DROP COLUMN IF EXISTS pdf_sent;

-- Ensure current preview image source column exists
ALTER TABLE scan_results ADD COLUMN IF NOT EXISTS preview_image_source TEXT;
