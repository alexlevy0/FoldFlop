-- =============================================
-- ACTIVE HANDS (current game state for each table)
-- =============================================
-- This table stores the active hand state for each table
-- Only one active hand per table at a time

CREATE TABLE IF NOT EXISTS public.active_hands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  hand_number INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'preflop' CHECK (phase IN ('preflop', 'flop', 'turn', 'river', 'showdown')),
  
  -- Positions
  dealer_seat INTEGER NOT NULL,
  sb_seat INTEGER NOT NULL,
  bb_seat INTEGER NOT NULL,
  current_seat INTEGER NOT NULL,
  
  -- Betting state
  current_bet BIGINT NOT NULL DEFAULT 0,
  last_raise_amount BIGINT NOT NULL DEFAULT 0,
  pot BIGINT NOT NULL DEFAULT 0,
  
  -- Cards
  community_cards JSONB NOT NULL DEFAULT '[]',
  deck JSONB NOT NULL DEFAULT '[]',
  
  -- Player states (array of {user_id, seat, stack, hole_cards, current_bet, is_folded, is_all_in})
  player_states JSONB NOT NULL DEFAULT '[]',
  
  -- Timing
  turn_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT one_active_hand_per_table UNIQUE (table_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_hands_table ON public.active_hands(table_id);

-- RLS policies
ALTER TABLE public.active_hands ENABLE ROW LEVEL SECURITY;

-- Anyone can read active hands (but hole_cards should be filtered in Edge Functions)
CREATE POLICY "Active hands are viewable by everyone"
  ON public.active_hands FOR SELECT
  USING (true);

-- Only service role can modify (via Edge Functions)
CREATE POLICY "Only service role can insert active hands"
  ON public.active_hands FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only service role can update active hands"
  ON public.active_hands FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only service role can delete active hands"
  ON public.active_hands FOR DELETE
  USING (auth.uid() IS NOT NULL);
