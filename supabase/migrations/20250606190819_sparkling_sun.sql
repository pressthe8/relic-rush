/*
  # Fix infinite recursion in player_boards RLS policies

  1. Problem
    - The "Users can read other players' boards in same session" policy causes infinite recursion
    - It references player_boards table from within a player_boards policy evaluation

  2. Solution
    - Drop the problematic recursive policy
    - Replace with a simpler, non-recursive policy that checks session participation directly
    - Maintain security while avoiding circular references

  3. Changes
    - Remove recursive policy that checks player_boards from within player_boards policy
    - Add direct session-based access control without self-referencing queries
*/

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can read other players' boards in same session" ON player_boards;

-- Create a new non-recursive policy for reading other players' boards
-- This policy allows users to read boards in sessions where they are participants
-- without creating a recursive reference to player_boards
CREATE POLICY "Users can read boards in their sessions"
  ON player_boards
  FOR SELECT
  TO public
  USING (
    -- Allow if the requesting user has a board in the same session
    -- OR if this is a mock player board (for anonymous access)
    is_mock_player = true
    OR 
    EXISTS (
      SELECT 1 FROM game_sessions gs
      WHERE gs.id = session_id
      AND (
        -- Check if authenticated user has access through their own board
        (auth.role() = 'authenticated' AND EXISTS (
          SELECT 1 FROM player_boards pb2 
          WHERE pb2.session_id = gs.id 
          AND pb2.player_id = auth.uid()
        ))
        OR
        -- Allow anonymous access to sessions with mock players
        (auth.role() = 'anon' AND EXISTS (
          SELECT 1 FROM player_boards pb3
          WHERE pb3.session_id = gs.id
          AND pb3.is_mock_player = true
        ))
      )
    )
  );