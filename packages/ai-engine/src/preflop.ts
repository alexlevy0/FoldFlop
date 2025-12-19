/**
 * Preflop decision engine using GTO charts
 */

import { Card, Position, ActionType, RANK_VALUES } from '@foldflop/poker-engine';
import preflopOpenCharts from './charts/preflop-open.json';
import preflopVsRaiseCharts from './charts/preflop-vsraise.json';

export interface PreflopSuggestion {
    action: ActionType;
    raiseSize?: number;
    confidence: number;
    reason: string;
}

interface OpenChart {
    open: string[];
    openRaiseSize: number;
}

interface VsRaiseChart {
    '3bet': string[];
    call: string[];
    '3betSize': number;
}

type TableFormat = '6max' | '9max' | 'headsUp';

/**
 * Convert hole cards to a hand notation (e.g., "AKs" or "AKo")
 */
export function getHandNotation(cards: Card[]): string {
    if (cards.length !== 2) {
        throw new Error('Need exactly 2 hole cards');
    }

    const [card1, card2] = cards;
    const rank1 = RANK_VALUES[card1.rank];
    const rank2 = RANK_VALUES[card2.rank];

    // Put higher rank first
    const highCard = rank1 >= rank2 ? card1 : card2;
    const lowCard = rank1 >= rank2 ? card2 : card1;

    const suited = highCard.suit === lowCard.suit;
    const paired = highCard.rank === lowCard.rank;

    if (paired) {
        return `${highCard.rank}${lowCard.rank}`;
    }

    return `${highCard.rank}${lowCard.rank}${suited ? 's' : 'o'}`;
}

/**
 * Get the table format based on number of players
 */
function getTableFormat(playerCount: number): TableFormat {
    if (playerCount === 2) return 'headsUp';
    if (playerCount <= 6) return '6max';
    return '9max';
}

/**
 * Check if a hand is in a range
 */
function isHandInRange(handNotation: string, range: string[]): boolean {
    // Direct match
    if (range.includes(handNotation)) {
        return true;
    }

    // Check for range notation (e.g., "22+" means all pairs 22 and above)
    // This is a simplified version - full implementation would need more parsing

    // Check for pair range (e.g., "AA-22" means all pairs)
    for (const rangeItem of range) {
        if (rangeItem.includes('-')) {
            const [high, low] = rangeItem.split('-');
            // Simple pair range check
            if (high.length === 2 && low.length === 2) {
                const highVal = RANK_VALUES[high[0] as keyof typeof RANK_VALUES];
                const lowVal = RANK_VALUES[low[0] as keyof typeof RANK_VALUES];

                if (handNotation.length === 2) {
                    const handVal = RANK_VALUES[handNotation[0] as keyof typeof RANK_VALUES];
                    if (handVal >= lowVal && handVal <= highVal) {
                        return true;
                    }
                }
            }
        }

        // Check for + notation (e.g., "A2s+" means A2s and above)
        if (rangeItem.endsWith('+')) {
            const baseHand = rangeItem.slice(0, -1);
            if (baseHand.length === 3) {
                const suitedness = baseHand[2];
                if (handNotation.length === 3 && handNotation[2] === suitedness) {
                    // Same high card, compare low card
                    if (handNotation[0] === baseHand[0]) {
                        const handLow = RANK_VALUES[handNotation[1] as keyof typeof RANK_VALUES];
                        const baseLow = RANK_VALUES[baseHand[1] as keyof typeof RANK_VALUES];
                        if (handLow >= baseLow) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Get preflop suggestion for opening (first to act or facing limps)
 */
export function getPreflopOpenSuggestion(
    holeCards: Card[],
    position: Position,
    playerCount: number,
    bigBlind: number
): PreflopSuggestion {
    const handNotation = getHandNotation(holeCards);
    const format = getTableFormat(playerCount);

    // Get the open chart for this format and position
    const formatCharts = (preflopOpenCharts as any)[format];
    if (!formatCharts) {
        // Default to fold with unknown format
        return {
            action: 'fold',
            confidence: 0.5,
            reason: `Unknown table format: ${format}`,
        };
    }

    const positionChart = formatCharts[position];
    if (!positionChart) {
        // Default to tight play from unknown position
        return {
            action: 'fold',
            confidence: 0.6,
            reason: `No chart for position: ${position}`,
        };
    }

    // Check if hand is in opening range
    if (isHandInRange(handNotation, positionChart.open)) {
        const raiseSize = bigBlind * positionChart.openRaiseSize;
        return {
            action: 'raise',
            raiseSize,
            confidence: 0.85,
            reason: `${handNotation} is in ${position} opening range`,
        };
    }

    return {
        action: 'fold',
        confidence: 0.8,
        reason: `${handNotation} is not in ${position} opening range`,
    };
}

/**
 * Get preflop suggestion when facing a raise
 */
export function getPreflopVsRaiseSuggestion(
    holeCards: Card[],
    myPosition: Position,
    raiserPosition: Position,
    playerCount: number,
    currentBet: number,
    bigBlind: number
): PreflopSuggestion {
    const handNotation = getHandNotation(holeCards);
    const format = getTableFormat(playerCount);

    // Get the vs raise chart
    const formatCharts = (preflopVsRaiseCharts as any)[format];
    if (!formatCharts) {
        return {
            action: 'fold',
            confidence: 0.5,
            reason: `Unknown table format: ${format}`,
        };
    }

    const positionCharts = formatCharts[myPosition];
    if (!positionCharts) {
        return {
            action: 'fold',
            confidence: 0.6,
            reason: `No chart for position: ${myPosition}`,
        };
    }

    const vsChart = positionCharts[`vs${raiserPosition}`];
    if (!vsChart) {
        // Use a default tight range
        return {
            action: 'fold',
            confidence: 0.6,
            reason: `No chart for ${myPosition} vs ${raiserPosition}`,
        };
    }

    // Check for 3-bet
    if (isHandInRange(handNotation, vsChart['3bet'])) {
        const threeBetSize = currentBet * vsChart['3betSize'];
        return {
            action: 'raise',
            raiseSize: threeBetSize,
            confidence: 0.8,
            reason: `${handNotation} is in 3-bet range vs ${raiserPosition}`,
        };
    }

    // Check for call
    if (isHandInRange(handNotation, vsChart.call)) {
        return {
            action: 'call',
            confidence: 0.75,
            reason: `${handNotation} is in calling range vs ${raiserPosition}`,
        };
    }

    return {
        action: 'fold',
        confidence: 0.8,
        reason: `${handNotation} is not in 3-bet or call range vs ${raiserPosition}`,
    };
}

/**
 * Get preflop suggestion for the big blind facing limpers
 */
export function getBBvsLimpersSuggestion(
    holeCards: Card[],
    limperCount: number,
    bigBlind: number
): PreflopSuggestion {
    const handNotation = getHandNotation(holeCards);

    // With many limpers, we can see a cheap flop with more hands
    // But we should still raise with premium hands

    // Premium hands - always raise
    const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo'];
    if (premiumHands.includes(handNotation)) {
        const raiseSize = bigBlind * (3 + limperCount); // Standard sizing vs limpers
        return {
            action: 'raise',
            raiseSize,
            confidence: 0.9,
            reason: `Premium hand ${handNotation}, raising vs ${limperCount} limper(s)`,
        };
    }

    // Strong hands - raise
    const strongHands = ['99', '88', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs'];
    if (strongHands.includes(handNotation)) {
        const raiseSize = bigBlind * (3 + limperCount);
        return {
            action: 'raise',
            raiseSize,
            confidence: 0.75,
            reason: `Strong hand ${handNotation}, raising for value`,
        };
    }

    // Check with everything else (we're getting a good price)
    return {
        action: 'check',
        confidence: 0.7,
        reason: `Checking ${handNotation} in BB vs limpers`,
    };
}
