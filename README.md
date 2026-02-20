# ABTOW 2026 Open - Live Golf Scoring App

A Next.js web application for live scoring of the ABTOW 2026 Open golf tournament featuring real-time updates, mobile-optimized score entry, and comprehensive match tracking.

## Features

- **Live Scoring**: Real-time score updates via Supabase subscriptions
- **Mobile-First Design**: Optimized for on-course score entry on mobile devices  
- **Multiple Formats**: Supports Best Ball, Stableford, and Individual Match Play
- **Team Competition**: Track Team Shafts vs Team Balls across 3 days
- **Skins Tracking**: Net and Gross skins results with carryover
- **Newspaper Aesthetic**: Classic styling inspired by traditional golf scoring
- **Secure Access**: Group-based access tokens for score entry

## Tournament Structure

### Day 1 - Ritz Carlton GC (Blue Tees)
- **Format**: Team Best Ball Match Play
- **Groups**: 5 matches, 2-person teams
- **Scoring**: 3 points per match (front 9, back 9, overall)

### Day 2 - Southern Dunes (Blue/White Blended)  
- **Format**: Stableford
- **Groups**: 5 matches, 2-person teams
- **Scoring**: 3 points per match + 1 bonus point for best overall team

### Day 3 - Champions Gate International (White Tees)
- **Format**: Individual Match Play
- **Groups**: 5 groups, individual head-to-head matches
- **Scoring**: 3 points per individual match + 1 bonus point for best daily team total

## Technology Stack

- **Frontend**: Next.js 14+ with TypeScript
- **Styling**: Tailwind CSS with custom newspaper theme
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime subscriptions
- **Authentication**: Row Level Security with group access tokens

## Setup Instructions

### 1. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Copy and paste the entire contents of `supabase-setup.sql` 
4. Run the SQL to create all tables, insert seed data, and configure RLS policies
5. Go to Settings → API to get your project URL and anon key

### 2. Environment Setup

1. Clone or download this project
2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Update the Supabase configuration in `lib/supabase.ts`:
   ```typescript
   const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL'
   const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
   ```

### 3. Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

3. The app will load with all tournament data pre-seeded

### 4. Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy to your preferred platform (Vercel, Netlify, etc.)

3. Make sure to update the Supabase URL and keys for production

## Usage

### For Tournament Officials
- Navigate to the main leaderboard at `/` to see overall standings
- Click "View Day X Details" to see match-by-match results for each day
- Monitor real-time score updates as they come in from the course

### For Score Entry (On Course)
1. Navigate to `/score/[group-token]` using the specific token for your group
2. Use the mobile-optimized interface to enter scores hole-by-hole
3. Tap score numbers for quick entry or use the input field for custom scores
4. Navigate between holes using the hole selector at the bottom
5. Scores are saved automatically and sync in real-time

### Access Tokens

Each group has a unique access token for score entry:

**Day 1 (Best Ball)**
- Group 1: `group1-day1-token`
- Group 2: `group2-day1-token`
- Group 3: `group3-day1-token`  
- Group 4: `group4-day1-token`
- Group 5: `group5-day1-token`

**Day 2 (Stableford)**
- Group 1: `group1-day2-token`
- Group 2: `group2-day2-token`
- Group 3: `group3-day2-token`
- Group 4: `group4-day2-token`
- Group 5: `group5-day2-token`

**Day 3 (Individual)**
- Group 1: `group1-day3-token`
- Group 2: `group2-day3-token`
- Group 3: `group3-day3-token`
- Group 4: `group4-day3-token`
- Group 5: `group5-day3-token`

## Pages

- `/` - Main leaderboard with team standings and day tabs
- `/day/[1|2|3]` - Detailed results for each tournament day
- `/score/[token]` - Mobile score entry for specific groups
- `/match/[id]` - Detailed scorecard view for individual matches
- `/skins/[day]` - Net and gross skins results for each day

## Key Features

### Real-time Updates
The app uses Supabase's real-time subscriptions to automatically update scores across all connected devices when new scores are entered.

### Mobile Optimization
The score entry interface is specifically designed for mobile use on the golf course with large touch targets, simple navigation, and quick score entry options.

### Scoring Logic
- **Best Ball**: Takes lowest net score from each 2-person team per hole
- **Stableford**: Converts net scores to points (Double Bogey+ = 0, Bogey = 1, Par = 2, Birdie = 3, Eagle = 4, Albatross = 5)
- **Individual**: Head-to-head match play with handicap adjustments

### Security
Row Level Security ensures that score entry is restricted to authorized groups using access tokens, while all data remains publicly readable for viewing.

## Support

For technical issues or questions about the tournament format, contact the tournament organizers.

---

**ABTOW 2026 Open** - Good luck to all competitors!