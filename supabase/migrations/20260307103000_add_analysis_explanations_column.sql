/*
  # Add AI/full explanation storage column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'analysis_explanations'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN analysis_explanations jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
