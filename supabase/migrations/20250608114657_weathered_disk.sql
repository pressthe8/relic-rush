/*
  # Add central discoveries log to game sessions

  1. Changes
    - Add `all_discoveries` column to `game_sessions` table
    - This will store all player discoveries in one central location
    - Remove individual `discoveries` from `player_boards` (keep for backward compatibility initially)
    - Simplifies hint calculation by having single source of truth

  2. Structure
    - all_discoveries: jsonb array of discovery objects
    - Each discovery: { playerId, row, col, points, timestamp, discoveryOrder }
    - Enables efficient hint calculation without cross-table queries
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