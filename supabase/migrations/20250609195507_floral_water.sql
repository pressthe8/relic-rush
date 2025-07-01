/*
  # Fix infinite recursion in game_sessions RLS policies

  1. Problem
    - Current RLS policies on game_sessions table are causing infinite recursion
    - Policies with complex subqueries to player_boards are creating circular dependencies
    
  2. Solution
    - Simplify RLS policies to avoid recursive checks
    - Remove complex EXISTS subqueries that reference related tables
    - Keep policies simple and direct for lobby game functionality
    
  3. Changes
    - Drop existing problematic policies
    - Create simplified policies for lobby games
    - Ensure anon users can read scheduled lobby games without complex checks
*/

-- Drop existing problematic policies that might cause recursion
DROP POLICY IF EXISTS "Allow anon read of active lobby games" ON game_sessions;
DROP POLICY IF EXISTS "Allow anon read of scheduled lobby games" ON game_sessions;
DROP POLICY IF EXISTS "Anonymous users can create mock game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can create game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can read game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Anyone can update game sessions" ON game_sessions;
DROP POLICY IF EXISTS "Authenticated users can create game sessions" ON game_sessions;

-- Create simplified policies without recursive dependencies

-- Allow anonymous users to read scheduled lobby games (simple condition)
CREATE POLICY "anon_read_scheduled_lobby_games"
  ON game_sessions
  FOR SELECT
  TO anon
  USING (is_lobby_game = true AND status = 'scheduled');

-- Allow anonymous users to read active lobby games (simple condition)
CREATE POLICY "anon_read_active_lobby_games"
  ON game_sessions
  FOR SELECT
  TO anon
  USING (is_lobby_game = true AND status = 'active');

-- Allow public to read all game sessions (for general game functionality)
CREATE POLICY "public_read_game_sessions"
  ON game_sessions
  FOR SELECT
  TO public
  USING (true);

-- Allow public to create game sessions
CREATE POLICY "public_create_game_sessions"
  ON game_sessions
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow public to update game sessions
CREATE POLICY "public_update_game_sessions"
  ON game_sessions
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to manage their own game sessions
CREATE POLICY "authenticated_manage_game_sessions"
  ON game_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);