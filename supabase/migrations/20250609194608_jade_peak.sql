/*
  # Fix lobby system database setup

  1. Database Schema Check
    - Ensure all required columns exist for lobby system
    - Add missing is_lobby_game column if needed
    - Verify all constraints and indexes are properly set

  2. Initial Data Setup
    - Create initial lobby game to populate the system
    - Ensure proper game state for testing

  3. Function Verification
    - Test that all lobby functions work correctly
    - Ensure no errors when calling lobby management functions
*/

-- Ensure is_lobby_game column exists with proper default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'is_lobby_game'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN is_lobby_game BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Added is_lobby_game column to game_sessions table';
  ELSE
    RAISE NOTICE 'is_lobby_game column already exists';
  END IF;
END $$;

-- Ensure scheduled_start_time column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'scheduled_start_time'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN scheduled_start_time TIMESTAMPTZ;
    RAISE NOTICE 'Added scheduled_start_time column to game_sessions table';
  ELSE
    RAISE NOTICE 'scheduled_start_time column already exists';
  END IF;
END $$;

-- Ensure max_players column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'max_players'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN max_players INTEGER DEFAULT 6;
    RAISE NOTICE 'Added max_players column to game_sessions table';
  ELSE
    RAISE NOTICE 'max_players column already exists';
  END IF;
END $$;

-- Update status constraint to include 'scheduled' if not already present
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
  
  -- Add the new constraint with all required statuses
  ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check 
    CHECK (status IN ('scheduled', 'waiting', 'active', 'cancelled', 'completed'));
    
  RAISE NOTICE 'Updated status constraint to include scheduled status';
END $$;

-- Ensure all required indexes exist
CREATE INDEX IF NOT EXISTS idx_lobby_games 
ON game_sessions(is_lobby_game, status, scheduled_start_time);

CREATE INDEX IF NOT EXISTS idx_session_player_count 
ON player_boards(session_id);

-- Verify and recreate lobby management functions if needed
CREATE OR REPLACE FUNCTION generate_treasure_positions(grid_size INTEGER, treasure_count INTEGER)
RETURNS JSONB AS $$
DECLARE
  positions JSONB := '[]'::JSONB;
  used_positions TEXT[] := '{}';
  row_pos INTEGER;
  col_pos INTEGER;
  position_key TEXT;
  position_obj JSONB;
  i INTEGER := 0;
  max_attempts INTEGER := treasure_count * 10;
  attempts INTEGER := 0;
BEGIN
  -- Validate inputs
  IF grid_size <= 0 OR treasure_count <= 0 THEN
    RAISE EXCEPTION 'Grid size and treasure count must be positive integers';
  END IF;
  
  IF treasure_count > (grid_size * grid_size) THEN
    RAISE EXCEPTION 'Treasure count (%) cannot exceed grid capacity (%)', treasure_count, (grid_size * grid_size);
  END IF;
  
  -- Generate random treasure positions
  WHILE i < treasure_count AND attempts < max_attempts LOOP
    row_pos := floor(random() * grid_size)::INTEGER;
    col_pos := floor(random() * grid_size)::INTEGER;
    position_key := row_pos || ',' || col_pos;
    attempts := attempts + 1;
    
    -- Check if position is already used
    IF NOT (position_key = ANY(used_positions)) THEN
      position_obj := json_build_object('row', row_pos, 'col', col_pos)::JSONB;
      positions := positions || position_obj;
      used_positions := array_append(used_positions, position_key);
      i := i + 1;
    END IF;
  END LOOP;
  
  -- Ensure we generated the requested number of positions
  IF i < treasure_count THEN
    RAISE EXCEPTION 'Failed to generate % unique treasure positions for %x% grid after % attempts', 
      treasure_count, grid_size, grid_size, max_attempts;
  END IF;
  
  RETURN positions;
END;
$$ LANGUAGE plpgsql;

-- Function to create a new lobby game
CREATE OR REPLACE FUNCTION create_lobby_game()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
  treasure_positions JSONB;
  generated_code TEXT;
  code_exists BOOLEAN;
BEGIN
  -- Generate treasure positions for 6x6 grid (5 treasures)
  treasure_positions := generate_treasure_positions(6, 5);
  
  -- Generate unique game code
  LOOP
    generated_code := (
      SELECT string_agg(
        CASE WHEN i <= 3 
        THEN chr(65 + floor(random() * 26)::int)
        ELSE chr(48 + floor(random() * 10)::int)
        END, ''
      )
      FROM generate_series(1, 6) i
    );
    
    -- Check if code already exists
    SELECT EXISTS(
      SELECT 1 FROM game_sessions gs WHERE gs.game_code = generated_code
    ) INTO code_exists;
    
    -- If code doesn't exist, we can use it
    IF NOT code_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Create new scheduled lobby game
  INSERT INTO game_sessions (
    game_code,
    grid_size, 
    treasure_count, 
    dig_attempts,
    treasure_positions, 
    scheduled_start_time,
    status, 
    is_lobby_game, 
    max_players,
    game_settings, 
    all_discoveries
  ) VALUES (
    generated_code,
    6, 5, 10,
    treasure_positions, 
    now() + INTERVAL '10 minutes',
    'scheduled', 
    true, 
    6,
    '{"gridSize": 6, "treasureCount": 5, "digAttempts": 10, "gameMode": "multiplayer"}',
    '[]'
  ) RETURNING id INTO new_game_id;
  
  RAISE NOTICE 'Created new lobby game % with code %', new_game_id, generated_code;
  RETURN new_game_id;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure there's always a lobby game available
CREATE OR REPLACE FUNCTION ensure_lobby_game_available()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
  existing_count INTEGER;
BEGIN
  -- Check if there's a scheduled lobby game
  SELECT COUNT(*) INTO existing_count
  FROM game_sessions 
  WHERE status = 'scheduled' 
  AND is_lobby_game = true;
  
  IF existing_count = 0 THEN
    -- Create new lobby game
    SELECT create_lobby_game() INTO new_game_id;
    RAISE NOTICE 'Created new lobby game % (no existing scheduled games)', new_game_id;
    RETURN new_game_id;
  ELSE
    RAISE NOTICE 'Lobby game already exists (% scheduled games found)', existing_count;
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to handle player leaving lobby game
CREATE OR REPLACE FUNCTION leave_lobby_game(
  p_session_id UUID,
  p_mock_player_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  game_status TEXT;
  player_count INTEGER;
BEGIN
  -- Check if game is still scheduled
  SELECT status INTO game_status
  FROM game_sessions
  WHERE id = p_session_id AND is_lobby_game = true;
  
  -- Only allow leaving scheduled games
  IF game_status = 'scheduled' THEN
    -- Remove player from game
    DELETE FROM player_boards
    WHERE session_id = p_session_id 
    AND mock_player_id = p_mock_player_id;
    
    -- Check remaining player count
    SELECT COUNT(*) INTO player_count
    FROM player_boards
    WHERE session_id = p_session_id;
    
    RAISE NOTICE 'Player % left lobby game %, % players remaining', 
      p_mock_player_id, p_session_id, player_count;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Clean up any existing lobby games that might be in a bad state
DELETE FROM game_sessions 
WHERE is_lobby_game = true 
AND status IN ('waiting', 'cancelled')
AND created_at < now() - INTERVAL '1 hour';

-- Create initial lobby game for testing
SELECT ensure_lobby_game_available();

-- Verify the setup
DO $$
DECLARE
  lobby_count INTEGER;
  game_record RECORD;
BEGIN
  -- Count scheduled lobby games
  SELECT COUNT(*) INTO lobby_count
  FROM game_sessions 
  WHERE status = 'scheduled' 
  AND is_lobby_game = true;
  
  RAISE NOTICE 'Found % scheduled lobby games', lobby_count;
  
  -- Show details of the lobby game
  FOR game_record IN 
    SELECT id, game_code, scheduled_start_time, status, is_lobby_game
    FROM game_sessions 
    WHERE is_lobby_game = true 
    ORDER BY created_at DESC 
    LIMIT 1
  LOOP
    RAISE NOTICE 'Latest lobby game: ID=%, Code=%, Start Time=%, Status=%, Is Lobby=%', 
      game_record.id, game_record.game_code, game_record.scheduled_start_time, 
      game_record.status, game_record.is_lobby_game;
  END LOOP;
END $$;