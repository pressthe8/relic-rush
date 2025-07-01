/*
  # Add game timeout functionality

  1. Changes
    - Add 'cancelled' status to game_sessions status constraint
    - Create function to automatically timeout stale games
    - Create function to update game activity when players make moves
    - Add trigger to track game activity
    - Add index for efficient timeout queries

  2. Timeout Policy
    - Waiting games: cancelled after 30 minutes
    - Active games: cancelled after 2 hours of inactivity
*/

-- Add cancelled status to the existing check constraint
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
  
  -- Add the new constraint with 'cancelled' status
  ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check 
    CHECK (status IN ('waiting', 'active', 'cancelled', 'completed'));
END $$;

-- Function to automatically timeout stale games
CREATE OR REPLACE FUNCTION timeout_stale_games()
RETURNS INTEGER AS $$
DECLARE
  waiting_count INTEGER := 0;
  active_count INTEGER := 0;
  total_count INTEGER := 0;
BEGIN
  -- Cancel games that have been waiting for more than 30 minutes
  UPDATE game_sessions 
  SET 
    status = 'cancelled',
    end_time = now(),
    last_updated = now()
  WHERE 
    status = 'waiting' 
    AND created_at < now() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS waiting_count = ROW_COUNT;
  
  -- Cancel active games that have been inactive for more than 2 hours
  UPDATE game_sessions 
  SET 
    status = 'cancelled',
    end_time = now(),
    last_updated = now()
  WHERE 
    status = 'active' 
    AND last_updated < now() - INTERVAL '2 hours';
  
  GET DIAGNOSTICS active_count = ROW_COUNT;
  
  -- Calculate total
  total_count := waiting_count + active_count;
  
  RETURN total_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update game session activity when players make moves
CREATE OR REPLACE FUNCTION update_game_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the game session's last_updated timestamp when a player makes a move
  UPDATE game_sessions 
  SET last_updated = now()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update game activity when player boards are updated
DROP TRIGGER IF EXISTS update_game_activity_trigger ON player_boards;
CREATE TRIGGER update_game_activity_trigger
  AFTER UPDATE ON player_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_game_activity();

-- Create an index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_timeout 
ON game_sessions(status, created_at, last_updated);