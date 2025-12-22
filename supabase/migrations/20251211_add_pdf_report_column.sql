/*
  # Add PDF Report Column

  1. Changes
    - Add `pdf_report` column to `scan_results` table to store pre-generated PDF as base64
  
  2. Notes
    - Column is nullable to maintain compatibility with existing records
    - Uses TEXT type to store base64-encoded PDF data
    - PDF is generated asynchronously during scan completion via generate-pdf function
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'pdf_report'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN pdf_report TEXT;
  END IF;
END $$;
