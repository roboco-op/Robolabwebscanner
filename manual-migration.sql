-- Add pdf_report column to scan_results if it doesn't exist
ALTER TABLE scan_results ADD COLUMN IF NOT EXISTS pdf_report TEXT;

-- Verify column was created
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'scan_results' AND column_name = 'pdf_report';
