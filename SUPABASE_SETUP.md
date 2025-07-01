# Supabase Setup Guide

## Step 1: Create New Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create account
3. Click "New Project"
4. Choose organization and fill in:
   - **Name**: `relic-rush-game` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your location
5. Click "Create new project"
6. Wait for project to initialize (2-3 minutes)

## Step 2: Get Your Credentials

Once your project is ready:

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (starts with `https://`)
   - **anon public key** (long string starting with `eyJ`)

## Step 3: Create Environment File

Create a `.env` file in your project root with:

```env
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace the placeholder values with your actual credentials from Step 2.

## Step 4: Run Database Migrations

After setting up your `.env` file, we'll run the database setup script to create all the necessary tables and functions.

## What This Will Create

- **game_sessions** table: Stores multiplayer games with lobby system support
- **player_boards** table: Stores individual player game states
- **Database functions**: Lobby management, game timeouts, hint calculations
- **Row Level Security**: Proper access controls for multiplayer games
- **Indexes**: Optimized for fast queries

## Ready?

Once you have your Supabase project created and `.env` file set up, let me know and I'll run the database setup!