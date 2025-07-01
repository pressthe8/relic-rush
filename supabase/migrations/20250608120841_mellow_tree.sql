/*
  # Add central discoveries log to game sessions

  1. Changes
    - Add `all_discoveries` column to `game_sessions` table
    - Column type: jsonb with default empty array
    - This becomes the single source of truth for all discoveries across all players

  2. Benefits
    - Eliminates complex cross-table queries
    - Provides single source of truth for hint calculations
    - Simplifies discovery gap logic
*/

-- Add all_discoveries column to game_sessions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'all_discoveries'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN all_discoveries jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;