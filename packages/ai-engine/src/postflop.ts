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
    hasBackdoorFlush: boolean;    // 3 to a flush (adds ~1.5 outs)
    hasBackdoorStraight: boolean; // 3 to a straight (adds ~1 out)
    outs: number;
    totalOuts: number; // Including backdoor outs
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
    const hasBackdoorFlush = maxSuitCount === 3 && communityCards.length <= 3; // Only on flop

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

    // Check for backdoor straight (3 cards within 5 ranks on flop only)
    let hasBackdoorStraight = false;
    if (communityCards.length <= 3 && !hasStraightDraw) {
        for (let target = 2; target <= 14; target++) {
            let count = 0;
            for (let i = 0; i < 5; i++) {
                const checkRank = target + i > 14 ? target + i - 13 : target + i;
                if (uniqueRanks.includes(checkRank) || (checkRank === 1 && uniqueRanks.includes(14))) {
                    count++;
                }
            }
            if (count === 3) {
                hasBackdoorStraight = true;
                break;
            }
        }
    }

    // Calculate outs
    let outs = 0;
    if (hasFlushDraw) outs += 9;
    if (hasOpenEnded) outs += 8;
    else if (hasGutshot) outs += 4;

    // Remove double-counted outs (flush + straight)
    if (hasFlushDraw && hasStraightDraw) {
        outs -= 2; // Approximate overlap
    }

    // Calculate total outs including backdoor draws
    // Backdoor draws add fractional outs: ~1.5 for flush, ~1 for straight
    let backdoorOuts = 0;
    if (hasBackdoorFlush) backdoorOuts += 1.5;
    if (hasBackdoorStraight) backdoorOuts += 1;
    const totalOuts = outs + backdoorOuts;

    return {
        hasFlushDraw,
        hasStraightDraw,
        hasOpenEnded,
        hasGutshot,
        hasBackdoorFlush,
        hasBackdoorStraight,
        outs,
        totalOuts,
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
    const { potOdds } = calculateOdds(currentPot, toCall, player.stack);
    const spr = player.stack / Math.max(currentPot, 1);

    // Random factor for unpredictability (0.0 to 0.15)
    const randomBoost = Math.random() * 0.15;
    const effectiveStrength = handStrength + randomBoost;

    // Check if we should c-bet (first to act post-flop on flop)
    const isFlop = communityCards.length === 3;
    const isFirstToAct = state.currentBet === 0;
    const wasAggressor = player.currentBet > 0; // Simplified: consider aggressor if we have money in pot

    // --- C-BET LOGIC ---
    if (isFlop && isFirstToAct && validActions.canBet) {
        const numOpponents = state.players.filter(p => !p.isFolded && p.id !== player.id).length;
        const position = playerIndex > state.dealerIndex ? 'IP' : 'OOP';
        const cbetDecision = shouldCBet(holeCards, communityCards, wasAggressor, position, numOpponents);

        if (cbetDecision.shouldBet) {
            const betSize = Math.min(
                currentPot * cbetDecision.sizePct,
                validActions.maxBet
            );
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.75,
                reason: cbetDecision.reason,
            };
        }
    }

    // --- BLUFF LOGIC (Dry boards with air) ---
    if (isFirstToAct && validActions.canBet && boardAnalysis.isDry && effectiveStrength < 0.3) {
        // Bluff ~30% of the time on dry boards with weak hands
        if (Math.random() < 0.3) {
            const betSize = Math.min(currentPot * 0.33, validActions.maxBet);
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.55,
                reason: 'Bluffing on dry board',
            };
        }
    }

    // --- RIVER-SPECIFIC STRATEGY ---
    // On the river, no more draws - polarize to value/bluff only
    const isRiver = communityCards.length === 5;
    if (isRiver) {
        // With strong hands, bet for value
        if (effectiveStrength > 0.6 && validActions.canBet && isFirstToAct) {
            const betSize = Math.min(currentPot * 0.75, validActions.maxBet);
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.8,
                reason: `River value bet with ${evaluatedHand?.description || 'strong hand'}`,
            };
        }

        // Missed draws on river - bluff ~25% of the time for balance
        const missedDraw = (drawAnalysis.hasFlushDraw || drawAnalysis.hasOpenEnded) &&
            evaluatedHand?.rank === 'high_card';
        if (missedDraw && isFirstToAct && validActions.canBet && Math.random() < 0.25) {
            const betSize = Math.min(currentPot * 0.66, validActions.maxBet);
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.5,
                reason: 'Bluffing missed draw on river',
            };
        }

        // With weak hands facing a bet on river - fold more often (no outs left)
        if (effectiveStrength < 0.4 && toCall > 0 && !validActions.canCheck) {
            return { action: 'fold', confidence: 0.75, reason: 'Weak hand on river, no more cards' };
        }
    }

    // --- VALUE BETTING LOGIC ---

    // VERY STRONG (effective strength > 0.75) - Raise/Bet for value
    if (effectiveStrength > 0.75) {
        if (validActions.canRaise && state.currentBet > 0) {
            const raiseSize = Math.min(currentPot * 0.75, validActions.maxRaise);
            return {
                action: 'raise',
                amount: Math.max(validActions.minRaise, Math.round(raiseSize)),
                confidence: 0.85,
                reason: `Strong hand (${evaluatedHand?.description}), raising for value`,
            };
        }

        if (validActions.canBet && state.currentBet === 0) {
            const betSize = Math.min(currentPot * 0.66, validActions.maxBet);
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.85,
                reason: `Strong hand (${evaluatedHand?.description}), betting for value`,
            };
        }

        if (validActions.canCall) {
            return { action: 'call', confidence: 0.9, reason: 'Strong hand, calling' };
        }
    }

    // STRONG (effective strength > 0.5) - Bet or call with good odds
    if (effectiveStrength > 0.5) {
        if (validActions.canBet && state.currentBet === 0) {
            const betSize = Math.min(currentPot * 0.5, validActions.maxBet);
            return {
                action: 'bet',
                amount: Math.max(validActions.minBet, Math.round(betSize)),
                confidence: 0.7,
                reason: `Good hand (${evaluatedHand?.description}), betting`,
            };
        }

        if (validActions.canCall && potOdds < 0.35) {
            return { action: 'call', confidence: 0.75, reason: 'Good hand with good pot odds' };
        }

        if (validActions.canCheck) {
            return { action: 'check', confidence: 0.65, reason: 'Good hand, pot controlling' };
        }
    }

    // --- MEDIUM HANDS (effective strength > 0.35 or has draws) ---
    // But be CAREFUL about calling big bets with marginal holdings
    if (effectiveStrength > 0.35 || drawAnalysis.hasFlushDraw || drawAnalysis.hasOpenEnded) {
        // Calculate equity: hand strength + draw equity (use totalOuts for backdoor consideration)
        // Use ~4% per out on flop (seeing 2 cards), ~2% per out on turn/river (1 card)
        const outsMultiplier = communityCards.length === 3 ? 0.04 : 0.02;
        const drawEquity = drawAnalysis.totalOuts * outsMultiplier;
        const combinedEquity = handStrength + drawEquity;

        // Check the bet size relative to pot
        const betToPotRatio = toCall / Math.max(currentPot - toCall, 1);

        // --- SEMI-BLUFF LOGIC ---
        // With 12+ outs (strong combo draw), consider raising as semi-bluff
        if (drawAnalysis.totalOuts >= 12 && validActions.canRaise && state.currentBet > 0) {
            // Semi-bluff ~35% of the time with monster draws
            if (Math.random() < 0.35) {
                const raiseSize = Math.min(currentPot * 0.75, validActions.maxRaise);
                return {
                    action: 'raise',
                    amount: Math.max(validActions.minRaise, Math.round(raiseSize)),
                    confidence: 0.7,
                    reason: `Semi-bluffing with ${drawAnalysis.totalOuts.toFixed(0)} outs`,
                };
            }
        }

        if (validActions.canCheck) {
            return { action: 'check', confidence: 0.7, reason: 'Medium hand, checking' };
        }

        // --- SPR-BASED ADJUSTMENTS ---
        // Low SPR (< 3): More willing to commit with marginal hands
        // High SPR (> 10): Need stronger hands
        let equityThreshold = 0.35; // Default for pot-sized bets
        if (spr < 3) {
            equityThreshold = 0.28; // More loose when committed
        } else if (spr > 10) {
            equityThreshold = 0.40; // Tighter when deep
        }

        // If facing a big bet (> 75% pot), need good equity to call
        if (betToPotRatio > 0.75) {
            if (combinedEquity > equityThreshold) {
                return {
                    action: 'call',
                    confidence: 0.6,
                    reason: `Calling big bet with ${(combinedEquity * 100).toFixed(0)}% equity (SPR: ${spr.toFixed(1)})`,
                };
            }
            // Not enough equity for big bet - fold
            return { action: 'fold', confidence: 0.7, reason: 'Equity too low vs big bet' };
        }

        // Smaller bet - check if odds are good
        if (validActions.canCall && combinedEquity > potOdds) {
            return {
                action: 'call',
                confidence: 0.65,
                reason: `Drawing hand with ${drawAnalysis.outs} outs, odds are good`,
            };
        }

        // Odds aren't good enough
        if (validActions.canCall && combinedEquity <= potOdds && combinedEquity < 0.25) {
            return { action: 'fold', confidence: 0.6, reason: 'Pot odds not good enough for draw' };
        }
    }

    // --- WEAK HANDS (no pair, no significant draw) ---
    // Check if possible, otherwise fold
    if (validActions.canCheck) {
        return { action: 'check', confidence: 0.8, reason: 'Weak hand, checking' };
    }

    // Check our actual made hand - if we have NOTHING (high card only), fold to any bet
    // evaluatedHand.rank is a HandRank type: 'high_card', 'pair', etc.
    const hasNoPair = !evaluatedHand || evaluatedHand.rank === 'high_card';
    const hasNoDraw = !drawAnalysis.hasFlushDraw && !drawAnalysis.hasOpenEnded && !drawAnalysis.hasGutshot;

    if (hasNoPair && hasNoDraw) {
        // Complete air - fold to any bet
        return { action: 'fold', confidence: 0.85, reason: 'No pair, no draw - folding to aggression' };
    }

    // Small bet with gutshot might call
    if (validActions.canCall && toCall < currentPot * 0.25 && drawAnalysis.hasGutshot) {
        return { action: 'call', confidence: 0.45, reason: 'Small bet, calling with gutshot' };
    }

    // Small bet with flush draw or OESD - call
    if (validActions.canCall && toCall < currentPot * 0.4 && (drawAnalysis.hasFlushDraw || drawAnalysis.hasOpenEnded)) {
        return { action: 'call', confidence: 0.55, reason: 'Reasonable bet, calling with good draw' };
    }

    // Default fold - we have nothing and facing a bet
    return { action: 'fold', confidence: 0.75, reason: 'Weak hand facing aggression - folding' };
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
