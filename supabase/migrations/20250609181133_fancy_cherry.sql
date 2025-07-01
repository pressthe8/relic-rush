-- Add new columns to game_sessions table
DO $$
BEGIN
  -- Add scheduled_start_time column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'scheduled_start_time'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN scheduled_start_time TIMESTAMPTZ;
  END IF;

  -- Add max_players column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'max_players'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN max_players INTEGER DEFAULT 6;
  END IF;

  -- Add is_lobby_game column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'is_lobby_game'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN is_lobby_game BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Update status constraint to include 'scheduled'
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
  
  -- Add the new constraint with 'scheduled' status
  ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check 
    CHECK (status IN ('scheduled', 'waiting', 'active', 'cancelled', 'completed'));
END $$;

-- Create indexes for lobby game queries
CREATE INDEX IF NOT EXISTS idx_lobby_games 
ON game_sessions(is_lobby_game, status, scheduled_start_time);

CREATE INDEX IF NOT EXISTS idx_session_player_count 
ON player_boards(session_id);

-- Generic function to generate treasure positions for any grid size
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
  max_attempts INTEGER := treasure_count * 10; -- Prevent infinite loops
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
  -- Generate treasure positions for 6x6 grid (5 treasures) using generic function
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
    
    -- Check if code already exists (using table alias to avoid ambiguity)
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
  
  RETURN new_game_id;
END;
$$ LANGUAGE plpgsql;

-- Function to process scheduled games (start or cancel based on timer/players)
CREATE OR REPLACE FUNCTION process_scheduled_games()
RETURNS INTEGER AS $$
DECLARE
  game_record RECORD;
  player_count INTEGER;
  games_processed INTEGER := 0;
BEGIN
  -- Process all scheduled lobby games
  FOR game_record IN 
    SELECT * FROM game_sessions 
    WHERE status = 'scheduled' 
    AND is_lobby_game = true
  LOOP
    -- Count players in this game
    SELECT COUNT(*) INTO player_count
    FROM player_boards 
    WHERE session_id = game_record.id;
    
    -- Check if game should start (max players OR time expired)
    IF player_count >= game_record.max_players OR 
       now() >= game_record.scheduled_start_time THEN
      
      IF player_count >= 2 THEN
        -- Start the game
        UPDATE game_sessions 
        SET status = 'active', start_time = now()
        WHERE id = game_record.id;
        
        RAISE NOTICE 'Started lobby game % with % players', game_record.id, player_count;
      ELSE
        -- Cancel the game (not enough players)
        UPDATE game_sessions 
        SET status = 'cancelled', end_time = now()
        WHERE id = game_record.id;
        
        -- Remove any remaining players from cancelled game
        DELETE FROM player_boards WHERE session_id = game_record.id;
        
        RAISE NOTICE 'Cancelled lobby game % with only % players', game_record.id, player_count;
      END IF;
      
      games_processed := games_processed + 1;
    END IF;
  END LOOP;
  
  RETURN games_processed;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure there's always a lobby game available
CREATE OR REPLACE FUNCTION ensure_lobby_game_available()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
BEGIN
  -- Check if there's a scheduled lobby game
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions 
    WHERE status = 'scheduled' 
    AND is_lobby_game = true
  ) THEN
    -- Create new lobby game
    SELECT create_lobby_game() INTO new_game_id;
    RAISE NOTICE 'Created new lobby game %', new_game_id;
    RETURN new_game_id;
  END IF;
  
  RETURN NULL;
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

-- Create initial lobby game if none exists
SELECT ensure_lobby_game_available();