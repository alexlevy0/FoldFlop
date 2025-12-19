/**
 * WebSocket/Realtime event types for Supabase Broadcast
 */

// ============== EVENT TYPES ==============

export type GameEventType =
    | 'player_joined'
    | 'player_left'
    | 'hand_started'
    | 'cards_dealt'
    | 'player_action'
    | 'phase_changed'
    | 'pot_updated'
    | 'hand_complete'
    | 'player_timeout'
    | 'player_reconnected'
    | 'player_disconnected'
    | 'chat_message';

// ============== BASE EVENT ==============

export interface BaseGameEvent {
    type: GameEventType;
    tableId: string;
    timestamp: number;
    handNumber?: number;
}

// ============== PLAYER EVENTS ==============

export interface PlayerJoinedEvent extends BaseGameEvent {
    type: 'player_joined';
    player: {
        id: string;
        username: string;
        avatarUrl?: string;
        seatIndex: number;
        stack: number;
    };
}

export interface PlayerLeftEvent extends BaseGameEvent {
    type: 'player_left';
    playerId: string;
    seatIndex: number;
}

export interface PlayerDisconnectedEvent extends BaseGameEvent {
    type: 'player_disconnected';
    playerId: string;
}

export interface PlayerReconnectedEvent extends BaseGameEvent {
    type: 'player_reconnected';
    playerId: string;
}

// ============== GAME FLOW EVENTS ==============

export interface HandStartedEvent extends BaseGameEvent {
    type: 'hand_started';
    handNumber: number;
    dealerIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    smallBlindAmount: number;
    bigBlindAmount: number;
    playerStacks: Record<string, number>; // playerId -> stack
}

export interface CardsDealtEvent extends BaseGameEvent {
    type: 'cards_dealt';
    // Each player receives their own cards privately
    // This event is sent individually
    playerId: string;
    cards: string[]; // e.g. ["Ah", "Kd"]
}

export interface PlayerActionEvent extends BaseGameEvent {
    type: 'player_action';
    playerId: string;
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
    amount: number;
    newBet: number; // Player's new total bet
    newStack: number;
    pot: number;
    nextPlayerId: string | null;
    turnStartedAt: number;
}

export interface PhaseChangedEvent extends BaseGameEvent {
    type: 'phase_changed';
    phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    communityCards: string[]; // Current community cards
    pot: number;
    firstToAct: string | null; // Next player to act
    turnStartedAt: number;
}

export interface PotUpdatedEvent extends BaseGameEvent {
    type: 'pot_updated';
    mainPot: number;
    sidePots: Array<{
        amount: number;
        eligiblePlayerIds: string[];
    }>;
}

export interface HandCompleteEvent extends BaseGameEvent {
    type: 'hand_complete';
    winners: Array<{
        playerId: string;
        amount: number;
        hand?: {
            rank: string; // e.g. "full_house"
            description: string; // e.g. "Full House, Aces full of Kings"
            cards: string[]; // The 5 cards that made the hand
        };
    }>;
    playerCards: Record<string, string[]>; // Revealed cards at showdown
    nextHandIn: number; // Milliseconds until next hand
}

export interface PlayerTimeoutEvent extends BaseGameEvent {
    type: 'player_timeout';
    playerId: string;
    aiAction: 'fold' | 'check' | 'call' | 'bet' | 'raise';
    aiAmount: number;
}

// ============== CHAT EVENTS ==============

export type QuickChatMessage =
    | 'gg'
    | 'nh'
    | 'gl'
    | 'ty'
    | 'lol'
    | 'wow'
    | 'oops';

export type ChatReaction = '👍' | '😂' | '😮' | '😢' | '🔥';

export interface ChatMessageEvent extends BaseGameEvent {
    type: 'chat_message';
    playerId: string;
    username: string;
    message: QuickChatMessage | ChatReaction;
}

// ============== UNION TYPE ==============

export type GameEvent =
    | PlayerJoinedEvent
    | PlayerLeftEvent
    | PlayerDisconnectedEvent
    | PlayerReconnectedEvent
    | HandStartedEvent
    | CardsDealtEvent
    | PlayerActionEvent
    | PhaseChangedEvent
    | PotUpdatedEvent
    | HandCompleteEvent
    | PlayerTimeoutEvent
    | ChatMessageEvent;

// ============== PRESENCE ==============

export interface PlayerPresence {
    odId: string;
    oderId: string;
    sername: string;
    onlineAt: string;
    tableIds: string[]; // Tables they're connected to
}
