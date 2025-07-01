# Polling Migration Plan

## Current Polling Implementation

### Where Polling is Used
1. **`useMultiplayerGame.ts` - `startPolling()` function**
   - Polls every 1 second for game updates
   - Updates session data, other players, and own board state
   - Checks for game completion
   - Activates games when new players join

### What Gets Polled
1. **Game Session Data** (`game_sessions` table)
   - Status changes (waiting → active → completed)
   - Central discoveries log (`all_discoveries`)
   - Game metadata and timestamps

2. **Other Players** (`player_boards` table)
   - Board states of other players
   - Scores and remaining digs
   - Discovery counts

3. **Own Board State** (`player_boards` table)
   - Updated sub-grid hints
   - Latest board state after other players' moves

### Performance Issues
- **High Database Load**: 1-second intervals create constant queries
- **Unnecessary Updates**: Polling even when no changes occur
- **Scaling Problems**: N players = N polling connections per game
- **Battery Drain**: Constant network requests on mobile devices
- **Race Conditions**: Multiple rapid updates can cause conflicts

## Migration to Supabase Realtime

### Subscription Strategy

#### 1. Game Session Subscription
```typescript
// Subscribe to game session changes
const sessionSubscription = supabase
  .channel(`game_session_${sessionId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'game_sessions',
    filter: `id=eq.${sessionId}`
  }, handleSessionUpdate)
  .subscribe()
```

#### 2. Player Boards Subscription
```typescript
// Subscribe to all player boards in session
const boardsSubscription = supabase
  .channel(`session_boards_${sessionId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'player_boards',
    filter: `session_id=eq.${sessionId}`
  }, handleBoardUpdate)
  .subscribe()
```

### Implementation Steps

#### Phase 1: Add Subscriptions Alongside Polling
1. Create new `useRealtimeSubscriptions` hook
2. Set up session and board subscriptions
3. Handle incoming updates in parallel with polling
4. Add feature flag to switch between polling/subscriptions

#### Phase 2: Replace Polling Logic
1. Remove polling intervals
2. Replace polling-based state updates with subscription handlers
3. Keep immediate completion checks for responsive UX
4. Add connection status monitoring

#### Phase 3: Optimize and Clean Up
1. Remove all polling code
2. Add reconnection logic for dropped connections
3. Implement subscription cleanup on unmount
4. Add error handling for subscription failures

### Benefits After Migration
- **Instant Updates**: Real-time changes without 1-second delay
- **Reduced Load**: Only updates when actual changes occur
- **Better Scaling**: Supabase handles connection management
- **Lower Latency**: Direct database change notifications
- **Battery Friendly**: No constant polling requests

### Challenges to Address
1. **Connection Management**: Handle dropped connections gracefully
2. **Initial State**: Ensure proper state loading before subscriptions
3. **Race Conditions**: Handle rapid updates correctly
4. **Error Recovery**: Fallback mechanisms if subscriptions fail
5. **Testing**: Mock subscriptions for development/testing

### Migration Timeline
- **Week 1**: Implement subscription hooks alongside polling
- **Week 2**: Test subscription reliability and performance
- **Week 3**: Switch default to subscriptions with polling fallback
- **Week 4**: Remove polling code and optimize subscriptions