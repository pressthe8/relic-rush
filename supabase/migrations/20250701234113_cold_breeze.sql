/*
  # Complete Relic Rush Database Schema

  This migration creates the complete database schema for the Relic Rush treasure hunting game,
  including lobby system, multiplayer functionality, and all required functions.

  ## What this creates:
  1. New Tables
     - `game_sessions` - Stores multiplayer games with lobby system support
     - `player_boards` - Stores individual player game states and board data
  
  2. Security
     - Enable RLS on both tables
     - Add policies for public access (required for multiplayer functionality)
  
  3. Database Functions
     - `ensure_lobby_game_available()` - Ensures there's always a scheduled lobby game
     - `create_lobby_game()` - Creates new lobby games with proper settings
     - `process_scheduled_games()` - Processes scheduled games (start/cancel based on conditions)
     - `leave_lobby_game()` - Allows players to leave scheduled lobby games
     - `update_last_updated()` - Trigger function to update timestamps
     - `update_game_activity()` - Updates game activity on player board changes
     - `auto_process_lobby_games()` - Automatically processes lobby games when players join/leave
  
  4. Indexes
     - Performance indexes for game queries, player lookups, and lobby operations
  
  5. Constraints
     - Data validation for grid sizes, treasure counts, dig attempts
     - Player identification validation (either authenticated or mock player)
*/

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_size integer NOT NULL CHECK (grid_size = ANY (ARRAY[6, 9, 12])),
  treasure_count integer NOT NULL CHECK (treasure_count > 0),
  dig_attempts integer NOT NULL CHECK (dig_attempts > 0),
  game_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  treasure_positions jsonb NOT NULL,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  last_updated timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status = ANY (ARRAY['scheduled'::text, 'waiting'::text, 'active'::text, 'cancelled'::text, 'completed'::text])),
  created_at timestamptz DEFAULT now(),
  game_code text UNIQUE,
  all_discoveries jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_start_time timestamptz,
  max_players integer DEFAULT 6,
  is_lobby_game boolean DEFAULT false
);

-- Create player_boards table
CREATE TABLE IF NOT EXISTS player_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid,
  mock_player_id text,
  is_mock_player boolean NOT NULL DEFAULT false,
  session_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  board_state jsonb NOT NULL,
  remaining_digs integer NOT NULL CHECK (remaining_digs >= 0),
  score integer NOT NULL DEFAULT 0,
  discoveries jsonb NOT NULL DEFAULT '[]'::jsonb,
  joined_at timestamptz DEFAULT now(),
  sub_grid_hints jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT valid_player_identification CHECK (
    ((player_id IS NOT NULL) AND (mock_player_id IS NULL) AND (is_mock_player = false)) OR
    ((player_id IS NULL) AND (mock_player_id IS NOT NULL) AND (is_mock_player = true))
  )
);

-- Enable Row Level Security
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_boards ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (required for multiplayer)
CREATE POLICY "allow_all_game_sessions" ON game_sessions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_player_boards" ON player_boards FOR ALL TO public USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_code ON game_sessions(game_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_timeout ON game_sessions(status, created_at, last_updated);
CREATE INDEX IF NOT EXISTS idx_lobby_games ON game_sessions(is_lobby_game, status, scheduled_start_time);

CREATE INDEX IF NOT EXISTS idx_player_boards_mock_player_id ON player_boards(mock_player_id);
CREATE INDEX IF NOT EXISTS idx_player_boards_player_id ON player_boards(player_id);
CREATE INDEX IF NOT EXISTS idx_player_boards_session_id ON player_boards(session_id);
CREATE INDEX IF NOT EXISTS idx_session_player_count ON player_boards(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_player_per_session ON player_boards(session_id, COALESCE((player_id)::text, mock_player_id));

-- Create trigger function for updating last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for game_sessions last_updated
DROP TRIGGER IF EXISTS update_game_sessions_last_updated ON game_sessions;
CREATE TRIGGER update_game_sessions_last_updated
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_last_updated();

-- Function to create a new lobby game
CREATE OR REPLACE FUNCTION create_lobby_game()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
  treasure_positions JSONB;
  game_code TEXT;
  letters TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  numbers TEXT := '0123456789';
  code_exists BOOLEAN := true;
BEGIN
  -- Generate treasure positions for 6x6 grid (5 treasures)
  treasure_positions := '[]'::jsonb;
  
  -- Simple treasure generation for 6x6 grid
  treasure_positions := jsonb_build_array(
    jsonb_build_object('row', 1, 'col', 1),
    jsonb_build_object('row', 1, 'col', 4),
    jsonb_build_object('row', 3, 'col', 2),
    jsonb_build_object('row', 4, 'col', 4),
    jsonb_build_object('row', 5, 'col', 0)
  );
  
  -- Generate unique game code (3 letters + 3 numbers)
  WHILE code_exists LOOP
    game_code := '';
    -- Add 3 random letters
    FOR i IN 1..3 LOOP
      game_code := game_code || substr(letters, floor(random() * length(letters) + 1)::int, 1);
    END LOOP;
    -- Add 3 random numbers  
    FOR i IN 1..3 LOOP
      game_code := game_code || substr(numbers, floor(random() * length(numbers) + 1)::int, 1);
    END LOOP;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM game_sessions WHERE game_sessions.game_code = create_lobby_game.game_code) INTO code_exists;
  END LOOP;
  
  -- Create new scheduled game
  INSERT INTO game_sessions (
    grid_size, treasure_count, dig_attempts,
    treasure_positions, scheduled_start_time,
    status, is_lobby_game, max_players,
    game_settings, all_discoveries, game_code
  ) VALUES (
    6, 5, 10,
    treasure_positions, now() + INTERVAL '10 minutes',
    'scheduled', true, 6,
    '{"gridSize": 6, "treasureCount": 5, "digAttempts": 10}',
    '[]', game_code
  ) RETURNING id INTO new_game_id;
  
  RETURN new_game_id;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure lobby game is available
CREATE OR REPLACE FUNCTION ensure_lobby_game_available()
RETURNS VOID AS $$
BEGIN
  -- Check if there's a scheduled lobby game
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions 
    WHERE status = 'scheduled' 
    AND is_lobby_game = true
  ) THEN
    -- Create new lobby game
    PERFORM create_lobby_game();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to process scheduled games
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
      ELSE
        -- Cancel the game (not enough players)
        UPDATE game_sessions 
        SET status = 'cancelled', end_time = now()
        WHERE id = game_record.id;
        
        -- Remove any remaining players from cancelled game
        DELETE FROM player_boards WHERE session_id = game_record.id;
      END IF;
      
      games_processed := games_processed + 1;
    END IF;
  END LOOP;
  
  RETURN games_processed;
END;
$$ LANGUAGE plpgsql;

-- Function to handle player leaving lobby
CREATE OR REPLACE FUNCTION leave_lobby_game(
  p_session_id UUID,
  p_mock_player_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  game_status TEXT;
BEGIN
  -- Check if game is still scheduled
  SELECT status INTO game_status
  FROM game_sessions
  WHERE id = p_session_id AND is_lobby_game = true;
  
  -- Only allow leaving scheduled games
  IF game_status = 'scheduled' THEN
    DELETE FROM player_boards
    WHERE session_id = p_session_id 
    AND mock_player_id = p_mock_player_id;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to update game activity
CREATE OR REPLACE FUNCTION update_game_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the game session's last_updated timestamp when player boards change
  UPDATE game_sessions 
  SET last_updated = now() 
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating game activity
DROP TRIGGER IF EXISTS update_game_activity_trigger ON player_boards;
CREATE TRIGGER update_game_activity_trigger
  AFTER UPDATE ON player_boards
  FOR EACH ROW EXECUTE FUNCTION update_game_activity();

-- Function to automatically process lobby games when players join/leave
CREATE OR REPLACE FUNCTION auto_process_lobby_games()
RETURNS TRIGGER AS $$
BEGIN
  -- Process scheduled games when players join or leave
  PERFORM process_scheduled_games();
  
  -- Ensure there's always a lobby game available
  PERFORM ensure_lobby_game_available();
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-processing lobby games
DROP TRIGGER IF EXISTS auto_process_lobby_trigger ON player_boards;
CREATE TRIGGER auto_process_lobby_trigger
  AFTER INSERT OR DELETE ON player_boards
  FOR EACH ROW EXECUTE FUNCTION auto_process_lobby_games();

-- Create initial lobby game
SELECT ensure_lobby_game_available();