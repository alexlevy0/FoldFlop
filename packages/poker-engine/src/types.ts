/**
 * Core types for the poker engine
 */

// Card suits
export type Suit = 'h' | 'd' | 'c' | 's';
export const SUITS: Suit[] = ['h', 'd', 'c', 's'];
export const SUIT_NAMES: Record<Suit, string> = {
    h: 'hearts',
    d: 'diamonds',
    c: 'clubs',
    s: 'spades',
};

// Card ranks (T = 10)
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANK_VALUES: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// A single card
export interface Card {
    rank: Rank;
    suit: Suit;
}

// Hand rankings from weakest to strongest
export type HandRank =
    | 'high_card'
    | 'pair'
    | 'two_pair'
    | 'three_of_a_kind'
    | 'straight'
    | 'flush'
    | 'full_house'
    | 'four_of_a_kind'
    | 'straight_flush'
    | 'royal_flush';

export const HAND_RANK_VALUES: Record<HandRank, number> = {
    high_card: 1,
    pair: 2,
    two_pair: 3,
    three_of_a_kind: 4,
    straight: 5,
    flush: 6,
    full_house: 7,
    four_of_a_kind: 8,
    straight_flush: 9,
    royal_flush: 10,
};

// Evaluated hand result
export interface EvaluatedHand {
    rank: HandRank;
    rankValue: number;
    cards: Card[]; // The 5 cards that make the hand
    kickers: number[]; // Kicker values for tiebreaking (highest first)
    description: string; // e.g., "Pair of Aces, King kicker"
}

// Player at a table
export interface Player {
    id: string;
    seatIndex: number;
    stack: number;
    holeCards: Card[] | null; // null if not dealt yet
    currentBet: number; // Amount bet in current betting round
    totalBetThisHand: number; // Total amount bet in the hand
    isFolded: boolean;
    isAllIn: boolean;
    isSittingOut: boolean;
    isDisconnected: boolean;
}

// Game phases
export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

// Player action types
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export interface PlayerAction {
    playerId: string;
    type: ActionType;
    amount: number; // 0 for fold/check
    timestamp: number;
}

// Valid actions a player can take
export interface ValidActions {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    callAmount: number;
    canBet: boolean;
    canRaise: boolean;
    minBet: number;
    maxBet: number;
    minRaise: number;
    maxRaise: number;
}

// Pot (main + side pots)
export interface Pot {
    amount: number;
    eligiblePlayerIds: string[];
}

// Complete game state
export interface GameState {
    id: string;
    tableId: string;
    handNumber: number;
    phase: GamePhase;

    // Players
    players: Player[];
    dealerIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    currentPlayerIndex: number;

    // Cards
    deck: Card[]; // Remaining cards in deck (server only)
    communityCards: Card[];
    burnedCards: Card[];

    // Betting
    smallBlind: number;
    bigBlind: number;
    currentBet: number; // Current bet to call
    lastRaiseAmount: number; // For calculating min raise
    minRaise: number;

    // Pots
    pots: Pot[];

    // History
    actions: PlayerAction[];

    // Timing
    turnStartedAt: number;
    turnTimeoutMs: number;

    // Flags
    isHandComplete: boolean;
    winners: HandWinner[] | null;
}

// Winner information
export interface HandWinner {
    playerId: string;
    potIndex: number;
    amount: number;
    hand: EvaluatedHand | null; // null if won without showdown
}

// Table configuration
export interface TableConfig {
    id: string;
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number; // In BB
    maxBuyIn: number; // In BB
    turnTimeoutMs: number;
    isPrivate: boolean;
    inviteCode: string | null;
}

// Position at the table
export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'UTG1' | 'UTG2' | 'MP' | 'MP1' | 'MP2' | 'CO';

// Get position name based on seat position relative to dealer
export function getPositionName(
    seatIndex: number,
    dealerIndex: number,
    activePlayers: number
): Position {
    const position = (seatIndex - dealerIndex + activePlayers) % activePlayers;

    if (activePlayers === 2) {
        // Heads-up: BTN is SB
        return position === 0 ? 'BTN' : 'BB';
    }

    if (position === 0) return 'BTN';
    if (position === 1) return 'SB';
    if (position === 2) return 'BB';
    if (position === activePlayers - 1) return 'CO';
    if (position === 3) return 'UTG';
    if (position === 4) return activePlayers > 6 ? 'UTG1' : 'MP';
    if (position === 5) return activePlayers > 6 ? 'UTG2' : 'MP1';
    if (position === 6) return 'MP';
    if (position === 7) return 'MP1';

    return 'MP2';
}
