-- =====================================================
-- ENHANCED LOBBY GAME PROCESSING SYSTEM
-- =====================================================

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS process_scheduled_games();
DROP FUNCTION IF EXISTS ensure_lobby_game_available();
DROP FUNCTION IF EXISTS cleanup_old_lobby_games();
DROP FUNCTION IF EXISTS auto_process_lobby_games();

-- =====================================================
-- STEP 1: IMPROVED GAME PROCESSING FUNCTION
-- =====================================================

-- Enhanced function to process scheduled games with better logic
CREATE OR REPLACE FUNCTION process_scheduled_games()
RETURNS TABLE(
  games_started INTEGER,
  games_cancelled INTEGER,
  new_games_created INTEGER,
  total_processed INTEGER
) AS $$
DECLARE
  game_record RECORD;
  player_count INTEGER;
  started_count INTEGER := 0;
  cancelled_count INTEGER := 0;
  created_count INTEGER := 0;
  new_game_id UUID;
BEGIN
  RAISE NOTICE '🎮 Starting scheduled game processing...';
  
  -- Process all scheduled lobby games
  FOR game_record IN 
    SELECT gs.* FROM game_sessions gs
    WHERE gs.status = 'scheduled' 
    AND gs.is_lobby_game = true
    ORDER BY gs.scheduled_start_time ASC
  LOOP
    -- Count players in this game
    SELECT COUNT(*) INTO player_count
    FROM player_boards pb
    WHERE pb.session_id = game_record.id;
    
    RAISE NOTICE '🎯 Processing game % (code: %) with % players, scheduled for %', 
      game_record.id, game_record.game_code, player_count, game_record.scheduled_start_time;
    
    -- Check if game should start (max players OR time expired)
    IF player_count >= game_record.max_players OR 
       now() >= game_record.scheduled_start_time THEN
      
      IF player_count >= 2 THEN
        -- Start the game
        UPDATE game_sessions 
        SET status = 'active', start_time = now(), last_updated = now()
        WHERE id = game_record.id;
        
        started_count := started_count + 1;
        RAISE NOTICE '✅ Started game % with % players', game_record.id, player_count;
        
      ELSE
        -- Cancel the game (not enough players)
        UPDATE game_sessions 
        SET status = 'cancelled', end_time = now(), last_updated = now()
        WHERE id = game_record.id;
        
        -- Remove any remaining players from cancelled game
        DELETE FROM player_boards WHERE session_id = game_record.id;
        
        cancelled_count := cancelled_count + 1;
        RAISE NOTICE '❌ Cancelled game % with only % players', game_record.id, player_count;
        
        -- Immediately create a new lobby game to replace the cancelled one
        BEGIN
          SELECT create_lobby_game() INTO new_game_id;
          IF new_game_id IS NOT NULL THEN
            created_count := created_count + 1;
            RAISE NOTICE '🆕 Created replacement lobby game %', new_game_id;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '⚠️ Failed to create replacement lobby game: %', SQLERRM;
        END;
      END IF;
    ELSE
      RAISE NOTICE '⏳ Game % not ready yet (% players, % minutes remaining)', 
        game_record.id, player_count, 
        EXTRACT(EPOCH FROM (game_record.scheduled_start_time - now())) / 60;
    END IF;
  END LOOP;
  
  RAISE NOTICE '📊 Processing complete: % started, % cancelled, % created', 
    started_count, cancelled_count, created_count;
  
  RETURN QUERY SELECT started_count, cancelled_count, created_count, 
    (started_count + cancelled_count);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 2: IMPROVED LOBBY GAME AVAILABILITY FUNCTION
-- =====================================================

-- Enhanced function to ensure lobby game availability with better error handling
CREATE OR REPLACE FUNCTION ensure_lobby_game_available()
RETURNS TABLE(
  action_taken TEXT,
  game_id UUID,
  game_code TEXT,
  scheduled_start_time TIMESTAMPTZ
) AS $$
DECLARE
  existing_count INTEGER;
  result_game_id UUID;
  result_game_code TEXT;
  result_start_time TIMESTAMPTZ;
  processed_result RECORD;
BEGIN
  RAISE NOTICE '🔍 Checking lobby game availability...';
  
  -- First, process any scheduled games that might be ready
  SELECT * INTO processed_result FROM process_scheduled_games();
  
  IF processed_result.total_processed > 0 THEN
    RAISE NOTICE '⚡ Processed % scheduled games during availability check', 
      processed_result.total_processed;
  END IF;
  
  -- Check if there's still a scheduled lobby game after processing
  SELECT COUNT(*) INTO existing_count
  FROM game_sessions gs
  WHERE gs.status = 'scheduled' 
  AND gs.is_lobby_game = true;
  
  IF existing_count = 0 THEN
    RAISE NOTICE '🆕 No scheduled lobby games found, creating new one...';
    
    -- Create new lobby game
    BEGIN
      SELECT create_lobby_game() INTO result_game_id;
      
      -- Get details of the created game
      SELECT gs.game_code, gs.scheduled_start_time 
      INTO result_game_code, result_start_time
      FROM game_sessions gs
      WHERE gs.id = result_game_id;
      
      RAISE NOTICE '✅ Created new lobby game % with code % scheduled for %', 
        result_game_id, result_game_code, result_start_time;
      
      RETURN QUERY SELECT 'created'::TEXT, result_game_id, result_game_code, result_start_time;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ Failed to create lobby game: %', SQLERRM;
      RETURN QUERY SELECT 'error'::TEXT, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
    END;
  ELSE
    RAISE NOTICE '✅ Found % existing scheduled lobby games', existing_count;
    
    -- Return info about existing game
    SELECT gs.id, gs.game_code, gs.scheduled_start_time 
    INTO result_game_id, result_game_code, result_start_time
    FROM game_sessions gs
    WHERE gs.status = 'scheduled' 
    AND gs.is_lobby_game = true
    ORDER BY gs.created_at DESC
    LIMIT 1;
    
    RETURN QUERY SELECT 'exists'::TEXT, result_game_id, result_game_code, result_start_time;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: CLEANUP FUNCTION FOR OLD GAMES
-- =====================================================

-- Function to clean up old cancelled/completed games
CREATE OR REPLACE FUNCTION cleanup_old_lobby_games()
RETURNS INTEGER AS $$
DECLARE
  cancelled_count INTEGER := 0;
  completed_count INTEGER := 0;
  total_cleanup INTEGER := 0;
BEGIN
  -- Remove old cancelled lobby games (older than 1 hour)
  DELETE FROM game_sessions gs
  WHERE gs.is_lobby_game = true 
  AND gs.status = 'cancelled' 
  AND gs.end_time < now() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  
  -- Remove old completed lobby games (older than 24 hours)
  DELETE FROM game_sessions gs
  WHERE gs.is_lobby_game = true 
  AND gs.status = 'completed' 
  AND gs.end_time < now() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS completed_count = ROW_COUNT;
  
  -- Calculate total cleanup count
  total_cleanup := cancelled_count + completed_count;
  
  IF total_cleanup > 0 THEN
    RAISE NOTICE '🧹 Cleaned up % old lobby games (% cancelled, % completed)', 
      total_cleanup, cancelled_count, completed_count;
  END IF;
  
  RETURN total_cleanup;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 4: AUTOMATIC PROCESSING TRIGGER
-- =====================================================

-- Function to automatically process games when players join/leave
CREATE OR REPLACE FUNCTION auto_process_lobby_games()
RETURNS TRIGGER AS $$
DECLARE
  target_session_id UUID;
  game_status TEXT;
  player_count INTEGER;
  max_players INTEGER;
BEGIN
  -- Get the session ID from either NEW or OLD record
  target_session_id := COALESCE(NEW.session_id, OLD.session_id);
  
  -- Only process for lobby games
  SELECT gs.status, gs.max_players 
  INTO game_status, max_players
  FROM game_sessions gs 
  WHERE gs.id = target_session_id
  AND gs.is_lobby_game = true;
  
  -- If this is a scheduled lobby game, check if it should start
  IF game_status = 'scheduled' THEN
    -- Count current players
    SELECT COUNT(*) INTO player_count
    FROM player_boards pb
    WHERE pb.session_id = target_session_id;
    
    -- If we hit max players, start the game immediately
    IF player_count >= max_players THEN
      UPDATE game_sessions 
      SET status = 'active', start_time = now(), last_updated = now()
      WHERE id = target_session_id;
      
      RAISE NOTICE '🚀 Auto-started lobby game due to max players reached';
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic processing
DROP TRIGGER IF EXISTS auto_process_lobby_trigger ON player_boards;
CREATE TRIGGER auto_process_lobby_trigger
  AFTER INSERT OR DELETE ON player_boards
  FOR EACH ROW
  EXECUTE FUNCTION auto_process_lobby_games();

-- =====================================================
-- STEP 5: INITIALIZE CLEAN LOBBY SYSTEM
-- =====================================================

-- Clean up any existing problematic games
SELECT cleanup_old_lobby_games();

-- Process any stuck scheduled games
SELECT * FROM process_scheduled_games();

-- Ensure we have a fresh lobby game available
SELECT * FROM ensure_lobby_game_available();

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  lobby_count INTEGER;
  game_record RECORD;
BEGIN
  -- Count scheduled lobby games
  SELECT COUNT(*) INTO lobby_count
  FROM game_sessions gs
  WHERE gs.status = 'scheduled' 
  AND gs.is_lobby_game = true;
  
  RAISE NOTICE '✅ Lobby processing logic updated!';
  RAISE NOTICE '📊 Found % scheduled lobby games', lobby_count;
  
  -- Show details of active lobby games
  FOR game_record IN 
    SELECT gs.id, gs.game_code, gs.scheduled_start_time, gs.status, 
           (SELECT COUNT(*) FROM player_boards pb WHERE pb.session_id = gs.id) as player_count
    FROM game_sessions gs
    WHERE gs.is_lobby_game = true 
    AND gs.status IN ('scheduled', 'active')
    ORDER BY gs.created_at DESC 
    LIMIT 3
  LOOP
    RAISE NOTICE '🎮 Lobby game: Code=%, Status=%, Players=%, Start Time=%', 
      game_record.game_code, game_record.status, game_record.player_count, 
      game_record.scheduled_start_time;
  END LOOP;
  
  RAISE NOTICE '🚀 Enhanced lobby system ready!';
END $$;