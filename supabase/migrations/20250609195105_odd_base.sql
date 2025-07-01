/*
  # Fix RLS policies for lobby game functionality

  This migration adds the necessary Row Level Security policies to allow anonymous users
  to participate in lobby games. The policies are designed to be secure while enabling
  the lobby system to function properly.

  ## Changes Made

  1. **game_sessions table policies**:
     - Allow anon users to read scheduled lobby games
     - Allow anon users to read active lobby games they're participating in

  2. **player_boards table policies**:
     - Allow anon users to read player boards for lobby games
     - Allow anon users to insert into lobby games
     - Allow anon users to update/delete their own mock player boards in lobby games

  ## Security Notes

  - Anonymous users can only access lobby games (is_lobby_game = true)
  - Anonymous users can only modify their own mock player records
  - Regular (non-lobby) games remain protected from anonymous access
*/

-- Drop existing conflicting policies if they exist
DROP POLICY IF EXISTS "Allow anon read of scheduled lobby games" ON game_sessions;
DROP POLICY IF EXISTS "Allow anon read of active lobby games" ON game_sessions;
DROP POLICY IF EXISTS "Allow anon read lobby game player boards" ON player_boards;
DROP POLICY IF EXISTS "Allow anon insert into lobby games" ON player_boards;
DROP POLICY IF EXISTS "Allow anon update own lobby game boards" ON player_boards;
DROP POLICY IF EXISTS "Allow anon delete own lobby game boards" ON player_boards;

-- Game Sessions: Allow anon users to read scheduled lobby games
CREATE POLICY "Allow anon read of scheduled lobby games"
  ON game_sessions
  FOR SELECT
  TO anon
  USING (is_lobby_game = true AND status = 'scheduled');

-- Game Sessions: Allow anon users to read active lobby games they're participating in
CREATE POLICY "Allow anon read of active lobby games"
  ON game_sessions
  FOR SELECT
  TO anon
  USING (
    is_lobby_game = true 
    AND status = 'active' 
    AND EXISTS (
      SELECT 1 FROM player_boards 
      WHERE session_id = game_sessions.id 
      AND is_mock_player = true
    )
  );

-- Player Boards: Allow anon users to read player boards for lobby games
CREATE POLICY "Allow anon read lobby game player boards"
  ON player_boards
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM game_sessions 
      WHERE id = session_id 
      AND is_lobby_game = true
    )
  );

-- Player Boards: Allow anon users to insert into scheduled lobby games
CREATE POLICY "Allow anon insert into lobby games"
  ON player_boards
  FOR INSERT
  TO anon
  WITH CHECK (
    is_mock_player = true
    AND EXISTS (
      SELECT 1 FROM game_sessions 
      WHERE id = session_id 
      AND is_lobby_game = true 
      AND status = 'scheduled'
    )
  );

-- Player Boards: Allow anon users to update their own mock player boards in lobby games
CREATE POLICY "Allow anon update own lobby game boards"
  ON player_boards
  FOR UPDATE
  TO anon
  USING (
    is_mock_player = true
    AND EXISTS (
      SELECT 1 FROM game_sessions 
      WHERE id = session_id 
      AND is_lobby_game = true
    )
  )
  WITH CHECK (
    is_mock_player = true
    AND EXISTS (
      SELECT 1 FROM game_sessions 
      WHERE id = session_id 
      AND is_lobby_game = true
    )
  );

-- Player Boards: Allow anon users to delete their own mock player boards in lobby games
CREATE POLICY "Allow anon delete own lobby game boards"
  ON player_boards
  FOR DELETE
  TO anon
  USING (
    is_mock_player = true
    AND EXISTS (
      SELECT 1 FROM game_sessions 
      WHERE id = session_id 
      AND is_lobby_game = true
    )
  );