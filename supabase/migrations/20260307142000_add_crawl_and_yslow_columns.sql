/*
  # Add crawl summaries and YSlow-compatible result columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'crawl_results'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN crawl_results jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'yslow_score'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN yslow_score integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'yslow_results'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN yslow_results jsonb;
  END IF;
END $$;
