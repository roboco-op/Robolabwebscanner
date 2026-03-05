/*
  # Add premium scan metadata columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'scan_duration_ms'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN scan_duration_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'pages_scanned'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN pages_scanned integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'scan_depth'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN scan_depth integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'scan_environment'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN scan_environment text;
  END IF;
END $$;
