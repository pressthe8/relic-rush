/*
  # Add sub_grid_hints column to player_boards table

  1. Changes
    - Add `sub_grid_hints` column to `player_boards` table
    - Column type: jsonb with default empty object
    - This enables the treasure hunt heat map feature for multiplayer games

  2. Notes
    - The column stores discovery counts for each sub-grid area
    - Used to show players where other players have found treasures
    - Default value ensures existing records are compatible
*/

-- Add the sub_grid_hints column to player_boards table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_boards' AND column_name = 'sub_grid_hints'
  ) THEN
    ALTER TABLE player_boards ADD COLUMN sub_grid_hints jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;