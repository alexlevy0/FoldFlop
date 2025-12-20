/**
 * API Request/Response types for Edge Functions
 */

// ============== JOIN TABLE ==============

export interface JoinTableRequest {
    tableId: string;
    seatIndex: number;
    buyIn: number; // Amount in chips
}

export interface JoinTableResponse {
    success: boolean;
    error?: string;
    data?: {
        playerId: string;
        seatIndex: number;
        stack: number;
    };
}

// ============== LEAVE TABLE ==============

export interface LeaveTableRequest {
    tableId: string;
}

export interface LeaveTableResponse {
    success: boolean;
    error?: string;
    data?: {
        cashOut: number; // Amount returned to balance
    };
}

// ============== PLAYER ACTION ==============

export type ActionRequest =
    | { type: 'fold' }
    | { type: 'check' }
    | { type: 'call' }
    | { type: 'bet'; amount: number }
    | { type: 'raise'; amount: number }
    | { type: 'all_in' };

export interface PlayerActionRequest {
    tableId: string;
    action: ActionRequest;
    actionId?: string; // For idempotency
}

export interface PlayerActionResponse {
    success: boolean;
    error?: string;
    alreadyProcessed?: boolean;
    data?: {
        actionId: string;
        newPot: number;
        nextPlayerId: string | null;
    };
}

// ============== CREATE TABLE ==============

export interface CreateTableRequest {
    name: string;
    maxPlayers: 2 | 6 | 9;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number; // In BB
    maxBuyIn: number; // In BB
    isPrivate: boolean;
    turnTimeoutMs?: number;
}

export interface CreateTableResponse {
    success: boolean;
    error?: string;
    data?: {
        tableId: string;
        inviteCode?: string;
    };
}

// ============== GET TABLES (Lobby) ==============

export interface GetTablesRequest {
    filter?: {
        minBlind?: number;
        maxBlind?: number;
        minPlayers?: number;
        maxPlayers?: number;
        hasSeats?: boolean;
    };
    limit?: number;
    offset?: number;
}

export interface TableListItem {
    id: string;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    currentPlayers: number;
    avgStack: number;
    isPrivate: boolean;
    isWaiting: boolean; // Not enough players to play
}

export interface GetTablesResponse {
    success: boolean;
    error?: string;
    data?: {
        tables: TableListItem[];
        total: number;
    };
}

// ============== GET TABLE STATE ==============

export interface GetTableStateRequest {
    tableId: string;
}

export interface GetTableStateResponse {
    success: boolean;
    error?: string;
    data?: TableState;
}

// ============== CLAIM BONUS ==============

export interface ClaimBonusRequest {
    bonusType: 'daily' | 'welcome';
}

export interface ClaimBonusResponse {
    success: boolean;
    error?: string;
    data?: {
        amount: number;
        newBalance: number;
    };
}

// ============== CREATE CHECKOUT (Stripe) ==============

export interface CreateCheckoutRequest {
    packageId: string;
}

export interface CreateCheckoutResponse {
    success: boolean;
    error?: string;
    data?: {
        checkoutUrl: string;
        sessionId: string;
    };
}

// ============== AUTH ==============

export interface SignUpRequest {
    email: string;
    password: string;
    username: string;
}

export interface SignUpResponse {
    success: boolean;
    error?: string;
    data?: {
        userId: string;
        requiresEmailVerification: boolean;
    };
}

export interface CheckUsernameRequest {
    username: string;
}

export interface CheckUsernameResponse {
    available: boolean;
}

// ============== TABLE STATE (Full) ==============

export interface TableState {
    id: string;
    name: string;
    blinds: {
        sb: number;
        bb: number;
    };
    maxPlayers: number;
    turnTimeout: number;
    isPrivate: boolean;
    phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    pot: number;
    pots: Array<{ amount: number; eligiblePlayerIds: string[] }>;
    currentBet: number;
    communityCards: string[];
    dealerIndex: number;
    currentPlayerIndex: number;
    turnStartTime: number | null;
    handNumber: number;
    players: TablePlayerState[];
    myCards?: string[];
}

export interface TablePlayerState {
    id: string;
    username: string;
    avatarUrl?: string;
    seatIndex: number;
    stack: number;
    currentBet: number;
    isFolded: boolean;
    isAllIn: boolean;
    isSittingOut: boolean;
    isDisconnected: boolean;
    isCurrentPlayer: boolean;
    hasCards: boolean; // True if dealt cards (but we don't see them)
    cards?: string[]; // Only visible at showdown
}
