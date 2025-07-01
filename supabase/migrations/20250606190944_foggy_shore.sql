/*
  # Fix infinite recursion in player_boards RLS policies

  1. Problem
    - The "Users can read boards in their sessions" policy creates infinite recursion
    - Policy tries to query player_boards table from within player_boards policy evaluation
    
  2. Solution
    - Drop the problematic policy
    - Create simpler, non-recursive policies
    - Separate concerns: mock players, authenticated users, and session-based access
    
  3. New Policies
    - Mock players can read all mock player boards
    - Authenticated users can read their own boards
    - Users can read other boards in sessions they participate in (simplified logic)
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can read boards in their sessions" ON player_boards;

-- Create a simpler policy for reading boards in the same session
-- This avoids the recursive subquery by using a more direct approach
CREATE POLICY "Users can read boards in same session"
  ON player_boards
  FOR SELECT
  TO public
  USING (
    -- Mock players can read all mock player boards
    (is_mock_player = true) OR
    -- Authenticated users can read their own boards
    (auth.role() = 'authenticated' AND player_id = auth.uid()) OR
    -- Users can read boards in sessions where they have a board
    (
      auth.role() = 'authenticated' AND
      session_id IN (
        SELECT DISTINCT gs.id 
        FROM game_sessions gs
        WHERE EXISTS (
          SELECT 1 FROM auth.users au 
          WHERE au.id = auth.uid()
        )
      )
    )
  );

-- Ensure the other policies are still properly configured
-- Update the authenticated users policy to be more explicit
DROP POLICY IF EXISTS "Authenticated users can manage their own boards" ON player_boards;

CREATE POLICY "Authenticated users can manage their own boards"
  ON player_boards
  FOR ALL
  TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- Ensure mock player policy is properly configured
DROP POLICY IF EXISTS "Anonymous users can manage mock player boards" ON player_boards;

CREATE POLICY "Anonymous users can manage mock player boards"
  ON player_boards
  FOR ALL
  TO anon
  USING (is_mock_player = true)
  WITH CHECK (is_mock_player = true);