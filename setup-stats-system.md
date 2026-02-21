# ABTOW Player Statistics System Setup

This system tracks comprehensive player statistics including match records, score distribution, handicap performance, and hole-by-hole analysis.

## Features Added

### 1. Database Schema
- **player_stats**: Overall tournament statistics per player
- **player_daily_stats**: Per-round performance tracking
- **player_hole_stats**: Hole-by-hole performance analysis

### 2. Statistics Tracked
- **Match Records**: Team and individual match wins/losses/ties
- **Score Distribution**: Eagles, birdies, pars, bogeys, double bogeys, triple+ 
- **Scoring Averages**: Gross and net scoring averages by course/day
- **Handicap Performance**: Rounds under/at/over handicap
- **Best/Worst Holes**: Performance analysis by hole
- **Round Highlights**: Best and worst rounds

### 3. User Interface
- **Statistics Page** (`/statistics`): Tournament-wide stats overview with sortable leaderboards
- **Player Stats Modal**: Detailed stats overlay with 3 tabs (Overview, Daily Performance, Hole Analysis)
- **Player Profile Integration**: "View Statistics" button on each player profile

### 4. Automated Processing
- **Post-Round Processor**: Automatically calculates stats when rounds are complete
- **Real-time Updates**: Stats update as scores are entered
- **Match Record Tracking**: Win/loss records for team and individual formats

## Database Setup

1. Run the SQL commands in `lib/player-stats.sql` to create the new tables and functions:

```sql
-- Execute the entire contents of lib/player-stats.sql in your Supabase SQL editor
```

2. The system includes these PostgreSQL functions:
   - `upsert_player_stats()`: Updates overall player statistics
   - `upsert_hole_stats()`: Updates hole-by-hole statistics  
   - `update_match_record()`: Updates win/loss records

## Usage

### Automatic Stats Processing
The system automatically processes player statistics when:
- A player completes all 18 holes in a round
- Match results are finalized (via the PostRoundProcessor)

### Manual Stats Processing
You can also trigger stats processing manually:

```typescript
import PostRoundProcessor from '@/lib/post-round-processor'

// Process a specific player's completed round
await PostRoundProcessor.processPlayerRound(playerId, matchId)

// Process all players in a completed match
await PostRoundProcessor.processMatchCompletion(matchId)

// Check if a round is complete and process if so
await PostRoundProcessor.checkAndProcessRound(playerId, matchId)
```

### Integration with Scoring System
To integrate with the existing scoring system, add this call after score updates:

```typescript
import PostRoundProcessor from '@/lib/post-round-processor'

// After updating a player's score
await PostRoundProcessor.checkAndProcessRound(playerId, matchId)
```

## Navigation

- **Statistics Page**: Added to main navigation menu (`/statistics`)
- **Player Stats Modal**: Accessible from player profiles and statistics page
- **Direct Links**: Statistics page includes links to individual player profiles

## Tournament Leaders

The statistics page automatically identifies and highlights:
- Lowest scoring average
- Most birdies
- Best performance vs handicap
- Most consistent player (highest par percentage)

## Data Export

All stats are stored in PostgreSQL and can be queried directly for additional analysis or reporting.

## Future Enhancements

Potential additions:
- Historical tournament comparisons
- Advanced analytics (scrambling %, putting performance)
- Team performance metrics
- Real-time leaderboard updates during play
- Mobile-optimized stat widgets

## Files Added/Modified

### New Files
- `lib/player-stats.sql` - Database schema and functions
- `lib/stats-service.ts` - Statistics calculation and data service
- `lib/post-round-processor.ts` - Automated stats processing
- `app/statistics/page.tsx` - Main statistics page
- `app/components/PlayerStatsModal.tsx` - Stats modal component

### Modified Files
- `lib/supabase.ts` - Added TypeScript types for new tables
- `app/players/[name]/page.tsx` - Added "View Statistics" button
- `app/components/Layout.tsx` - Added Statistics navigation link

The system is now ready for use once the database tables are created!