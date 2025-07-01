/*
  # Add lobby game support to game_sessions table

  1. Schema Changes
    - Add `is_lobby_game` column to `game_sessions` table
    - Set default value to `false` for existing games
    - Update existing index to include the new column

  2. Data Migration
    - All existing games will be marked as non-lobby games (is_lobby_game = false)
    - New lobby games can be created with is_lobby_game = true

  3. Index Updates
    - Update the existing lobby games index to work with the new column
*/

-- Add the missing is_lobby_game column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'is_lobby_game'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN is_lobby_game boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Update the existing lobby games index to ensure it works properly
DROP INDEX IF EXISTS idx_lobby_games;
CREATE INDEX idx_lobby_games ON game_sessions (is_lobby_game, status, scheduled_start_time);