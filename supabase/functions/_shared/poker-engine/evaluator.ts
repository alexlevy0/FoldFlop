/**
 * Hand evaluation - determines the best 5-card poker hand
 */

import {
    Card,
    EvaluatedHand,
    HandRank,
    HAND_RANK_VALUES,
    RANK_VALUES,
    Rank,
    Suit,
} from './types.ts';

/**
 * Evaluate the best 5-card hand from any number of cards (typically 7 in Hold'em)
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
    if (cards.length < 5) {
        throw new Error('Need at least 5 cards to evaluate a hand');
    }

    // Generate all 5-card combinations
    const combinations = getCombinations(cards, 5);

    let bestHand: EvaluatedHand | null = null;

    for (const combo of combinations) {
        const evaluated = evaluateFiveCards(combo);
        if (!bestHand || compareHands(evaluated, bestHand) > 0) {
            bestHand = evaluated;
        }
    }

    return bestHand!;
}

/**
 * Evaluate exactly 5 cards
 */
function evaluateFiveCards(cards: Card[]): EvaluatedHand {
    if (cards.length !== 5) {
        throw new Error('Must have exactly 5 cards');
    }

    // Sort by rank value descending
    const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);

    const isFlush = checkFlush(sorted);
    const straightHighCard = checkStraight(sorted);
    const isStraight = straightHighCard !== null;

    // Count ranks
    const rankCounts = getRankCounts(sorted);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    // Determine hand rank
    if (isFlush && isStraight) {
        if (straightHighCard === 14) { // Ace high
            return {
                rank: 'royal_flush',
                rankValue: HAND_RANK_VALUES.royal_flush,
                cards: sorted,
                kickers: [14],
                description: 'Royal Flush',
            };
        }
        return {
            rank: 'straight_flush',
            rankValue: HAND_RANK_VALUES.straight_flush,
            cards: sorted,
            kickers: [straightHighCard],
            description: `Straight Flush, ${rankName(straightHighCard)} high`,
        };
    }

    if (counts[0] === 4) {
        const quadRank = findRankWithCount(rankCounts, 4);
        const kicker = findRankWithCount(rankCounts, 1);
        return {
            rank: 'four_of_a_kind',
            rankValue: HAND_RANK_VALUES.four_of_a_kind,
            cards: sorted,
            kickers: [quadRank, kicker],
            description: `Four of a Kind, ${rankName(quadRank)}s`,
        };
    }

    if (counts[0] === 3 && counts[1] === 2) {
        const tripRank = findRankWithCount(rankCounts, 3);
        const pairRank = findRankWithCount(rankCounts, 2);
        return {
            rank: 'full_house',
            rankValue: HAND_RANK_VALUES.full_house,
            cards: sorted,
            kickers: [tripRank, pairRank],
            description: `Full House, ${rankName(tripRank)}s full of ${rankName(pairRank)}s`,
        };
    }

    if (isFlush) {
        const kickers = sorted.map(c => RANK_VALUES[c.rank]);
        return {
            rank: 'flush',
            rankValue: HAND_RANK_VALUES.flush,
            cards: sorted,
            kickers,
            description: `Flush, ${rankName(kickers[0])} high`,
        };
    }

    if (isStraight) {
        return {
            rank: 'straight',
            rankValue: HAND_RANK_VALUES.straight,
            cards: sorted,
            kickers: [straightHighCard],
            description: `Straight, ${rankName(straightHighCard)} high`,
        };
    }

    if (counts[0] === 3) {
        const tripRank = findRankWithCount(rankCounts, 3);
        const kickers = sorted
            .filter(c => RANK_VALUES[c.rank] !== tripRank)
            .map(c => RANK_VALUES[c.rank])
            .slice(0, 2);
        return {
            rank: 'three_of_a_kind',
            rankValue: HAND_RANK_VALUES.three_of_a_kind,
            cards: sorted,
            kickers: [tripRank, ...kickers],
            description: `Three of a Kind, ${rankName(tripRank)}s`,
        };
    }

    if (counts[0] === 2 && counts[1] === 2) {
        const pairs = Object.entries(rankCounts)
            .filter(([_, count]) => count === 2)
            .map(([rank, _]) => RANK_VALUES[rank as Rank])
            .sort((a, b) => b - a);
        const kicker = findRankWithCount(rankCounts, 1);
        return {
            rank: 'two_pair',
            rankValue: HAND_RANK_VALUES.two_pair,
            cards: sorted,
            kickers: [...pairs, kicker],
            description: `Two Pair, ${rankName(pairs[0])}s and ${rankName(pairs[1])}s`,
        };
    }

    if (counts[0] === 2) {
        const pairRank = findRankWithCount(rankCounts, 2);
        const kickers = sorted
            .filter(c => RANK_VALUES[c.rank] !== pairRank)
            .map(c => RANK_VALUES[c.rank])
            .slice(0, 3);
        return {
            rank: 'pair',
            rankValue: HAND_RANK_VALUES.pair,
            cards: sorted,
            kickers: [pairRank, ...kickers],
            description: `Pair of ${rankName(pairRank)}s`,
        };
    }

    // High card
    const kickers = sorted.map(c => RANK_VALUES[c.rank]);
    return {
        rank: 'high_card',
        rankValue: HAND_RANK_VALUES.high_card,
        cards: sorted,
        kickers,
        description: `${rankName(kickers[0])} high`,
    };
}

/**
 * Compare two evaluated hands
 * Returns > 0 if hand1 wins, < 0 if hand2 wins, 0 if tie
 */
export function compareHands(hand1: EvaluatedHand, hand2: EvaluatedHand): number {
    // First compare hand rank
    if (hand1.rankValue !== hand2.rankValue) {
        return hand1.rankValue - hand2.rankValue;
    }

    // Same rank - compare kickers
    for (let i = 0; i < Math.min(hand1.kickers.length, hand2.kickers.length); i++) {
        if (hand1.kickers[i] !== hand2.kickers[i]) {
            return hand1.kickers[i] - hand2.kickers[i];
        }
    }

    // Exact tie
    return 0;
}

/**
 * Check if cards form a flush (all same suit)
 */
function checkFlush(cards: Card[]): boolean {
    const suit = cards[0].suit;
    return cards.every(c => c.suit === suit);
}

/**
 * Check if cards form a straight
 * Returns the high card value if straight, null otherwise
 * Handles A-2-3-4-5 (wheel) special case
 */
function checkStraight(cards: Card[]): number | null {
    const values = [...new Set(cards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);

    if (values.length !== 5) return null;

    // Normal straight
    if (values[0] - values[4] === 4) {
        return values[0];
    }

    // Wheel (A-2-3-4-5) - Ace counts as 1
    if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
        return 5; // 5 is the high card for a wheel
    }

    return null;
}

/**
 * Count occurrences of each rank
 */
function getRankCounts(cards: Card[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const card of cards) {
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    }
    return counts;
}

/**
 * Find the rank with a specific count, returning its value
 */
function findRankWithCount(counts: Record<string, number>, count: number): number {
    const ranks = Object.entries(counts)
        .filter(([_, c]) => c === count)
        .map(([rank, _]) => RANK_VALUES[rank as Rank])
        .sort((a, b) => b - a);
    return ranks[0];
}

/**
 * Get all combinations of k elements from array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];

    const [first, ...rest] = arr;

    // Combinations that include first element
    const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);

    // Combinations that don't include first element
    const withoutFirst = getCombinations(rest, k);

    return [...withFirst, ...withoutFirst];
}

/**
 * Get human-readable rank name
 */
function rankName(value: number): string {
    switch (value) {
        case 14: return 'Ace';
        case 13: return 'King';
        case 12: return 'Queen';
        case 11: return 'Jack';
        case 10: return 'Ten';
        case 9: return 'Nine';
        case 8: return 'Eight';
        case 7: return 'Seven';
        case 6: return 'Six';
        case 5: return 'Five';
        case 4: return 'Four';
        case 3: return 'Three';
        case 2: return 'Two';
        default: return String(value);
    }
}

/**
 * Calculate hand equity (approximate) vs random hands
 * This is a simplified version - real equity calculation needs Monte Carlo simulation
 */
export function calculateHandStrength(
    holeCards: Card[],
    communityCards: Card[],
): number {
    const allCards = [...holeCards, ...communityCards];

    if (communityCards.length === 0) {
        // Preflop - use preflop hand rankings
        return calculatePreflopStrength(holeCards);
    }

    // Postflop - evaluate current hand
    const hand = evaluateHand(allCards);

    // Normalize to 0-1 based on hand rank and kickers
    // This is a rough approximation
    let strength = (hand.rankValue - 1) / 9; // Base from hand rank

    // Adjust based on kickers (small adjustment)
    if (hand.kickers.length > 0) {
        strength += (hand.kickers[0] - 2) / (14 - 2) * 0.1;
    }

    return Math.min(1, Math.max(0, strength));
}

/**
 * Simple preflop hand strength based on card ranks
 */
function calculatePreflopStrength(holeCards: Card[]): number {
    const [card1, card2] = holeCards;
    const rank1 = RANK_VALUES[card1.rank];
    const rank2 = RANK_VALUES[card2.rank];
    const highRank = Math.max(rank1, rank2);
    const lowRank = Math.min(rank1, rank2);
    const isPair = rank1 === rank2;
    const isSuited = card1.suit === card2.suit;
    const gap = highRank - lowRank;

    let strength = 0;

    if (isPair) {
        // Pairs: AA = 1.0, 22 = 0.5
        strength = 0.5 + (highRank - 2) / (14 - 2) * 0.5;
    } else {
        // Non-pairs: based on high card, low card, suitedness, connectedness
        strength = 0.1 + (highRank - 2) / (14 - 2) * 0.3 + (lowRank - 2) / (14 - 2) * 0.2;

        if (isSuited) {
            strength += 0.05;
        }

        // Connected cards get a bonus (smaller gap = better)
        if (gap <= 4 && gap > 0) {
            strength += (5 - gap) * 0.02;
        }
    }

    return Math.min(1, Math.max(0, strength));
}
