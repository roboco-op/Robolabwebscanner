/*
  # Add OG Image Column

  1. Changes
    - Add `og_image` column to `scan_results` table to store the detected Open Graph image URL.

  2. Notes
    - Nullable to maintain compatibility with existing records.
    - Uses TEXT type to support long CDN URLs.
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
