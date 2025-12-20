/**
 * Betting rules and validation
 */

import { GameState, Player, ActionType, ValidActions } from './types.ts';

/**
 * Get the valid actions for the current player
 */
export function getValidActions(state: GameState): ValidActions {
    const player = state.players[state.currentPlayerIndex];

    if (!player || player.isFolded || player.isAllIn || player.isSittingOut) {
        return {
            canFold: false,
            canCheck: false,
            canCall: false,
            callAmount: 0,
            canBet: false,
            canRaise: false,
            minBet: 0,
            maxBet: 0,
            minRaise: 0,
            maxRaise: 0,
        };
    }

    const toCall = state.currentBet - player.currentBet;
    const canAffordCall = player.stack >= toCall;

    // Calculate min raise
    // Min raise = current bet + last raise amount
    // If no raise yet, min raise = current bet + big blind
    const lastRaise = state.lastRaiseAmount || state.bigBlind;
    const minRaiseTotal = state.currentBet + lastRaise;
    const minRaiseAmount = minRaiseTotal - player.currentBet;

    // Max raise is all-in
    const maxRaiseTotal = player.stack + player.currentBet;

    // All-in is always allowed if player has more than toCall
    // An incomplete all-in (below minRaise) is legal but doesn't reopen betting
    const canAllIn = player.stack > toCall;

    // Full raise requires enough chips for minRaiseAmount
    let canRaise = player.stack >= minRaiseAmount;

    // Under-raise rule: If the last raise was incomplete (less than minRaise)
    // and this player was the last full aggressor, they cannot re-raise
    if (canRaise && state.lastAggressorId === player.id && !state.lastRaiseWasComplete) {
        canRaise = false;
    }

    // If no one has bet yet, we can bet (first action or after checks)
    const noBetYet = state.currentBet === 0 || (state.phase === 'preflop' && state.currentBet === state.bigBlind);
    const canBet = noBetYet && player.stack > 0;

    return {
        canFold: true,
        canCheck: toCall === 0,
        canCall: toCall > 0 && canAffordCall,
        callAmount: Math.min(toCall, player.stack),
        canBet: canBet && state.currentBet === 0,
        canRaise: (canRaise || canAllIn) && state.currentBet > 0, // Allow all-in or full raise
        minBet: state.bigBlind,
        maxBet: player.stack,
        minRaise: minRaiseTotal,
        maxRaise: maxRaiseTotal,
    };
}

/**
 * Validate a player action
 */
export function validateAction(
    state: GameState,
    playerId: string,
    action: ActionType,
    amount: number
): { valid: boolean; error?: string } {
    // Check it's the player's turn
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
        return { valid: false, error: 'Not your turn' };
    }

    const validActions = getValidActions(state);

    switch (action) {
        case 'fold':
            if (!validActions.canFold) {
                return { valid: false, error: 'Cannot fold' };
            }
            return { valid: true };

        case 'check':
            if (!validActions.canCheck) {
                return { valid: false, error: 'Cannot check, must call or fold' };
            }
            return { valid: true };

        case 'call':
            if (!validActions.canCall) {
                return { valid: false, error: 'Cannot call' };
            }
            return { valid: true };

        case 'bet':
            if (!validActions.canBet) {
                return { valid: false, error: 'Cannot bet, action already open' };
            }
            if (amount < validActions.minBet) {
                return { valid: false, error: `Minimum bet is ${validActions.minBet}` };
            }
            if (amount > validActions.maxBet) {
                return { valid: false, error: `Maximum bet is ${validActions.maxBet}` };
            }
            return { valid: true };

        case 'raise':
            if (!validActions.canRaise) {
                return { valid: false, error: 'Cannot raise' };
            }
            if (amount < validActions.minRaise) {
                return { valid: false, error: `Minimum raise is ${validActions.minRaise}` };
            }
            if (amount > validActions.maxRaise) {
                return { valid: false, error: `Maximum raise is ${validActions.maxRaise}` };
            }
            return { valid: true };

        case 'all_in':
            if (currentPlayer.stack === 0) {
                return { valid: false, error: 'No chips to go all-in' };
            }
            return { valid: true };

        default:
            return { valid: false, error: `Unknown action: ${action}` };
    }
}

/**
 * Calculate the amount needed to call
 */
export function getCallAmount(state: GameState, player: Player): number {
    const toCall = state.currentBet - player.currentBet;
    return Math.min(toCall, player.stack);
}

/**
 * Check if all active players have matched the current bet
 */
export function isRoundComplete(state: GameState): boolean {
    const activePlayers = state.players.filter(p => !p.isFolded && !p.isSittingOut);

    // All but one folded
    if (activePlayers.length <= 1) {
        return true;
    }

    // All players who can act have acted
    const playersWhoCanAct = activePlayers.filter(p => !p.isAllIn);

    // Everyone is all-in
    if (playersWhoCanAct.length === 0) {
        return true;
    }

    // Check if all non-all-in players have matched the current bet
    // and everyone has had a chance to act
    const allMatched = playersWhoCanAct.every(p => p.currentBet === state.currentBet);

    // For preflop, big blind gets option to raise
    if (state.phase === 'preflop' && allMatched) {
        const bbPlayer = state.players[state.bigBlindIndex];
        if (bbPlayer && !bbPlayer.isFolded && !bbPlayer.isAllIn) {
            // BB hasn't had option yet if current bet is just the big blind
            // and BB hasn't acted yet (using dedicated flag instead of actions.length)
            if (state.currentBet === state.bigBlind && !state.bbHasActed) {
                return false;
            }
        }
    }

    return allMatched;
}

/**
 * Get the next player to act
 */
export function getNextPlayerIndex(state: GameState): number {
    const numPlayers = state.players.length;
    let nextIndex = (state.currentPlayerIndex + 1) % numPlayers;
    let attempts = 0;

    while (attempts < numPlayers) {
        const player = state.players[nextIndex];
        if (player && !player.isFolded && !player.isAllIn && !player.isSittingOut) {
            return nextIndex;
        }
        nextIndex = (nextIndex + 1) % numPlayers;
        attempts++;
    }

    // No one left to act
    return -1;
}

/**
 * Get the first player to act for a betting round
 */
export function getFirstToActIndex(state: GameState): number {
    const numPlayers = state.players.length;

    if (state.phase === 'preflop') {
        // First to act is left of big blind (UTG)
        // In heads-up, button (SB) acts first preflop
        if (numPlayers === 2) {
            return state.dealerIndex; // Button/SB acts first
        }
        // Start from left of BB
        let index = (state.bigBlindIndex + 1) % numPlayers;
        return findNextActivePlayer(state.players, index);
    } else {
        // Postflop: first active player after button
        // In heads-up: BB acts first postflop
        let index = (state.dealerIndex + 1) % numPlayers;
        return findNextActivePlayer(state.players, index);
    }
}

/**
 * Find the next active (non-folded, non-all-in) player from a starting index
 */
function findNextActivePlayer(players: Player[], startIndex: number): number {
    const numPlayers = players.length;
    let index = startIndex;

    for (let i = 0; i < numPlayers; i++) {
        const player = players[index];
        if (player && !player.isFolded && !player.isAllIn && !player.isSittingOut) {
            return index;
        }
        index = (index + 1) % numPlayers;
    }

    return -1; // No active players
}
