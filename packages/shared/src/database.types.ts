/**
 * Database types matching Supabase schema
 */

// ============== USERS / PROFILES ==============

export interface Profile {
    id: string; // Same as auth.users.id
    username: string;
    avatar_url: string | null;
    chips: number;
    created_at: string;
    updated_at: string;
    last_daily_bonus: string | null;
    welcome_bonus_claimed: boolean;
}

// ============== TABLES ==============

export interface Table {
    id: string;
    name: string;
    blinds_sb: number;
    blinds_bb: number;
    max_players: number;
    min_buyin: number; // In BB
    max_buyin: number; // In BB
    turn_timeout_ms: number;
    is_private: boolean;
    invite_code: string | null;
    created_by: string | null;
    created_at: string;
}

// ============== TABLE PLAYERS ==============

export interface TablePlayer {
    id: string;
    table_id: string;
    user_id: string;
    seat: number;
    stack: number;
    is_sitting_out: boolean;
    joined_at: string;

    // Joined data
    profile?: Pick<Profile, 'username' | 'avatar_url'>;
}

// ============== HANDS ==============

export interface Hand {
    id: string;
    table_id: string;
    hand_number: number;
    pot: number;
    board: string; // JSON array of cards
    winners: string; // JSON array of winner objects
    actions_json: string; // JSON array of actions
    created_at: string;
}

// ============== TRANSACTIONS ==============

export type TransactionType =
    | 'daily_bonus'
    | 'welcome_bonus'
    | 'purchase'
    | 'table_buyin'
    | 'table_cashout'
    | 'win'
    | 'loss';

export interface Transaction {
    id: string;
    user_id: string;
    amount: number; // Positive = credit, Negative = debit
    type: TransactionType;
    table_id: string | null;
    hand_id: string | null;
    stripe_session_id: string | null;
    created_at: string;
}

// ============== LEADERBOARD ==============

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'alltime';

export interface LeaderboardEntry {
    id: string;
    user_id: string;
    period: LeaderboardPeriod;
    chips_won: number;
    games_played: number;
    rank: number;
    updated_at: string;

    // Joined data
    profile?: Pick<Profile, 'username' | 'avatar_url'>;
}

// ============== ADMIN CONFIG ==============

export interface AdminConfig {
    key: string;
    value: string; // JSON string
    updated_at: string;
}

export type AdminConfigKey =
    | 'daily_bonus'
    | 'welcome_bonus'
    | 'max_tables_per_player'
    | 'chip_packages';

// ============== CHIP PACKAGES (stored in admin_config) ==============

export interface ChipPackage {
    id: string;
    name: string;
    chips: number;
    priceEur: number;
    stripePriceId: string;
    popular?: boolean;
}

// ============== GAME STATE (stored in memory/broadcast, not DB) ==============

export interface GameStateSnapshot {
    id: string;
    table_id: string;
    hand_number: number;
    phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

    dealer_index: number;
    current_player_index: number;
    current_bet: number;
    last_raise_amount: number;

    community_cards: string[];
    pots: Array<{
        amount: number;
        eligible_player_ids: string[];
    }>;

    players: Array<{
        id: string;
        seat_index: number;
        stack: number;
        current_bet: number;
        total_bet_this_hand: number;
        is_folded: boolean;
        is_all_in: boolean;
        hole_cards?: string[]; // Only visible to the player
    }>;

    turn_started_at: number;
    is_hand_complete: boolean;
}
