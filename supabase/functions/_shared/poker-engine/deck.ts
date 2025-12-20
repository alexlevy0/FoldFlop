/**
 * Deck management - creation and shuffling
 */

import { Card, Rank, Suit, RANKS, SUITS } from './types.ts';

/**
 * Create a new 52-card deck
 */
export function createDeck(): Card[] {
    const deck: Card[] = [];

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }

    return deck;
}

/**
 * Shuffle deck using Fisher-Yates algorithm
 * Uses crypto.getRandomValues for cryptographically secure randomness
 */
export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    const n = shuffled.length;

    // Use crypto for secure randomness
    const randomValues = new Uint32Array(n);
    crypto.getRandomValues(randomValues);

    for (let i = n - 1; i > 0; i--) {
        // Generate random index from 0 to i (inclusive)
        const j = randomValues[i] % (i + 1);
        // Swap elements
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

/**
 * Create a fresh shuffled deck
 */
export function createShuffledDeck(): Card[] {
    return shuffleDeck(createDeck());
}

/**
 * Deal cards from the top of the deck
 * Returns [dealt cards, remaining deck]
 */
export function dealCards(deck: Card[], count: number): [Card[], Card[]] {
    if (count > deck.length) {
        throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
    }

    const dealt = deck.slice(0, count);
    const remaining = deck.slice(count);

    return [dealt, remaining];
}

/**
 * Convert card to string representation (e.g., "Ah" for Ace of hearts)
 */
export function cardToString(card: Card): string {
    return `${card.rank}${card.suit}`;
}

/**
 * Parse card from string (e.g., "Ah" -> { rank: 'A', suit: 'h' })
 */
export function parseCard(str: string): Card {
    if (str.length !== 2) {
        throw new Error(`Invalid card string: ${str}`);
    }

    const rank = str[0].toUpperCase() as Rank;
    const suit = str[1].toLowerCase() as Suit;

    if (!RANKS.includes(rank)) {
        throw new Error(`Invalid rank: ${rank}`);
    }
    if (!SUITS.includes(suit)) {
        throw new Error(`Invalid suit: ${suit}`);
    }

    return { rank, suit };
}

/**
 * Parse multiple cards from space-separated string
 */
export function parseCards(str: string): Card[] {
    return str.split(/\s+/).filter(Boolean).map(parseCard);
}

/**
 * Check if two cards are equal
 */
export function cardsEqual(a: Card, b: Card): boolean {
    return a.rank === b.rank && a.suit === b.suit;
}

/**
 * Remove specific cards from a deck
 */
export function removeCards(deck: Card[], toRemove: Card[]): Card[] {
    return deck.filter(card =>
        !toRemove.some(remove => cardsEqual(card, remove))
    );
}
