/**
 * Postflop decision engine using heuristics
 */

import {
    Card,
    GameState,
    Player,
    ActionType,
    evaluateHand,
    calculateHandStrength,
    getValidActions,
    RANK_VALUES,
} from '@foldflop/poker-engine';

export interface PostflopSuggestion {
    action: ActionType;
    amount?: number;
    confidence: number;
    reason: string;
}

interface BoardAnalysis {
    isPaired: boolean;
    isMonotone: boolean;
    isTwoTone: boolean;
    isRainbow: boolean;
    hasThreeToStraight: boolean;
    hasFourToStraight: boolean;
    highCard: number;
    isWet: boolean;
    isDry: boolean;
    connectedness: number; // 0-1 scale
}

/**
 * Analyze the board texture
 */
export function analyzeBoard(communityCards: Card[]): BoardAnalysis {
    if (communityCards.length === 0) {
        return {
            isPaired: false,
            isMonotone: false,
            isTwoTone: false,
            isRainbow: false,
            hasThreeToStraight: false,
            hasFourToStraight: false,
            highCard: 0,
            isWet: false,
            isDry: true,
            connectedness: 0,
        };
    }

    const ranks = communityCards.map(c => RANK_VALUES[c.rank]);
    const suits = communityCards.map(c => c.suit);

    // Check for pairs
    const rankCounts = new Map<number, number>();
    for (const rank of ranks) {
        rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
    }
    const isPaired = [...rankCounts.values()].some(count => count >= 2);

    // Check suit distribution
    const suitCounts = new Map<string, number>();
    for (const suit of suits) {
        suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }
    const maxSuitCount = Math.max(...suitCounts.values());
    const isMonotone = maxSuitCount === communityCards.length;
    const isTwoTone = maxSuitCount >= 2 && maxSuitCount < communityCards.length;
    const isRainbow = maxSuitCount === 1;

    // Check straight potential
    const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let maxConsecutive = 1;
    let currentConsecutive = 1;

    for (let i = 1; i < sortedRanks.length; i++) {
        if (sortedRanks[i] - sortedRanks[i - 1] === 1) {
            currentConsecutive++;
            maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        } else if (sortedRanks[i] - sortedRanks[i - 1] > 1) {
            currentConsecutive = 1;
        }
    }

    // Check for wheel potential (A-2-3-4-5)
    if (ranks.includes(14) && ranks.some(r => r <= 5)) {
        maxConsecutive = Math.max(maxConsecutive,
            ranks.filter(r => r <= 5 || r === 14).length);
    }

    const hasThreeToStraight = maxConsecutive >= 3;
    const hasFourToStraight = maxConsecutive >= 4;

    const highCard = Math.max(...ranks);

    // Calculate connectedness (how connected the cards are)
    let totalGaps = 0;
    for (let i = 1; i < sortedRanks.length; i++) {
        totalGaps += sortedRanks[i] - sortedRanks[i - 1] - 1;
    }
    const avgGap = sortedRanks.length > 1 ? totalGaps / (sortedRanks.length - 1) : 0;
    const connectedness = Math.max(0, 1 - avgGap / 5);

    // Wet = lots of draws possible, Dry = few draws
    const isWet = isTwoTone || isMonotone || hasThreeToStraight || hasFourToStraight;
    const isDry = isRainbow && !hasThreeToStraight && isPaired;

    return {
        isPaired,
        isMonotone,
        isTwoTone,
        isRainbow,
        hasThreeToStraight,
        hasFourToStraight,
        highCard,
        isWet,
        isDry,
        connectedness,
    };
}

/**
 * Calculate draws the player has
 */
interface DrawAnalysis {
    hasFlushDraw: boolean;
    hasStraightDraw: boolean;
    hasOpenEnded: boolean;
    hasGutshot: boolean;
    outs: number;
}

export function analyzeDraws(holeCards: Card[], communityCards: Card[]): DrawAnalysis {
    const allCards = [...holeCards, ...communityCards];
    const suits = allCards.map(c => c.suit);
    const ranks = allCards.map(c => RANK_VALUES[c.rank]);

    // Flush draw check
    const suitCounts = new Map<string, number>();
    for (const suit of suits) {
        suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1);
    }
    const maxSuitCount = Math.max(...suitCounts.values());
    const hasFlushDraw = maxSuitCount === 4;

    // Straight draw check
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);

    let hasOpenEnded = false;
    let hasGutshot = false;

    // Check for consecutive cards
    for (let target = 2; target <= 14; target++) {
        let count = 0;
        let gaps = 0;

        for (let i = 0; i < 5; i++) {
            const checkRank = target + i > 14 ? target + i - 13 : target + i;
            if (uniqueRanks.includes(checkRank) || (checkRank === 1 && uniqueRanks.includes(14))) {
                count++;
            } else {
                gaps++;
            }
        }

        if (count === 4 && gaps === 1) {
            // Check if it's open-ended or gutshot
            const neededRanks = [];
            for (let i = 0; i < 5; i++) {
                const checkRank = target + i > 14 ? target + i - 13 : target + i;
                if (!uniqueRanks.includes(checkRank) && !(checkRank === 1 && uniqueRanks.includes(14))) {
                    neededRanks.push(checkRank);
                }
            }

            // Open-ended if needed rank is at the ends
            if (neededRanks.length === 1) {
                const needed = neededRanks[0];
                if (needed === target || needed === target + 4) {
                    hasOpenEnded = true;
                } else {
                    hasGutshot = true;
                }
            }
        }
    }

    const hasStraightDraw = hasOpenEnded || hasGutshot;

    // Calculate outs
    let outs = 0;
    if (hasFlushDraw) outs += 9;
    if (hasOpenEnded) outs += 8;
    else if (hasGutshot) outs += 4;

    // Remove double-counted outs (flush + straight)
    if (hasFlushDraw && hasStraightDraw) {
        outs -= 2; // Approximate overlap
    }

    return {
        hasFlushDraw,
        hasStraightDraw,
        hasOpenEnded,
        hasGutshot,
        outs,
    };
}

/**
 * Calculate pot odds and implied odds
 */
export function calculateOdds(
    potSize: number,
    callAmount: number,
    effectiveStack: number
): { potOdds: number; impliedOdds: number } {
    const potOdds = callAmount > 0 ? callAmount / (potSize + callAmount) : 0;

    // Implied odds consider additional money we might win
    const remainingStack = effectiveStack - callAmount;
    const impliedOdds = callAmount > 0
        ? callAmount / (potSize + callAmount + remainingStack * 0.5) // Assume we win 50% of remaining on average
        : 0;

    return { potOdds, impliedOdds };
}

/**
 * Get postflop suggestion based on heuristics
 */
export function getPostflopSuggestion(
    holeCards: Card[],
    communityCards: Card[],
    state: GameState,
    playerIndex: number
): PostflopSuggestion {
    const player = state.players[playerIndex];
    const validActions = getValidActions(state);

    if (!player || player.isFolded) {
        return { action: 'fold', confidence: 0, reason: 'Player not active' };
    }

    // Analyze the situation
    const handStrength = calculateHandStrength(holeCards, communityCards);
    const boardAnalysis = analyzeBoard(communityCards);
    const drawAnalysis = analyzeDraws(holeCards, communityCards);

    // Get the evaluated hand
    const allCards = [...holeCards, ...communityCards];
    const evaluatedHand = allCards.length >= 5 ? evaluateHand(allCards) : null;

    // Calculate pot and stack info
    const currentPot = state.pots.reduce((sum, p) => sum + p.amount, 0) +
        state.players.reduce((sum, p) => sum + p.currentBet, 0);
    const toCall = state.currentBet - player.currentBet;
    const { potOdds, impliedOdds } = calculateOdds(currentPot, toCall, player.stack);
    const spr = player.stack / Math.max(currentPot, 1);

    // Decision logic based on hand strength tiers

    // VERY STRONG (hand strength > 0.8) - Value bet/raise
    if (handStrength > 0.8) {
        if (validActions.canRaise && state.currentBet > 0) {
            const raiseSize = Math.min(
                currentPot * 0.75, // 75% pot
                validActions.maxRaise
            );
            return {
                action: 'raise',
                amount: Math.max(validActions.minRaise, raiseSize),
                confidence: 0.85,
                reason: `Strong hand (${evaluatedHand?.description}), raising for value`,
            };
        }

        if (validActions.canBet && state.currentBet === 0) {
            const betSize = Math.min(
                currentPot * 0.66, // 66% pot
                validActions.maxBet
            );
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, betSize),
                confidence: 0.85,
                reason: `Strong hand (${evaluatedHand?.description}), betting for value`,
            };
        }

        if (validActions.canCall) {
            return { action: 'call', confidence: 0.9, reason: 'Strong hand, calling' };
        }
    }

    // STRONG (hand strength > 0.6) - Bet/call
    if (handStrength > 0.6) {
        if (validActions.canBet && state.currentBet === 0) {
            const betSize = Math.min(
                currentPot * 0.5, // 50% pot
                validActions.maxBet
            );
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, betSize),
                confidence: 0.7,
                reason: `Good hand (${evaluatedHand?.description}), betting`,
            };
        }

        if (validActions.canCall) {
            // Check pot odds
            if (potOdds < 0.3) { // Good odds
                return { action: 'call', confidence: 0.75, reason: 'Good hand with good pot odds' };
            }
        }

        if (validActions.canCheck) {
            return { action: 'check', confidence: 0.65, reason: 'Good hand, pot controlling' };
        }
    }

    // MEDIUM (hand strength > 0.4) - Check/call with draws
    if (handStrength > 0.4 || drawAnalysis.hasFlushDraw || drawAnalysis.hasOpenEnded) {
        // Check if we have draw equity
        const drawEquity = drawAnalysis.outs * 0.02; // Rough equity per out
        const combinedEquity = handStrength + drawEquity;

        if (validActions.canCheck) {
            return { action: 'check', confidence: 0.7, reason: 'Medium hand, checking' };
        }

        if (validActions.canCall) {
            // Check if call is profitable
            const neededEquity = potOdds;
            if (combinedEquity > neededEquity) {
                return {
                    action: 'call',
                    confidence: 0.65,
                    reason: `Drawing hand with ${drawAnalysis.outs} outs, odds are good`,
                };
            }
        }
    }

    // WEAK (hand strength < 0.4) - Check/fold
    if (validActions.canCheck) {
        return { action: 'check', confidence: 0.8, reason: 'Weak hand, checking' };
    }

    // Can't check, must call or fold
    if (validActions.canCall) {
        // Small bet relative to pot - might be worth a call with draws
        if (toCall < currentPot * 0.25 && (drawAnalysis.hasFlushDraw || drawAnalysis.hasOpenEnded)) {
            return {
                action: 'call',
                confidence: 0.5,
                reason: 'Small bet, calling with draw',
            };
        }
    }

    // Default to fold
    return {
        action: 'fold',
        confidence: 0.75,
        reason: 'Weak hand facing aggression',
    };
}

/**
 * Determine if we should c-bet (continuation bet)
 */
export function shouldCBet(
    holeCards: Card[],
    communityCards: Card[],
    wasPreAgressor: boolean,
    position: 'IP' | 'OOP', // In Position or Out Of Position
    numOpponents: number
): { shouldBet: boolean; sizePct: number; reason: string } {
    if (!wasPreAgressor) {
        return { shouldBet: false, sizePct: 0, reason: 'Was not the pre-flop aggressor' };
    }

    const boardAnalysis = analyzeBoard(communityCards);
    const handStrength = calculateHandStrength(holeCards, communityCards);

    // On dry boards, c-bet more often
    if (boardAnalysis.isDry) {
        return {
            shouldBet: true,
            sizePct: 0.33, // Small sizing on dry boards
            reason: 'Dry board, c-betting with range advantage',
        };
    }

    // On wet boards, be more selective
    if (boardAnalysis.isWet) {
        if (handStrength > 0.5) {
            return {
                shouldBet: true,
                sizePct: 0.66, // Larger sizing on wet boards
                reason: 'Wet board but have equity, betting for value/protection',
            };
        }
        return {
            shouldBet: false,
            sizePct: 0,
            reason: 'Wet board without strong equity, checking back',
        };
    }

    // Multi-way pots - be more cautious
    if (numOpponents > 1) {
        if (handStrength > 0.6) {
            return {
                shouldBet: true,
                sizePct: 0.5,
                reason: 'Multi-way with strong hand, betting',
            };
        }
        return {
            shouldBet: false,
            sizePct: 0,
            reason: 'Multi-way without strong hand, checking',
        };
    }

    // Heads-up on medium boards
    if (position === 'IP') {
        return {
            shouldBet: handStrength > 0.3,
            sizePct: 0.5,
            reason: `In position, ${handStrength > 0.3 ? 'c-betting' : 'checking back'}`,
        };
    }

    // OOP, be more careful
    return {
        shouldBet: handStrength > 0.5,
        sizePct: 0.5,
        reason: `Out of position, ${handStrength > 0.5 ? 'c-betting with equity' : 'check-folding/calling'}`,
    };
}
