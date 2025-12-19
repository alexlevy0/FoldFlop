-- =============================================
-- FoldFlop Database Schema
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES (extends auth.users)
-- =============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  chips BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_daily_bonus TIMESTAMPTZ,
  welcome_bonus_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,16}$'),
  CONSTRAINT chips_non_negative CHECK (chips >= 0)
);

-- Index for username lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- RLS policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TABLES (poker tables)
-- =============================================

CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  blinds_sb INTEGER NOT NULL,
  blinds_bb INTEGER NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 6,
  min_buyin INTEGER NOT NULL DEFAULT 20, -- In BB
  max_buyin INTEGER NOT NULL DEFAULT 100, -- In BB
  turn_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_blinds CHECK (blinds_sb > 0 AND blinds_bb > blinds_sb),
  CONSTRAINT valid_max_players CHECK (max_players >= 2 AND max_players <= 9),
  CONSTRAINT valid_buyin CHECK (min_buyin > 0 AND max_buyin >= min_buyin),
  CONSTRAINT valid_timeout CHECK (turn_timeout_ms >= 5000 AND turn_timeout_ms <= 30000)
);

-- Index for lobby queries
CREATE INDEX idx_tables_public ON public.tables(is_private) WHERE NOT is_private;
CREATE INDEX idx_tables_invite_code ON public.tables(invite_code) WHERE invite_code IS NOT NULL;

-- RLS policies
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public tables are viewable by everyone"
  ON public.tables FOR SELECT
  USING (NOT is_private OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create tables"
  ON public.tables FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- TABLE PLAYERS (players seated at tables)
-- =============================================

CREATE TABLE public.table_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  stack BIGINT NOT NULL,
  is_sitting_out BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_seat CHECK (seat >= 0 AND seat < 9),
  CONSTRAINT stack_non_negative CHECK (stack >= 0),
  CONSTRAINT unique_seat_per_table UNIQUE (table_id, seat),
  CONSTRAINT unique_player_per_table UNIQUE (table_id, user_id)
);

-- Indexes
CREATE INDEX idx_table_players_table ON public.table_players(table_id);
CREATE INDEX idx_table_players_user ON public.table_players(user_id);

-- RLS policies
ALTER TABLE public.table_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Table players are viewable by everyone"
  ON public.table_players FOR SELECT
  USING (true);

-- =============================================
-- HANDS (hand history)
-- =============================================

CREATE TABLE public.hands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  hand_number INTEGER NOT NULL,
  pot BIGINT NOT NULL,
  board JSONB NOT NULL DEFAULT '[]',
  winners JSONB NOT NULL DEFAULT '[]',
  actions_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_hand_number UNIQUE (table_id, hand_number)
);

-- Index for history queries
CREATE INDEX idx_hands_table ON public.hands(table_id);
CREATE INDEX idx_hands_created ON public.hands(created_at DESC);

-- RLS policies
ALTER TABLE public.hands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hands are viewable by everyone"
  ON public.hands FOR SELECT
  USING (true);

-- =============================================
-- TRANSACTIONS (chip movements)
-- =============================================

CREATE TYPE transaction_type AS ENUM (
  'daily_bonus',
  'welcome_bonus', 
  'purchase',
  'table_buyin',
  'table_cashout',
  'win',
  'loss'
);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  type transaction_type NOT NULL,
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  hand_id UUID REFERENCES public.hands(id) ON DELETE SET NULL,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user transaction history
CREATE INDEX idx_transactions_user ON public.transactions(user_id, created_at DESC);

-- RLS policies
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================
-- LEADERBOARD
-- =============================================

CREATE TYPE leaderboard_period AS ENUM ('daily', 'weekly', 'monthly', 'alltime');

CREATE TABLE public.leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period leaderboard_period NOT NULL,
  chips_won BIGINT NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_user_period UNIQUE (user_id, period)
);

-- Index for leaderboard queries
CREATE INDEX idx_leaderboard_period_rank ON public.leaderboard(period, rank);

-- RLS policies
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaderboard is viewable by everyone"
  ON public.leaderboard FOR SELECT
  USING (true);

-- =============================================
-- ADMIN CONFIG
-- =============================================

CREATE TABLE public.admin_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only service role can modify
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read config"
  ON public.admin_config FOR SELECT
  USING (true);

-- Insert default config
INSERT INTO public.admin_config (key, value) VALUES
  ('daily_bonus', '10000'),
  ('welcome_bonus', '50000'),
  ('max_tables_per_player', '12'),
  ('chip_packages', '[
    {"id": "starter", "name": "Pack Starter", "chips": 50000, "priceEur": 2},
    {"id": "regular", "name": "Pack Regular", "chips": 150000, "priceEur": 5},
    {"id": "pro", "name": "Pack Pro", "chips": 350000, "priceEur": 10},
    {"id": "highroller", "name": "Pack High Roller", "chips": 800000, "priceEur": 20}
  ]');

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update chips (atomic)
CREATE OR REPLACE FUNCTION public.update_chips(
  p_user_id UUID,
  p_amount BIGINT,
  p_type transaction_type,
  p_table_id UUID DEFAULT NULL,
  p_hand_id UUID DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  -- Update balance
  UPDATE public.profiles
  SET chips = chips + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING chips INTO new_balance;
  
  -- Check for negative balance
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient chips';
  END IF;
  
  -- Log transaction
  INSERT INTO public.transactions (user_id, amount, type, table_id, hand_id, stripe_session_id)
  VALUES (p_user_id, p_amount, p_type, p_table_id, p_hand_id, p_stripe_session_id);
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim daily bonus
CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  last_claim TIMESTAMPTZ;
  bonus_amount BIGINT;
  new_balance BIGINT;
BEGIN
  -- Get last claim date
  SELECT last_daily_bonus INTO last_claim
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- Check if already claimed today
  IF last_claim IS NOT NULL AND last_claim::date = CURRENT_DATE THEN
    RAISE EXCEPTION 'Daily bonus already claimed';
  END IF;
  
  -- Get bonus amount from config
  SELECT (value)::BIGINT INTO bonus_amount
  FROM public.admin_config
  WHERE key = 'daily_bonus';
  
  -- Update profile
  UPDATE public.profiles
  SET chips = chips + bonus_amount,
      last_daily_bonus = NOW(),
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING chips INTO new_balance;
  
  -- Log transaction
  INSERT INTO public.transactions (user_id, amount, type)
  VALUES (p_user_id, bonus_amount, 'daily_bonus');
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to claim welcome bonus
CREATE OR REPLACE FUNCTION public.claim_welcome_bonus(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  already_claimed BOOLEAN;
  bonus_amount BIGINT;
  new_balance BIGINT;
BEGIN
  -- Check if already claimed
  SELECT welcome_bonus_claimed INTO already_claimed
  FROM public.profiles
  WHERE id = p_user_id;
  
  IF already_claimed THEN
    RAISE EXCEPTION 'Welcome bonus already claimed';
  END IF;
  
  -- Get bonus amount from config
  SELECT (value)::BIGINT INTO bonus_amount
  FROM public.admin_config
  WHERE key = 'welcome_bonus';
  
  -- Update profile
  UPDATE public.profiles
  SET chips = chips + bonus_amount,
      welcome_bonus_claimed = TRUE,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING chips INTO new_balance;
  
  -- Log transaction
  INSERT INTO public.transactions (user_id, amount, type)
  VALUES (p_user_id, bonus_amount, 'welcome_bonus');
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get table count for a user
CREATE OR REPLACE FUNCTION public.get_user_table_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.table_players
    WHERE user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;
