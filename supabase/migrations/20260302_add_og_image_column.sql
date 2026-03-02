/*
  # Add og_image Column

  1. Changes
    - Add `og_image` column to `scan_results` table to store the Open Graph image URL
      extracted from the scanned page.

  2. Notes
    - Column is nullable for backward compatibility with existing records.
    - Uses TEXT type to store the full image URL (absolute or resolved).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'og_image'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN og_image TEXT;
  END IF;
END $$;
