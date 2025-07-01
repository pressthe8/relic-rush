/*
  # Comprehensive Multiplayer Game Schema

  1. New Tables
    - `game_sessions`
      - `id` (uuid, primary key)
      - `grid_size` (integer, restricted to 6, 9, 12)
      - `treasure_count` (integer)
      - `dig_attempts` (integer)
      - `game_settings` (jsonb) - stores complete game configuration
      - `treasure_positions` (jsonb) - encrypted treasure locations
      - `start_time` (timestamptz)
      - `end_time` (timestamptz)
      - `last_updated` (timestamptz)
      - `status` (text) - waiting, active, completed
      - `created_at` (timestamptz)

    - `player_boards`
      - `id` (uuid, primary key)
      - `player_id` (uuid, optional reference to auth.users for real players)
      - `mock_player_id` (text, for testing without auth)
      - `is_mock_player` (boolean, default false)
      - `session_id` (uuid, references game_sessions)
      - `board_state` (jsonb) - complete board state
      - `remaining_digs` (integer)
      - `score` (integer)
      - `discoveries` (jsonb) - array of discovered treasures with timestamps
      - `joined_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to access their games
    - Add policies for mock players to access test games
    - Ensure mock players can only interact with mock sessions

  3. Functions
    - Auto-update last_updated timestamp on game_sessions
    - Generate mock player IDs for testing
*/

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_size INTEGER NOT NULL CHECK (grid_size IN (6, 9, 12)),
  treasure_count INTEGER NOT NULL CHECK (treasure_count > 0),
  dig_attempts INTEGER NOT NULL CHECK (dig_attempts > 0),
  game_settings JSONB NOT NULL DEFAULT '{}',
  treasure_positions JSONB NOT NULL,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create player_boards table
CREATE TABLE IF NOT EXISTS player_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES auth.users(id),
  mock_player_id TEXT,
  is_mock_player BOOLEAN NOT NULL DEFAULT false,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  board_state JSONB NOT NULL,
  remaining_digs INTEGER NOT NULL CHECK (remaining_digs >= 0),
  score INTEGER NOT NULL DEFAULT 0,
  discoveries JSONB NOT NULL DEFAULT '[]',
  joined_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure either player_id OR mock_player_id is set, but not both
  CONSTRAINT valid_player_identification CHECK (
    (player_id IS NOT NULL AND mock_player_id IS NULL AND is_mock_player = false) OR
    (player_id IS NULL AND mock_player_id IS NOT NULL AND is_mock_player = true)
  )
);

-- Create unique index to ensure one player per session (handles both real and mock players)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_player_per_session 
ON player_boards (session_id, COALESCE(player_id::text, mock_player_id));

-- Enable RLS
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_boards ENABLE ROW LEVEL SECURITY;

-- Policies for game_sessions
CREATE POLICY "Authenticated users can read their game sessions"
  ON game_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM player_boards
      WHERE session_id = game_sessions.id
      AND player_id = auth.uid()
    )
  );

CREATE POLICY "Anonymous users can read mock game sessions"
  ON game_sessions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM player_boards
      WHERE session_id = game_sessions.id
      AND is_mock_player = true
    )
  );

CREATE POLICY "Authenticated users can create game sessions"
  ON game_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous users can create mock game sessions"
  ON game_sessions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can update their game sessions"
  ON game_sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM player_boards
      WHERE session_id = game_sessions.id
      AND (player_id = auth.uid() OR is_mock_player = true)
    )
  );

-- Policies for player_boards
CREATE POLICY "Authenticated users can manage their own boards"
  ON player_boards
  FOR ALL
  TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY "Anonymous users can manage mock player boards"
  ON player_boards
  FOR ALL
  TO anon
  USING (is_mock_player = true)
  WITH CHECK (is_mock_player = true);

CREATE POLICY "Users can read other players' boards in same session"
  ON player_boards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM player_boards pb
      WHERE pb.session_id = player_boards.session_id
      AND (pb.player_id = auth.uid() OR pb.is_mock_player = true)
    )
  );

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for game_sessions
CREATE TRIGGER update_game_sessions_last_updated
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_updated();

-- Function to generate mock player IDs
CREATE OR REPLACE FUNCTION generate_mock_player_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'mock_player_' || substr(gen_random_uuid()::text, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_player_boards_session_id ON player_boards(session_id);
CREATE INDEX IF NOT EXISTS idx_player_boards_player_id ON player_boards(player_id);
CREATE INDEX IF NOT EXISTS idx_player_boards_mock_player_id ON player_boards(mock_player_id);