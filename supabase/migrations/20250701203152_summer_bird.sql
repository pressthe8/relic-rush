-- =====================================================
-- COMPLETE FRESH SUPABASE DATABASE SETUP
-- =====================================================
-- This migration sets up the entire database from scratch
-- Handles existing objects by dropping and recreating them

-- =====================================================
-- STEP 1: CLEAN UP EXISTING OBJECTS
-- =====================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_game_sessions_last_updated ON game_sessions;
DROP TRIGGER IF EXISTS update_game_activity_trigger ON player_boards;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_last_updated() CASCADE;
DROP FUNCTION IF EXISTS update_game_activity() CASCADE;
DROP FUNCTION IF EXISTS generate_treasure_positions(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS generate_unique_game_code() CASCADE;
DROP FUNCTION IF EXISTS create_lobby_game() CASCADE;
DROP FUNCTION IF EXISTS process_scheduled_games() CASCADE;
DROP FUNCTION IF EXISTS ensure_lobby_game_available() CASCADE;
DROP FUNCTION IF EXISTS leave_lobby_game(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS timeout_stale_games() CASCADE;

-- Drop existing policies
DROP POLICY IF EXISTS "public_read_game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "public_create_game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "public_update_game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "anon_read_scheduled_lobby_games" ON game_sessions;
DROP POLICY IF EXISTS "anon_read_active_lobby_games" ON game_sessions;
DROP POLICY IF EXISTS "authenticated_manage_game_sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can read game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can create game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can update game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Authenticated users can read their game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anonymous users can read mock game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anonymous users can create mock game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Users can update their game sessions" ON game_sessions;

DROP POLICY IF EXISTS "Anyone can read player boards" ON player_boards;
DROP POLICY IF EXISTS "Anyone can create player boards" ON player_boards;
DROP POLICY IF EXISTS "Anyone can update player boards" ON player_boards;
DROP POLICY IF EXISTS "Anyone can delete player boards" ON player_boards;
DROP POLICY IF EXISTS "Anonymous users can manage mock player boards" ON player_boards;
DROP POLICY IF EXISTS "Allow anon read lobby game player boards" ON player_boards;
DROP POLICY IF EXISTS "Allow anon insert into lobby games" ON player_boards;
DROP POLICY IF EXISTS "Allow anon update own lobby game boards" ON player_boards;
DROP POLICY IF EXISTS "Allow anon delete own lobby game boards" ON player_boards;
DROP POLICY IF EXISTS "Authenticated users can manage their own boards" ON player_boards;
DROP POLICY IF EXISTS "Users can read other players' boards in same session" ON player_boards;
DROP POLICY IF EXISTS "Users can read boards in their sessions" ON player_boards;
DROP POLICY IF EXISTS "Users can read boards in same session" ON player_boards;

-- =====================================================
-- STEP 2: CREATE OR UPDATE CORE TABLES
-- =====================================================

-- Create or update game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code TEXT,
  grid_size INTEGER NOT NULL,
  treasure_count INTEGER NOT NULL,
  dig_attempts INTEGER NOT NULL,
  game_settings JSONB NOT NULL DEFAULT '{}',
  treasure_positions JSONB NOT NULL,
  all_discoveries JSONB NOT NULL DEFAULT '[]',
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now(),
  scheduled_start_time TIMESTAMPTZ,
  max_players INTEGER DEFAULT 6,
  is_lobby_game BOOLEAN DEFAULT false
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add game_code column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'game_code'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN game_code TEXT;
  END IF;

  -- Add all_discoveries column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'all_discoveries'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN all_discoveries JSONB DEFAULT '[]';
  END IF;

  -- Add scheduled_start_time column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'scheduled_start_time'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN scheduled_start_time TIMESTAMPTZ;
  END IF;

  -- Add max_players column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'max_players'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN max_players INTEGER DEFAULT 6;
  END IF;

  -- Add is_lobby_game column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'is_lobby_game'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN is_lobby_game BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create or update player_boards table
CREATE TABLE IF NOT EXISTS player_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID,
  mock_player_id TEXT,
  is_mock_player BOOLEAN NOT NULL DEFAULT false,
  session_id UUID NOT NULL,
  board_state JSONB NOT NULL,
  remaining_digs INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  discoveries JSONB NOT NULL DEFAULT '[]',
  sub_grid_hints JSONB DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add sub_grid_hints column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_boards' AND column_name = 'sub_grid_hints'
  ) THEN
    ALTER TABLE player_boards ADD COLUMN sub_grid_hints JSONB DEFAULT '{}';
  END IF;
END $$;

-- =====================================================
-- STEP 3: ADD CONSTRAINTS AND FOREIGN KEYS
-- =====================================================

-- Drop existing constraints to avoid conflicts
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_grid_size_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_treasure_count_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_dig_attempts_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_code_key;

ALTER TABLE player_boards DROP CONSTRAINT IF EXISTS player_boards_remaining_digs_check;
ALTER TABLE player_boards DROP CONSTRAINT IF EXISTS valid_player_identification;
ALTER TABLE player_boards DROP CONSTRAINT IF EXISTS player_boards_session_id_fkey;

-- Add constraints to game_sessions
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_grid_size_check 
  CHECK (grid_size IN (6, 9, 12));
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_treasure_count_check 
  CHECK (treasure_count > 0);
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_dig_attempts_check 
  CHECK (dig_attempts > 0);
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check 
  CHECK (status IN ('scheduled', 'waiting', 'active', 'cancelled', 'completed'));
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_game_code_key 
  UNIQUE (game_code);

-- Add constraints to player_boards
ALTER TABLE player_boards ADD CONSTRAINT player_boards_remaining_digs_check 
  CHECK (remaining_digs >= 0);
ALTER TABLE player_boards ADD CONSTRAINT valid_player_identification CHECK (
  (player_id IS NOT NULL AND mock_player_id IS NULL AND is_mock_player = false) OR
  (player_id IS NULL AND mock_player_id IS NOT NULL AND is_mock_player = true)
);
ALTER TABLE player_boards ADD CONSTRAINT player_boards_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;

-- =====================================================
-- STEP 4: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Drop existing indexes to avoid conflicts
DROP INDEX IF EXISTS idx_game_sessions_status;
DROP INDEX IF EXISTS idx_game_sessions_created_at;
DROP INDEX IF EXISTS idx_game_sessions_game_code;
DROP INDEX IF EXISTS idx_game_sessions_timeout;
DROP INDEX IF EXISTS idx_lobby_games;
DROP INDEX IF EXISTS idx_player_boards_session_id;
DROP INDEX IF EXISTS idx_player_boards_player_id;
DROP INDEX IF EXISTS idx_player_boards_mock_player_id;
DROP INDEX IF EXISTS idx_session_player_count;
DROP INDEX IF EXISTS idx_unique_player_per_session;

-- Create indexes
CREATE INDEX idx_game_sessions_status ON game_sessions(status);
CREATE INDEX idx_game_sessions_created_at ON game_sessions(created_at);
CREATE INDEX idx_game_sessions_game_code ON game_sessions(game_code);
CREATE INDEX idx_game_sessions_timeout ON game_sessions(status, created_at, last_updated);
CREATE INDEX idx_lobby_games ON game_sessions(is_lobby_game, status, scheduled_start_time);

CREATE INDEX idx_player_boards_session_id ON player_boards(session_id);
CREATE INDEX idx_player_boards_player_id ON player_boards(player_id);
CREATE INDEX idx_player_boards_mock_player_id ON player_boards(mock_player_id);
CREATE INDEX idx_session_player_count ON player_boards(session_id);

-- Unique constraint for one player per session
CREATE UNIQUE INDEX idx_unique_player_per_session 
ON player_boards (session_id, COALESCE(player_id::text, mock_player_id));

-- =====================================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_boards ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 6: CREATE RLS POLICIES
-- =====================================================

-- Game Sessions Policies (simplified to avoid recursion)
CREATE POLICY "public_read_game_sessions"
  ON game_sessions FOR SELECT TO public USING (true);

CREATE POLICY "public_create_game_sessions"
  ON game_sessions FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "public_update_game_sessions"
  ON game_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_scheduled_lobby_games"
  ON game_sessions FOR SELECT TO anon 
  USING (is_lobby_game = true AND status = 'scheduled');

CREATE POLICY "anon_read_active_lobby_games"
  ON game_sessions FOR SELECT TO anon 
  USING (is_lobby_game = true AND status = 'active');

-- Player Boards Policies (simplified to avoid recursion)
CREATE POLICY "Anyone can read player boards"
  ON player_boards FOR SELECT TO public USING (true);

CREATE POLICY "Anyone can create player boards"
  ON player_boards FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Anyone can update player boards"
  ON player_boards FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete player boards"
  ON player_boards FOR DELETE TO public USING (true);

CREATE POLICY "Anonymous users can manage mock player boards"
  ON player_boards FOR ALL TO anon 
  USING (is_mock_player = true) WITH CHECK (is_mock_player = true);

-- =====================================================
-- STEP 7: CREATE UTILITY FUNCTIONS
-- =====================================================

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update game activity when players make moves
CREATE OR REPLACE FUNCTION update_game_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE game_sessions 
  SET last_updated = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 8: CREATE TRIGGERS
-- =====================================================

-- Trigger for game_sessions last_updated
CREATE TRIGGER update_game_sessions_last_updated
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_last_updated();

-- Trigger to update game activity when player boards are updated
CREATE TRIGGER update_game_activity_trigger
  AFTER UPDATE ON player_boards
  FOR EACH ROW EXECUTE FUNCTION update_game_activity();

-- =====================================================
-- STEP 9: GAME MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to generate treasure positions for any grid size
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

-- Function to generate unique game codes
CREATE OR REPLACE FUNCTION generate_unique_game_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 3 letters + 3 numbers
    new_code := (
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
      SELECT 1 FROM game_sessions WHERE game_code = new_code
    ) INTO code_exists;
    
    -- If code doesn't exist, we can use it
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 10: LOBBY SYSTEM FUNCTIONS
-- =====================================================

-- Function to create a new lobby game
CREATE OR REPLACE FUNCTION create_lobby_game()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
  treasure_positions JSONB;
  generated_code TEXT;
BEGIN
  -- Generate treasure positions for 6x6 grid (5 treasures)
  treasure_positions := generate_treasure_positions(6, 5);
  
  -- Generate unique game code
  generated_code := generate_unique_game_code();
  
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
    WHERE status = 'scheduled' AND is_lobby_game = true
  LOOP
    -- Count players in this game
    SELECT COUNT(*) INTO player_count
    FROM player_boards WHERE session_id = game_record.id;
    
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
  WHERE status = 'scheduled' AND is_lobby_game = true;
  
  IF existing_count = 0 THEN
    -- Create new lobby game
    SELECT create_lobby_game() INTO new_game_id;
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
BEGIN
  -- Check if game is still scheduled
  SELECT status INTO game_status
  FROM game_sessions
  WHERE id = p_session_id AND is_lobby_game = true;
  
  -- Only allow leaving scheduled games
  IF game_status = 'scheduled' THEN
    -- Remove player from game
    DELETE FROM player_boards
    WHERE session_id = p_session_id AND mock_player_id = p_mock_player_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 11: GAME TIMEOUT FUNCTIONS
-- =====================================================

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
  SET status = 'cancelled', end_time = now(), last_updated = now()
  WHERE status = 'waiting' AND created_at < now() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS waiting_count = ROW_COUNT;
  
  -- Cancel active games that have been inactive for more than 2 hours
  UPDATE game_sessions 
  SET status = 'cancelled', end_time = now(), last_updated = now()
  WHERE status = 'active' AND last_updated < now() - INTERVAL '2 hours';
  
  GET DIAGNOSTICS active_count = ROW_COUNT;
  
  total_count := waiting_count + active_count;
  RETURN total_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 12: INITIALIZE LOBBY SYSTEM
-- =====================================================

-- Clean up any existing test data
DELETE FROM player_boards WHERE is_mock_player = true;
DELETE FROM game_sessions WHERE is_lobby_game = true;

-- Create initial lobby game
SELECT ensure_lobby_game_available();

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

-- Verify setup
DO $$
DECLARE
  lobby_count INTEGER;
  game_record RECORD;
BEGIN
  -- Count scheduled lobby games
  SELECT COUNT(*) INTO lobby_count
  FROM game_sessions WHERE status = 'scheduled' AND is_lobby_game = true;
  
  RAISE NOTICE '✅ Database setup complete!';
  RAISE NOTICE '📊 Found % scheduled lobby games', lobby_count;
  
  -- Show details of the lobby game
  FOR game_record IN 
    SELECT id, game_code, scheduled_start_time, status, is_lobby_game
    FROM game_sessions 
    WHERE is_lobby_game = true 
    ORDER BY created_at DESC 
    LIMIT 1
  LOOP
    RAISE NOTICE '🎮 Active lobby game: Code=%, Start Time=%, Status=%', 
      game_record.game_code, game_record.scheduled_start_time, game_record.status;
  END LOOP;
  
  RAISE NOTICE '🚀 Ready for multiplayer gaming!';
END $$;