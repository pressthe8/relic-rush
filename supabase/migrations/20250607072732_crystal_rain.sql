/*
  # Add simple game codes for easier joining

  1. Changes
    - Add `game_code` column to `game_sessions` table
    - Game codes are 6-character alphanumeric strings (e.g., "ABC123")
    - Add unique constraint to ensure no duplicate codes
    - Add function to generate random game codes
    - Add index for efficient code lookups

  2. Game Code Format
    - 6 characters: 3 letters + 3 numbers (e.g., "ABC123", "XYZ789")
    - Easy to read and share verbally
    - Case-insensitive for user convenience
*/

-- Add game_code column to game_sessions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'game_code'
  ) THEN
    ALTER TABLE game_sessions ADD COLUMN game_code TEXT UNIQUE;
  END IF;
END $$;

-- Function to generate a random 6-character game code (3 letters + 3 numbers)
CREATE OR REPLACE FUNCTION generate_game_code()
RETURNS TEXT AS $$
DECLARE
  letters TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  numbers TEXT := '0123456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  -- Generate 3 random letters
  FOR i IN 1..3 LOOP
    code := code || substr(letters, floor(random() * length(letters) + 1)::int, 1);
  END LOOP;
  
  -- Generate 3 random numbers
  FOR i IN 1..3 LOOP
    code := code || substr(numbers, floor(random() * length(numbers) + 1)::int, 1);
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to generate a unique game code (retry if collision)
CREATE OR REPLACE FUNCTION generate_unique_game_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := generate_game_code();
    
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

-- Add index for efficient game code lookups
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_code ON game_sessions(game_code);

-- Update existing sessions to have game codes (for any existing data)
UPDATE game_sessions 
SET game_code = generate_unique_game_code() 
WHERE game_code IS NULL;