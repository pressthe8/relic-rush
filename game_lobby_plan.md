# Game Lobby System Plan

## Overview
Replace manual game creation with an automated lobby system where games are continuously generated and players join scheduled games with countdown timers.

## Game Lobby Mechanics

### Core Rules
- **Max Players**: 6 players per game
- **Grid Size**: 6x6 only (standardized for lobby games)
- **Game Frequency**: New game created when current scheduled game starts or cancels
- **Countdown**: 10 minutes from creation to start
- **Instant Start**: Game starts immediately when 6 players join
- **Minimum Players**: 2 players required, otherwise game cancels
- **Leave Option**: Players can leave lobby games before they start
- **No Spectating**: Players cannot watch active/completed games (future feature)

### Game States Flow
```
SCHEDULED → (10min timer OR 6 players) → ACTIVE
SCHEDULED → (10min timer + <2 players) → CANCELLED
SCHEDULED → (player leaves) → CONTINUE WAITING
```

## Database Schema Changes

### New Game Session Fields
```sql
-- Add to existing game_sessions table
ALTER TABLE game_sessions ADD COLUMN scheduled_start_time TIMESTAMPTZ;
ALTER TABLE game_sessions ADD COLUMN max_players INTEGER DEFAULT 6;
ALTER TABLE game_sessions ADD COLUMN is_lobby_game BOOLEAN DEFAULT true;

-- Update status constraint to include 'scheduled'
ALTER TABLE game_sessions DROP CONSTRAINT game_sessions_status_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check 
  CHECK (status IN ('scheduled', 'waiting', 'active', 'cancelled', 'completed'));
```

**Note on `is_lobby_game`**: 
- **Purpose**: Distinguishes between automated lobby games and manual private games
- **Default `true`**: New games are lobby games by default (private games are the exception)
- **Usage**: Allows filtering lobby games vs private games, enables different rules/UI for each type

### Indexes for Lobby Queries
```sql
CREATE INDEX idx_lobby_games ON game_sessions(is_lobby_game, status, scheduled_start_time);
CREATE INDEX idx_player_count ON player_boards(session_id);
```

## Background Job System

### Game Scheduler Function
```sql
CREATE OR REPLACE FUNCTION create_lobby_game()
RETURNS UUID AS $$
DECLARE
  new_game_id UUID;
  treasure_positions JSONB;
BEGIN
  -- Generate treasure positions for 6x6 grid (5 treasures)
  treasure_positions := generate_treasure_positions_6x6(5);
  
  -- Create new scheduled game
  INSERT INTO game_sessions (
    grid_size, treasure_count, dig_attempts,
    treasure_positions, scheduled_start_time,
    status, is_lobby_game, max_players,
    game_settings, all_discoveries
  ) VALUES (
    6, 5, 10,
    treasure_positions, now() + INTERVAL '10 minutes',
    'scheduled', true, 6,
    '{"gridSize": 6, "treasureCount": 5, "digAttempts": 10}',
    '[]'
  ) RETURNING id INTO new_game_id;
  
  RETURN new_game_id;
END;
$$ LANGUAGE plpgsql;
```

### Game Starter Function
```sql
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
```

### Lobby Management Function
```sql
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
```

## Frontend Components

### New Components Needed
1. **`GameLobby.tsx`** - Main lobby interface with current game
2. **`LobbyGameCard.tsx`** - Game display with countdown and player list
3. **`CountdownTimer.tsx`** - Real-time countdown component
4. **`JoinedGameStatus.tsx`** - Shows "You've joined! Waiting for X players or X:XX minutes"
5. **`PlayerList.tsx`** - Show joined players with leave option

### GameLobby Component Structure
```typescript
interface LobbyGame {
  id: string
  scheduled_start_time: string
  player_count: number
  max_players: number
  status: 'scheduled'
  time_remaining: number
  joined_players: string[] // mock player IDs
}

interface LobbyState {
  currentGame: LobbyGame | null
  hasJoined: boolean
  isJoining: boolean
  isLeaving: boolean
  playerMockId: string
}

const GameLobby: React.FC = () => {
  const [lobbyState, setLobbyState] = useState<LobbyState>({
    currentGame: null,
    hasJoined: false,
    isJoining: false,
    isLeaving: false,
    playerMockId: generateMockPlayerId()
  })
  
  // Real-time subscription to lobby games
  // Countdown timer logic
  // Join/leave game functionality
  // Auto-redirect when game starts
  
  const handleJoinGame = async () => {
    // Add player to scheduled game
    // Update hasJoined state
    // Show waiting status
  }
  
  const handleLeaveGame = async () => {
    // Remove player from scheduled game
    // Reset hasJoined state
    // Return to lobby view
  }
}
```

### Joined Game Status Component
```typescript
const JoinedGameStatus: React.FC<{
  game: LobbyGame
  onLeave: () => void
  isLeaving: boolean
}> = ({ game, onLeave, isLeaving }) => {
  const playersNeeded = game.max_players - game.player_count
  const timeRemaining = useCountdown(game.scheduled_start_time)
  
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
      <div className="text-center space-y-4">
        <h3 className="text-xl font-bold text-emerald-800">
          🎉 You've Joined the Game!
        </h3>
        
        {playersNeeded > 0 ? (
          <p className="text-emerald-700">
            Waiting for <strong>{playersNeeded} more players</strong> or{" "}
            <strong>{formatTime(timeRemaining)}</strong>
          </p>
        ) : (
          <p className="text-emerald-700">
            Game starting in <strong>{formatTime(timeRemaining)}</strong>
          </p>
        )}
        
        <button
          onClick={onLeave}
          disabled={isLeaving}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {isLeaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>
    </div>
  )
}
```

### Countdown Timer Logic
```typescript
const useCountdown = (targetTime: string) => {
  const [timeRemaining, setTimeRemaining] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime()
      const target = new Date(targetTime).getTime()
      const remaining = Math.max(0, target - now)
      setTimeRemaining(remaining)
      
      // Auto-refresh when countdown reaches zero
      if (remaining === 0) {
        window.location.reload() // Simple approach for MVP
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [targetTime])
  
  return timeRemaining
}

const formatTime = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60000)
  const seconds = Math.floor((milliseconds % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
```

## Integration Points

### App.tsx Changes
```typescript
type AppMode = 'introduction' | 'lobby' | 'private-setup'

// Private game setup hidden by default (parked feature)
const [showPrivateSetup, setShowPrivateSetup] = useState(false)

// Main flow: introduction → lobby → game
// Hidden flow: introduction → private-setup → game (for future premium)
```

### Lobby Game Flow
1. **Enter Lobby** - Show current scheduled game with countdown
2. **Join Game** - Add player to scheduled game, show waiting status
3. **Wait/Watch** - Real-time countdown and player count updates
4. **Leave Option** - Allow leaving before game starts
5. **Auto-Start** - Redirect to game when it begins
6. **New Game** - Return to lobby for next scheduled game

### Private Games (Parked Feature)
- Keep existing `MultiplayerSetup` component unchanged
- Hide behind feature flag: `const ENABLE_PRIVATE_GAMES = false`
- Maintain all current manual game creation functionality
- Set `is_lobby_game = false` for private games
- Can be enabled later as premium feature with subscription

## Player Leave Functionality

### Database Changes
```sql
-- Add function to handle player leaving lobby
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
```

### Frontend Leave Logic
```typescript
const handleLeaveGame = async () => {
  setIsLeaving(true)
  try {
    // Remove player from game
    const { error } = await supabase
      .from('player_boards')
      .delete()
      .eq('session_id', currentGame.id)
      .eq('mock_player_id', playerMockId)
    
    if (error) throw error
    
    // Reset lobby state
    setLobbyState(prev => ({
      ...prev,
      hasJoined: false,
      isLeaving: false
    }))
  } catch (error) {
    console.error('Failed to leave game:', error)
    setIsLeaving(false)
  }
}
```

## Background Processing

### Scheduled Jobs Needed
1. **Game Processor** - Run every 30 seconds to check scheduled games
2. **Lobby Maintainer** - Ensure there's always a scheduled game available
3. **Cleanup** - Remove old cancelled games and orphaned player records

### Implementation Options
1. **Supabase Edge Functions** - Cron-triggered functions (preferred)
2. **Database Triggers** - Automatic game creation on status changes
3. **Client-side Polling** - Temporary solution for MVP

## Migration Strategy

### Phase 1: Lobby Infrastructure
1. Add database schema changes
2. Create background functions
3. Build lobby components
4. Test game creation/starting logic

### Phase 2: UI Integration
1. Add lobby to main app flow
2. Implement real-time subscriptions
3. Add countdown timers and player lists
4. Test full lobby → game flow

### Phase 3: Background Processing
1. Set up automated game scheduling
2. Add cleanup and maintenance jobs
3. Monitor and optimize performance
4. Add analytics and monitoring

### Phase 4: Polish and Launch
1. Hide private game setup (park for later)
2. Add lobby game analytics
3. Optimize for mobile experience
4. Launch lobby system as default

## Success Metrics
- **Game Fill Rate**: % of scheduled games that start with 2+ players
- **Average Wait Time**: Time from joining to game start
- **Player Retention**: % of players who join multiple lobby games
- **Leave Rate**: % of players who leave before game starts
- **System Load**: Database queries and connection counts

## Future Enhancements (Not in MVP)
- **Game History**: View completed games and scores
- **Spectator Mode**: Watch active games
- **Multiple Lobby Games**: Queue multiple games simultaneously
- **Private Game Codes**: Premium feature for custom games
- **Player Profiles**: Track stats across multiple games