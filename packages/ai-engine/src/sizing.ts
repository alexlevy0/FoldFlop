/**
 * Bet sizing recommendations
 */

export interface SizingRecommendation {
    amount: number;
    percentage: number; // Percentage of pot
    reason: string;
}

/**
 * Get recommended bet sizing based on situation
 */
export function getBetSizing(
    pot: number,
    situation: 'cbet' | 'value' | 'bluff' | 'probe' | '3bet',
    boardTexture: 'dry' | 'medium' | 'wet',
    position: 'IP' | 'OOP'
): SizingRecommendation {
    let percentage: number;
    let reason: string;

    switch (situation) {
        case 'cbet':
            // C-bet sizing based on board texture
            if (boardTexture === 'dry') {
                percentage = 0.33;
                reason = 'Small c-bet on dry board for efficiency';
            } else if (boardTexture === 'wet') {
                percentage = 0.66;
                reason = 'Larger c-bet on wet board for protection';
            } else {
                percentage = 0.5;
                reason = 'Standard c-bet sizing on medium board';
            }
            break;

        case 'value':
            // Value bet sizing (larger to extract value)
            if (boardTexture === 'wet') {
                percentage = 0.75;
                reason = 'Large value bet on wet board';
            } else {
                percentage = 0.66;
                reason = 'Standard value bet sizing';
            }
            break;

        case 'bluff':
            // Bluff sizing (smaller for efficiency)
            percentage = 0.33;
            reason = 'Small bluff sizing for efficiency';
            break;

        case 'probe':
            // Probe bet (when pre-aggressor checks)
            percentage = 0.4;
            reason = 'Probe bet to take initiative';
            break;

        case '3bet':
            // 3-bet sizing
            if (position === 'IP') {
                percentage = 3.0; // 3x the open
                reason = '3-bet 3x in position';
            } else {
                percentage = 3.5; // 3.5x OOP
                reason = '3-bet 3.5x out of position';
            }
            break;

        default:
            percentage = 0.5;
            reason = 'Default sizing';
    }

    return {
        amount: Math.round(pot * percentage),
        percentage,
        reason,
    };
}

/**
 * Get recommended raise sizing
 */
export function getRaiseSizing(
    pot: number,
    currentBet: number,
    situation: 'value' | 'bluff' | 'protection',
    isAllInPressure: boolean = false
): SizingRecommendation {
    let multiplier: number;
    let reason: string;

    if (isAllInPressure) {
        // When we want to put pressure, raise larger
        multiplier = 3.5;
        reason = 'Large raise to apply stack pressure';
    } else {
        switch (situation) {
            case 'value':
                multiplier = 3.0;
                reason = 'Standard value raise, 3x';
                break;
            case 'bluff':
                multiplier = 2.5;
                reason = 'Smaller raise as a bluff for efficiency';
                break;
            case 'protection':
                multiplier = 4.0;
                reason = 'Large raise for protection against draws';
                break;
            default:
                multiplier = 3.0;
                reason = 'Default raise sizing';
        }
    }

    const raiseAmount = currentBet * multiplier;
    const totalAmount = raiseAmount;
    const percentage = totalAmount / pot;

    return {
        amount: Math.round(totalAmount),
        percentage,
        reason,
    };
}

/**
 * Get preflop open raise sizing
 */
export function getOpenRaiseSizing(
    bigBlind: number,
    position: 'EP' | 'MP' | 'CO' | 'BTN' | 'SB',
    limperCount: number = 0
): SizingRecommendation {
    let bbMultiplier: number;
    let reason: string;

    // Base sizing by position
    switch (position) {
        case 'EP':
            bbMultiplier = 3.0;
            reason = 'EP open 3x';
            break;
        case 'MP':
            bbMultiplier = 2.5;
            reason = 'MP open 2.5x';
            break;
        case 'CO':
        case 'BTN':
            bbMultiplier = 2.5;
            reason = `${position} open 2.5x`;
            break;
        case 'SB':
            bbMultiplier = 3.0; // Larger from SB to discourage BB defense
            reason = 'SB open 3x';
            break;
        default:
            bbMultiplier = 2.5;
            reason = 'Default open sizing';
    }

    // Add 1BB per limper
    bbMultiplier += limperCount;
    if (limperCount > 0) {
        reason += ` + ${limperCount}BB for limper(s)`;
    }

    return {
        amount: Math.round(bigBlind * bbMultiplier),
        percentage: bbMultiplier, // As multiple of BB
        reason,
    };
}

/**
 * Get 3-bet sizing
 */
export function get3BetSizing(
    openRaiseAmount: number,
    position: 'IP' | 'OOP',
    isVsLatePosition: boolean = false
): SizingRecommendation {
    let multiplier: number;
    let reason: string;

    if (position === 'IP') {
        multiplier = isVsLatePosition ? 2.5 : 3.0;
        reason = `3-bet ${multiplier}x in position`;
    } else {
        multiplier = isVsLatePosition ? 3.5 : 4.0;
        reason = `3-bet ${multiplier}x out of position`;
    }

    return {
        amount: Math.round(openRaiseAmount * multiplier),
        percentage: multiplier,
        reason,
    };
}

/**
 * Adjust sizing based on stack depth
 */
export function adjustForStackDepth(
    sizing: SizingRecommendation,
    effectiveStack: number,
    pot: number
): SizingRecommendation {
    const spr = effectiveStack / pot;

    // With low SPR, consider going all-in more often
    if (spr < 3) {
        if (sizing.amount > effectiveStack * 0.5) {
            return {
                amount: effectiveStack,
                percentage: effectiveStack / pot,
                reason: sizing.reason + ' (shoved due to low SPR)',
            };
        }
    }

    // With high SPR, might want to size down
    if (spr > 10 && sizing.percentage > 1) {
        return {
            amount: Math.round(sizing.amount * 0.8),
            percentage: sizing.percentage * 0.8,
            reason: sizing.reason + ' (reduced for deep stacks)',
        };
    }

    return sizing;
}
