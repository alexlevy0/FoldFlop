/**
 * Pot calculation with side pot support for all-in situations
 */

import { Player, Pot } from './types.ts';

/**
 * Calculate main pot and side pots from player contributions
 */
export function calculatePots(players: Player[]): Pot[] {
    // Get only players who have contributed to the pot
    const contributors = players
        .filter(p => p.totalBetThisHand > 0)
        .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

    if (contributors.length === 0) {
        return [];
    }

    const pots: Pot[] = [];
    let previousBet = 0;

    // Create pots at each betting level
    const uniqueBets = [...new Set(contributors.map(p => p.totalBetThisHand))].sort((a, b) => a - b);

    for (const betLevel of uniqueBets) {
        const increment = betLevel - previousBet;

        if (increment > 0) {
            // Find all players who contributed at least this much
            const eligiblePlayers = contributors.filter(p => p.totalBetThisHand >= betLevel);

            // Only non-folded players can win the pot
            const eligibleToWin = eligiblePlayers.filter(p => !p.isFolded).map(p => p.id);

            // Calculate pot amount: increment × number of contributors at this level or higher
            const contributorsAtThisLevel = contributors.filter(p => p.totalBetThisHand >= betLevel);
            const potAmount = increment * contributorsAtThisLevel.length;

            if (potAmount > 0 && eligibleToWin.length > 0) {
                pots.push({
                    amount: potAmount,
                    eligiblePlayerIds: eligibleToWin,
                });
            }
        }

        previousBet = betLevel;
    }

    // Merge consecutive pots with the same eligible players
    return mergePots(pots);
}

/**
 * Merge consecutive pots with identical eligible players
 */
function mergePots(pots: Pot[]): Pot[] {
    if (pots.length <= 1) return pots;

    const merged: Pot[] = [];

    for (const pot of pots) {
        const lastPot = merged[merged.length - 1];

        if (lastPot && arraysEqual(lastPot.eligiblePlayerIds, pot.eligiblePlayerIds)) {
            // Merge into previous pot
            lastPot.amount += pot.amount;
        } else {
            merged.push({ ...pot });
        }
    }

    return merged;
}

/**
 * Check if two arrays have the same elements (order-independent)
 */
function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Get total pot amount
 */
export function getTotalPot(pots: Pot[]): number {
    return pots.reduce((sum, pot) => sum + pot.amount, 0);
}

/**
 * Distribute pot to winner(s)
 * Returns a map of playerId -> amount won
 */
export function distributePot(
    pot: Pot,
    winnerIds: string[],
    buttonPosition: number,
    playerPositions: Map<string, number>
): Map<string, number> {
    if (winnerIds.length === 0) {
        throw new Error('Must have at least one winner');
    }

    const distributions = new Map<string, number>();
    const perWinner = Math.floor(pot.amount / winnerIds.length);
    let remainder = pot.amount - perWinner * winnerIds.length;

    // Sort winners by position (closest to button gets remainder)
    const sortedWinners = [...winnerIds].sort((a, b) => {
        const posA = playerPositions.get(a) ?? 0;
        const posB = playerPositions.get(b) ?? 0;
        // Distance from button in clockwise direction
        // Use 10 (or max seats) as modulus base to ensure positive result
        const modBase = 10;
        const distA = (posA - buttonPosition + modBase) % modBase;
        const distB = (posB - buttonPosition + modBase) % modBase;
        return distA - distB;
    });

    for (const winnerId of sortedWinners) {
        let amount = perWinner;
        if (remainder > 0) {
            amount += 1;
            remainder--;
        }
        distributions.set(winnerId, amount);
    }

    return distributions;
}

/**
 * Calculate pot odds for a given call amount
 */
export function calculatePotOdds(potTotal: number, callAmount: number): number {
    if (callAmount === 0) return Infinity;
    return potTotal / callAmount;
}

/**
 * Calculate the effective stack (smallest stack among active players)
 */
export function getEffectiveStack(players: Player[]): number {
    const activePlayers = players.filter(p => !p.isFolded && !p.isSittingOut);
    if (activePlayers.length === 0) return 0;
    return Math.min(...activePlayers.map(p => p.stack + p.currentBet));
}

/**
 * Calculate Stack-to-Pot Ratio (SPR)
 */
export function calculateSPR(effectiveStack: number, potTotal: number): number {
    if (potTotal === 0) return Infinity;
    return effectiveStack / potTotal;
}
