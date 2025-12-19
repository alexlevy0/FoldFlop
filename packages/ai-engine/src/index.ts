/**
 * AI Engine - Main entry point
 * 
 * Provides AI suggestions for poker gameplay using:
 * - GTO preflop charts
 * - Postflop heuristics (hand strength, pot odds, board texture)
 * - Bet sizing recommendations
 */

import {
    Card,
    GameState,
    Player,
    ActionType,
    GamePhase,
    Position,
    getPositionName,
    getValidActions,
} from '@foldflop/poker-engine';

import {
    getPreflopOpenSuggestion,
    getPreflopVsRaiseSuggestion,
    getBBvsLimpersSuggestion,
    getHandNotation,
    PreflopSuggestion,
} from './preflop';

import {
    getPostflopSuggestion,
    PostflopSuggestion,
    analyzeBoard,
    analyzeDraws,
} from './postflop';

import {
    getBetSizing,
    getRaiseSizing,
    getOpenRaiseSizing,
    get3BetSizing,
    adjustForStackDepth,
} from './sizing';

/**
 * Complete AI suggestion including action and sizing
 */
export interface AISuggestion {
    action: ActionType;
    amount: number;
    confidence: number;
    reason: string;
    alternativeActions?: Array<{
        action: ActionType;
        amount: number;
        confidence: number;
    }>;
}

/**
 * Get AI suggestion for the current game state
 */
export function getSuggestion(
    state: GameState,
    playerIndex: number
): AISuggestion {
    const player = state.players[playerIndex];

    if (!player || !player.holeCards || player.holeCards.length !== 2) {
        return {
            action: 'fold',
            amount: 0,
            confidence: 0,
            reason: 'No hole cards available',
        };
    }

    const validActions = getValidActions(state);

    // Can't do anything
    if (!validActions.canFold && !validActions.canCheck) {
        return {
            action: 'fold',
            amount: 0,
            confidence: 0,
            reason: 'No valid actions',
        };
    }

    const holeCards = player.holeCards;
    const activePlayers = state.players.filter(p => !p.isFolded && !p.isSittingOut);

    // Get player position
    const position = getPositionName(
        playerIndex,
        state.dealerIndex,
        activePlayers.length
    );

    // PREFLOP
    if (state.phase === 'preflop') {
        return getPreflopSuggestionWrapper(
            holeCards,
            position,
            state,
            player,
            validActions
        );
    }

    // POSTFLOP (flop, turn, river)
    return getPostflopSuggestionWrapper(
        holeCards,
        state,
        playerIndex,
        validActions
    );
}

/**
 * Wrapper for preflop suggestion with proper sizing
 */
function getPreflopSuggestionWrapper(
    holeCards: Card[],
    position: Position,
    state: GameState,
    player: Player,
    validActions: ReturnType<typeof getValidActions>
): AISuggestion {
    const playerCount = state.players.filter(p => !p.isSittingOut).length;

    // Determine the preflop situation
    const hasRaiseBeforeUs = state.currentBet > state.bigBlind;
    const limperCount = state.players.filter(
        p => p.currentBet > 0 && p.currentBet === state.bigBlind && !p.isFolded
    ).length;

    let suggestion: PreflopSuggestion;

    if (!hasRaiseBeforeUs && limperCount === 0) {
        // First to act (or facing only blinds)
        suggestion = getPreflopOpenSuggestion(
            holeCards,
            position,
            playerCount,
            state.bigBlind
        );
    } else if (!hasRaiseBeforeUs && limperCount > 0 && position === 'BB') {
        // In BB facing limpers
        suggestion = getBBvsLimpersSuggestion(holeCards, limperCount, state.bigBlind);
    } else if (hasRaiseBeforeUs) {
        // Facing a raise - find the raiser's position
        const raiserIndex = state.players.findIndex(p =>
            p.currentBet === state.currentBet && p.currentBet > state.bigBlind
        );
        const raiserPosition = getPositionName(
            raiserIndex >= 0 ? raiserIndex : 0,
            state.dealerIndex,
            playerCount
        );

        suggestion = getPreflopVsRaiseSuggestion(
            holeCards,
            position,
            raiserPosition,
            playerCount,
            state.currentBet,
            state.bigBlind
        );
    } else {
        // Default to open suggestion
        suggestion = getPreflopOpenSuggestion(
            holeCards,
            position,
            playerCount,
            state.bigBlind
        );
    }

    // Convert suggestion to validated action
    return convertToValidAction(suggestion, validActions, state, player);
}

/**
 * Wrapper for postflop suggestion
 */
function getPostflopSuggestionWrapper(
    holeCards: Card[],
    state: GameState,
    playerIndex: number,
    validActions: ReturnType<typeof getValidActions>
): AISuggestion {
    const suggestion = getPostflopSuggestion(
        holeCards,
        state.communityCards,
        state,
        playerIndex
    );

    const player = state.players[playerIndex];
    return convertToValidAction(suggestion, validActions, state, player);
}

/**
 * Convert a suggestion to a valid action with proper sizing
 */
function convertToValidAction(
    suggestion: PreflopSuggestion | PostflopSuggestion,
    validActions: ReturnType<typeof getValidActions>,
    state: GameState,
    player: Player
): AISuggestion {
    const currentPot = state.pots.reduce((sum, p) => sum + p.amount, 0) +
        state.players.reduce((sum, p) => sum + p.currentBet, 0);

    switch (suggestion.action) {
        case 'fold':
            // Can we check instead?
            if (validActions.canCheck) {
                return {
                    action: 'check',
                    amount: 0,
                    confidence: suggestion.confidence * 0.9,
                    reason: 'Checking instead of folding when free',
                };
            }
            return {
                action: 'fold',
                amount: 0,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
            };

        case 'check':
            if (validActions.canCheck) {
                return {
                    action: 'check',
                    amount: 0,
                    confidence: suggestion.confidence,
                    reason: suggestion.reason,
                };
            }
            // Can't check, must call or fold
            if (validActions.canCall) {
                return {
                    action: 'call',
                    amount: validActions.callAmount,
                    confidence: suggestion.confidence * 0.5,
                    reason: 'Calling (wanted to check)',
                };
            }
            return {
                action: 'fold',
                amount: 0,
                confidence: suggestion.confidence * 0.8,
                reason: 'Folding (could not check)',
            };

        case 'call':
            if (validActions.canCall) {
                return {
                    action: 'call',
                    amount: validActions.callAmount,
                    confidence: suggestion.confidence,
                    reason: suggestion.reason,
                };
            }
            if (validActions.canCheck) {
                return {
                    action: 'check',
                    amount: 0,
                    confidence: suggestion.confidence,
                    reason: 'Checking (nothing to call)',
                };
            }
            return {
                action: 'fold',
                amount: 0,
                confidence: 0.5,
                reason: 'Cannot call',
            };

        case 'bet':
            if (validActions.canBet) {
                const amount = 'amount' in suggestion && suggestion.amount
                    ? Math.min(Math.max(suggestion.amount, validActions.minBet), validActions.maxBet)
                    : Math.min(currentPot * 0.5, validActions.maxBet);

                return {
                    action: 'bet',
                    amount: Math.max(validActions.minBet, Math.round(amount)),
                    confidence: suggestion.confidence,
                    reason: suggestion.reason,
                };
            }
            // Try raise instead
            if (validActions.canRaise) {
                const amount = 'raiseSize' in suggestion && suggestion.raiseSize
                    ? suggestion.raiseSize
                    : validActions.minRaise;

                return {
                    action: 'raise',
                    amount: Math.min(Math.max(Math.round(amount), validActions.minRaise), validActions.maxRaise),
                    confidence: suggestion.confidence,
                    reason: suggestion.reason + ' (as raise)',
                };
            }
            if (validActions.canCheck) {
                return {
                    action: 'check',
                    amount: 0,
                    confidence: suggestion.confidence * 0.7,
                    reason: 'Cannot bet, checking',
                };
            }
            if (validActions.canCall) {
                return {
                    action: 'call',
                    amount: validActions.callAmount,
                    confidence: suggestion.confidence * 0.6,
                    reason: 'Cannot bet, calling',
                };
            }
            return { action: 'fold', amount: 0, confidence: 0.5, reason: 'Cannot bet' };

        case 'raise':
            if (validActions.canRaise) {
                const suggestedAmount = 'raiseSize' in suggestion && suggestion.raiseSize
                    ? suggestion.raiseSize
                    : 'amount' in suggestion && suggestion.amount
                        ? suggestion.amount
                        : validActions.minRaise;

                const amount = Math.min(
                    Math.max(Math.round(suggestedAmount), validActions.minRaise),
                    validActions.maxRaise
                );

                return {
                    action: 'raise',
                    amount,
                    confidence: suggestion.confidence,
                    reason: suggestion.reason,
                };
            }
            if (validActions.canBet) {
                const amount = 'amount' in suggestion && suggestion.amount
                    ? Math.min(Math.max(suggestion.amount, validActions.minBet), validActions.maxBet)
                    : validActions.minBet;

                return {
                    action: 'bet',
                    amount: Math.round(amount),
                    confidence: suggestion.confidence,
                    reason: suggestion.reason + ' (as bet)',
                };
            }
            if (validActions.canCall) {
                return {
                    action: 'call',
                    amount: validActions.callAmount,
                    confidence: suggestion.confidence * 0.7,
                    reason: 'Cannot raise, calling',
                };
            }
            return { action: 'fold', amount: 0, confidence: 0.5, reason: 'Cannot raise' };

        case 'all_in':
            // Go all-in by raising to max
            if (validActions.canRaise && player.stack > 0) {
                return {
                    action: 'raise',
                    amount: player.stack + player.currentBet,
                    confidence: suggestion.confidence,
                    reason: 'All-in!',
                };
            }
            if (validActions.canBet && player.stack > 0) {
                return {
                    action: 'bet',
                    amount: player.stack,
                    confidence: suggestion.confidence,
                    reason: 'All-in!',
                };
            }
            if (validActions.canCall) {
                return {
                    action: 'call',
                    amount: validActions.callAmount,
                    confidence: suggestion.confidence,
                    reason: 'Calling all-in',
                };
            }
            return { action: 'fold', amount: 0, confidence: 0.5, reason: 'Cannot go all-in' };

        default:
            // Default safe action
            if (validActions.canCheck) {
                return { action: 'check', amount: 0, confidence: 0.5, reason: 'Default check' };
            }
            return { action: 'fold', amount: 0, confidence: 0.5, reason: 'Default fold' };
    }
}

// Re-export everything
export {
    getPreflopOpenSuggestion,
    getPreflopVsRaiseSuggestion,
    getBBvsLimpersSuggestion,
    getHandNotation,
    PreflopSuggestion,
} from './preflop';

export {
    getPostflopSuggestion,
    PostflopSuggestion,
    analyzeBoard,
    analyzeDraws,
} from './postflop';

export {
    getBetSizing,
    getRaiseSizing,
    getOpenRaiseSizing,
    get3BetSizing,
    adjustForStackDepth,
    SizingRecommendation,
} from './sizing';
