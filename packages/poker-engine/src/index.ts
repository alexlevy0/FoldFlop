/**
 * Poker Engine - Core game logic for Texas Hold'em
 * 
 * This package provides pure functions for poker game logic:
 * - Deck management and shuffling
 * - Hand evaluation
 * - Pot calculation with side pots
 * - Betting rules and validation
 * - Game state machine
 */

// Types
export * from './types';

// Re-export specific constants that are used by other packages
export { RANK_VALUES, RANKS, SUITS, HAND_RANK_VALUES } from './types';

// Deck utilities
export {
    createDeck,
    shuffleDeck,
    createShuffledDeck,
    dealCards,
    cardToString,
    parseCard,
    parseCards,
    cardsEqual,
    removeCards,
} from './deck';

// Hand evaluation
export {
    evaluateHand,
    compareHands,
    calculateHandStrength,
} from './evaluator';

// Pot calculation
export {
    calculatePots,
    getTotalPot,
    distributePot,
    calculatePotOdds,
    getEffectiveStack,
    calculateSPR,
} from './pot';

// Betting
export {
    getValidActions,
    validateAction,
    getCallAmount,
    isRoundComplete,
    getNextPlayerIndex,
    getFirstToActIndex,
} from './betting';

// Game state machine
export {
    createGameState,
    startHand,
    processAction,
    isHandComplete,
    getCurrentPot,
} from './game';
