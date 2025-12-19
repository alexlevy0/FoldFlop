/**
 * Shared types between frontend and backend
 */

// API types
export * from './api.types';

// WebSocket event types
export * from './events.types';

// Database types
export * from './database.types';

// ============== TABLE LIST TYPES ==============

export interface TableListItem {
    id: string;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    currentPlayers: number;
    avgStack: number;
    isPrivate: boolean;
    isWaiting: boolean;
}

// ============== CONSTANTS ==============

export const TABLE_LEVELS = [
    { name: 'Micro', sb: 1, bb: 2, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'Low', sb: 5, bb: 10, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'Medium', sb: 25, bb: 50, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'High', sb: 100, bb: 200, minBuyIn: 20, maxBuyIn: 100 },
    { name: 'VIP', sb: 500, bb: 1000, minBuyIn: 20, maxBuyIn: 100 },
] as const;

export const DEFAULT_CONFIG = {
    dailyBonus: 10000,
    welcomeBonus: 50000,
    maxTablesPerPlayer: 12,
    defaultTurnTimeoutMs: 10000, // 10 seconds
    minTurnTimeoutMs: 5000,
    maxTurnTimeoutMs: 30000,
    disconnectGraceMs: 30000, // 30 seconds
    sitOutMaxHands: 10,
} as const;

export const CHIP_PACKAGES: Array<{
    id: string;
    name: string;
    chips: number;
    priceEur: number;
}> = [
        { id: 'starter', name: 'Pack Starter', chips: 50000, priceEur: 2 },
        { id: 'regular', name: 'Pack Regular', chips: 150000, priceEur: 5 },
        { id: 'pro', name: 'Pack Pro', chips: 350000, priceEur: 10 },
        { id: 'highroller', name: 'Pack High Roller', chips: 800000, priceEur: 20 },
    ];

// ============== UTILITY TYPES ==============

export type Result<T, E = string> =
    | { success: true; data: T }
    | { success: false; error: E };

export type Nullable<T> = T | null;

// ============== VALIDATION ==============

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;

export function isValidUsername(username: string): boolean {
    return USERNAME_REGEX.test(username);
}

export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
