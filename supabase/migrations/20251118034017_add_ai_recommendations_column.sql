/*
  # Add AI Recommendations Column

  1. Changes
    - Add `ai_recommendations` column to `scan_results` table to store AI-generated recommendations array
  
  2. Notes
    - Column is nullable to maintain compatibility with existing records
    - Uses JSONB type for flexible array storage
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scan_results' AND column_name = 'ai_recommendations'
  ) THEN
    ALTER TABLE scan_results ADD COLUMN ai_recommendations jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;