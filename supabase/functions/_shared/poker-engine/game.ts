/**
 * Game state machine - handles the complete flow of a poker hand
 */

import {
    GameState,
    Player,
    GamePhase,
    ActionType,
    PlayerAction,
    Card,
    HandWinner,
    TableConfig,
    Pot,
} from './types.ts';
import { createShuffledDeck, dealCards } from './deck.ts';
import { evaluateHand, compareHands } from './evaluator.ts';
import { calculatePots, distributePot, getTotalPot } from './pot.ts';
import {
    validateAction,
    getCallAmount,
    isRoundComplete,
    getNextPlayerIndex,
    getFirstToActIndex,
} from './betting.ts';

/**
 * Create initial game state for a new hand
 */
export function createGameState(
    tableConfig: TableConfig,
    players: Player[],
    previousDealerIndex: number = -1
): GameState {
    const activePlayers = players.filter(p => !p.isSittingOut && p.stack > 0);

    if (activePlayers.length < 2) {
        throw new Error('Need at least 2 active players to start a hand');
    }

    // Move dealer button
    const dealerIndex = getNextDealerIndex(players, previousDealerIndex);

    // Calculate blind positions
    const { sbIndex, bbIndex } = getBlindPositions(players, dealerIndex);

    const state: GameState = {
        id: generateId(),
        tableId: tableConfig.id,
        handNumber: 0,
        phase: 'waiting',
        players: players.map(p => ({
            ...p,
            holeCards: null,
            currentBet: 0,
            totalBetThisHand: 0,
            isFolded: false,
            isAllIn: false,
            hasActed: false,
        })),
        dealerIndex,
        smallBlindIndex: sbIndex,
        bigBlindIndex: bbIndex,
        currentPlayerIndex: -1,
        deck: [],
        communityCards: [],
        burnedCards: [],
        smallBlind: tableConfig.smallBlind,
        bigBlind: tableConfig.bigBlind,
        currentBet: 0,
        lastRaiseAmount: 0,
        minRaise: tableConfig.bigBlind,
        lastAggressorId: null,
        lastRaiseWasComplete: true,
        pots: [],
        actions: [],
        turnStartedAt: 0,
        turnTimeoutMs: tableConfig.turnTimeoutMs,
        isHandComplete: false,
        winners: null,
    };

    return state;
}

/**
 * Start a new hand - shuffle, deal, post blinds
 */
export function startHand(state: GameState): GameState {
    let newState = { ...state };

    // Create and shuffle deck
    newState.deck = createShuffledDeck();
    newState.phase = 'preflop';

    // Post blinds
    newState = postBlinds(newState);

    // Deal hole cards
    newState = dealHoleCards(newState);

    // Set first player to act
    newState.currentPlayerIndex = getFirstToActIndex(newState);
    newState.turnStartedAt = Date.now();

    return newState;
}


/**
 * Post small and big blinds
 */
function postBlinds(state: GameState): GameState {
    const newState = { ...state };

    // Calculate amounts first
    const sbPlayer = state.players[state.smallBlindIndex];
    const sbAmount = Math.min(state.smallBlind, sbPlayer.stack);

    const bbPlayer = state.players[state.bigBlindIndex];
    const bbAmount = Math.min(state.bigBlind, bbPlayer.stack);

    // Create new players array with immutable updates
    const players = state.players.map((p, i) => {
        if (i === state.smallBlindIndex) {
            const stack = p.stack - sbAmount;
            return {
                ...p,
                stack,
                currentBet: sbAmount,
                totalBetThisHand: sbAmount,
                isAllIn: stack === 0
            };
        }
        if (i === state.bigBlindIndex) {
            const stack = p.stack - bbAmount;
            return {
                ...p,
                stack,
                currentBet: bbAmount,
                totalBetThisHand: bbAmount,
                isAllIn: stack === 0
            };
        }
        return p;
    });

    newState.players = players;
    newState.currentBet = state.bigBlind;

    return newState;
}

/**
 * Deal 2 hole cards to each active player
 */
function dealHoleCards(state: GameState): GameState {
    const newState = { ...state };
    let deck = [...state.deck];
    // We start with the existing players array (already shallow copied in postBlinds return, but we want fresh refs if we modify)
    // Actually, we should map again to be safe and clean.
    // However, dealHoleCards is called right after postBlinds which returns a fresh players array.
    // But dealing cards happens in rounds, so we need to validly update the array.

    // We can't map once because the deck changes sequentially.
    // So we'll clone the players array (shallow) and then replace the specific player objects we modify.
    const players = [...state.players];

    // Deal one card at a time, starting from left of dealer
    for (let round = 0; round < 2; round++) {
        for (let i = 1; i <= players.length; i++) {
            const playerIndex = (state.dealerIndex + i) % players.length;
            const player = players[playerIndex];

            if (!player.isSittingOut) {
                const [cards, remaining] = dealCards(deck, 1);
                deck = remaining;

                // Create a new player object with the new card
                const currentHoleCards = player.holeCards ? [...player.holeCards] : [];
                players[playerIndex] = {
                    ...player,
                    holeCards: [...currentHoleCards, cards[0]]
                };
            }
        }
    }

    newState.deck = deck;
    newState.players = players;

    return newState;
}

/**
 * Process a player action
 */
export function processAction(
    state: GameState,
    playerId: string,
    action: ActionType,
    amount: number = 0
): GameState {
    // Validate the action
    const validation = validateAction(state, playerId, action, amount);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    let newState = { ...state };
    const players = [...newState.players];
    const playerIndex = players.findIndex(p => p.id === playerId);
    const player = { ...players[playerIndex] };

    // Record the action
    const playerAction: PlayerAction = {
        playerId,
        type: action,
        amount: 0,
        timestamp: Date.now(),
    };

    switch (action) {
        case 'fold':
            player.isFolded = true;
            break;

        case 'check':
            // No chips change
            break;

        case 'call': {
            const callAmount = getCallAmount(state, player);
            player.stack -= callAmount;
            player.currentBet += callAmount;
            player.totalBetThisHand += callAmount;
            playerAction.amount = callAmount;
            if (player.stack === 0) player.isAllIn = true;
            break;
        }

        case 'bet':
        case 'raise': {
            const betAmount = amount - player.currentBet; // Amount is the total bet
            const raiseAmount = amount - state.currentBet;
            player.stack -= betAmount;
            player.currentBet = amount;
            player.totalBetThisHand += betAmount;
            playerAction.amount = amount;
            newState.lastRaiseAmount = raiseAmount;
            newState.currentBet = amount;
            newState.lastRaiseWasComplete = true;
            newState.lastAggressorId = playerId;

            if (player.stack === 0) player.isAllIn = true;
            break;
        }

        case 'all_in': {
            const allInAmount = player.stack;
            const newBet = player.currentBet + allInAmount;

            // Update raise amount if this is a raise
            if (newBet > state.currentBet) {
                const raiseAmount = newBet - state.currentBet;
                // Check if it's a full raise
                if (raiseAmount >= newState.lastRaiseAmount) {
                    newState.lastRaiseAmount = raiseAmount;
                    newState.lastRaiseWasComplete = true;
                    newState.lastAggressorId = playerId;
                } else {
                    // Incomplete raise (all-in below min raise)
                    newState.lastRaiseWasComplete = false;
                    // lastAggressorId remains the same as this is not a new full raise
                }
                newState.currentBet = newBet;
            }

            player.stack = 0;
            player.currentBet = newBet;
            player.totalBetThisHand += allInAmount;
            player.isAllIn = true;
            playerAction.amount = newBet;
            break;
        }
    }

    // Mark player as having acted
    player.hasActed = true;

    players[playerIndex] = player;
    newState.players = players;
    newState.actions = [...state.actions, playerAction];

    // Check if hand is over (everyone folded)
    const activePlayers = players.filter(p => !p.isFolded && !p.isSittingOut);
    if (activePlayers.length === 1) {
        // Only one player left - they win
        return endHand(newState);
    }

    // Check if betting round is complete
    if (isRoundComplete(newState)) {
        return advancePhase(newState);
    }

    // Move to next player
    newState.currentPlayerIndex = getNextPlayerIndex(newState);
    newState.turnStartedAt = Date.now();

    return newState;
}

/**
 * Advance to the next game phase
 */
function advancePhase(state: GameState): GameState {
    let newState = { ...state };

    // Return uncalled bets before calculating pots
    // Find the max bet that at least 2 players matched (or are all-in at)
    const activePlayers = newState.players.filter(p => !p.isFolded && !p.isSittingOut);
    const bets = activePlayers.map(p => p.totalBetThisHand);
    bets.sort((a, b) => b - a); // Sort descending

    if (bets.length >= 2) {
        const secondHighestBet = bets[1]; // Second highest bet
        const highestBetter = activePlayers.find(p => p.totalBetThisHand === bets[0]);

        if (highestBetter && bets[0] > secondHighestBet) {
            // There's an uncalled portion - return it
            const uncalledAmount = bets[0] - secondHighestBet;
            const playerIndex = newState.players.findIndex(p => p.id === highestBetter.id);

            if (playerIndex !== -1) {
                newState.players = newState.players.map((p, i) => {
                    if (i === playerIndex) {
                        return {
                            ...p,
                            stack: p.stack + uncalledAmount,
                            totalBetThisHand: p.totalBetThisHand - uncalledAmount,
                            currentBet: Math.max(0, p.currentBet - uncalledAmount),
                        };
                    }
                    return p;
                });
                console.log(`Returned ${uncalledAmount} uncalled bet to player ${highestBetter.id}`);
            }
        }
    }

    // Reset current bets and acted status for all players
    const players = newState.players.map(p => ({ ...p, currentBet: 0, hasActed: false }));
    newState.players = players;
    newState.currentBet = 0;
    newState.lastRaiseAmount = 0;

    // Calculate pots (now with corrected bet amounts)
    newState.pots = calculatePots(players);

    switch (state.phase) {
        case 'preflop':
            newState = dealCommunityCards(newState, 3);
            newState.phase = 'flop';
            break;

        case 'flop':
            newState = dealCommunityCards(newState, 1);
            newState.phase = 'turn';
            break;

        case 'turn':
            newState = dealCommunityCards(newState, 1);
            newState.phase = 'river';
            break;

        case 'river':
            newState.phase = 'showdown';
            return endHand(newState);
    }

    // Check if only one active player left (others all-in)
    const playersWhoCanAct = players.filter(p => !p.isFolded && !p.isAllIn && !p.isSittingOut);

    if (playersWhoCanAct.length <= 1) {
        // Run out remaining cards if needed
        if (newState.communityCards.length < 5) {
            while (newState.communityCards.length < 5) {
                newState = dealCommunityCards(newState, 1);
            }
        }
        newState.phase = 'showdown';
        return endHand(newState);
    }

    // Set first player to act for new round
    newState.currentPlayerIndex = getFirstToActIndex(newState);
    newState.turnStartedAt = Date.now();

    return newState;
}

/**
 * Deal community cards (with burn card)
 */
function dealCommunityCards(state: GameState, count: number): GameState {
    const newState = { ...state };
    let deck = [...state.deck];

    // Burn one card
    const [burned, afterBurn] = dealCards(deck, 1);
    newState.burnedCards = [...state.burnedCards, ...burned];
    deck = afterBurn;

    // Deal community cards
    const [dealt, remaining] = dealCards(deck, count);
    newState.communityCards = [...state.communityCards, ...dealt];
    newState.deck = remaining;

    return newState;
}

/**
 * End the hand and determine winners
 */
function endHand(state: GameState): GameState {
    const newState = { ...state };
    newState.isHandComplete = true;

    // Calculate final pots
    const pots = calculatePots(state.players);
    newState.pots = pots;

    // Determine winners for each pot
    const winners: HandWinner[] = [];
    const activePlayers = state.players.filter(p => !p.isFolded && !p.isSittingOut);

    // If only one player left, they win everything
    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        const totalPot = getTotalPot(pots);
        winners.push({
            playerId: winner.id,
            potIndex: 0,
            amount: totalPot,
            hand: null, // Won without showdown
        });

        // Update player stack
        const players = [...newState.players];
        const winnerIndex = players.findIndex(p => p.id === winner.id);
        players[winnerIndex] = { ...players[winnerIndex], stack: players[winnerIndex].stack + totalPot };
        newState.players = players;
    } else {
        // Showdown - evaluate hands
        const playerPositions = new Map<string, number>();
        state.players.forEach((p, i) => playerPositions.set(p.id, i));

        const evaluatedHands = new Map<string, ReturnType<typeof evaluateHand>>();

        for (const player of activePlayers) {
            if (player.holeCards) {
                const allCards = [...player.holeCards, ...state.communityCards];
                evaluatedHands.set(player.id, evaluateHand(allCards));
            }
        }

        // For each pot, determine winner(s)
        pots.forEach((pot, potIndex) => {
            const eligiblePlayers = activePlayers.filter(p => pot.eligiblePlayerIds.includes(p.id));

            // Find the best hand among eligible players
            let bestHand: ReturnType<typeof evaluateHand> | null = null;
            let potWinners: string[] = [];

            for (const player of eligiblePlayers) {
                const hand = evaluatedHands.get(player.id);
                if (!hand) continue;

                if (!bestHand || compareHands(hand, bestHand) > 0) {
                    bestHand = hand;
                    potWinners = [player.id];
                } else if (compareHands(hand, bestHand) === 0) {
                    potWinners.push(player.id);
                }
            }

            // Distribute pot to winner(s)
            const distributions = distributePot(pot, potWinners, state.dealerIndex, playerPositions);

            for (const [playerId, amount] of distributions) {
                winners.push({
                    playerId,
                    potIndex,
                    amount,
                    hand: evaluatedHands.get(playerId) || null,
                });

                // Update player stack
                const players = [...newState.players];
                const playerIdx = players.findIndex(p => p.id === playerId);
                if (playerIdx !== -1) {
                    players[playerIdx] = {
                        ...players[playerIdx],
                        stack: players[playerIdx].stack + amount
                    };
                    newState.players = players;
                }
            }
        });
    }

    newState.winners = winners;
    newState.phase = 'showdown';

    return newState;
}

/**
 * Get the next dealer position
 */
function getNextDealerIndex(players: Player[], currentDealer: number): number {
    const numPlayers = players.length;
    let nextDealer = (currentDealer + 1) % numPlayers;

    // Find next active player
    for (let i = 0; i < numPlayers; i++) {
        const player = players[nextDealer];
        if (player && !player.isSittingOut && player.stack > 0) {
            return nextDealer;
        }
        nextDealer = (nextDealer + 1) % numPlayers;
    }

    return 0;
}

/**
 * Get blind positions based on dealer position
 */
function getBlindPositions(
    players: Player[],
    dealerIndex: number
): { sbIndex: number; bbIndex: number } {
    const numPlayers = players.length;
    const activeCount = players.filter(p => !p.isSittingOut && p.stack > 0).length;

    if (activeCount === 2) {
        // Heads-up: dealer is small blind, other player is big blind
        const sbIndex = dealerIndex;
        let bbIndex = (dealerIndex + 1) % numPlayers;

        // Find the other active player for BB
        for (let i = 0; i < numPlayers; i++) {
            const player = players[bbIndex];
            if (player && !player.isSittingOut && player.stack > 0 && bbIndex !== sbIndex) {
                return { sbIndex, bbIndex };
            }
            bbIndex = (bbIndex + 1) % numPlayers;
        }

        return { sbIndex, bbIndex: (dealerIndex + 1) % numPlayers };
    }

    // Normal game: SB is left of dealer, BB is left of SB
    let sbIndex = (dealerIndex + 1) % numPlayers;
    let bbIndex = (dealerIndex + 2) % numPlayers;

    // Find next active player for SB
    for (let i = 0; i < numPlayers; i++) {
        const player = players[sbIndex];
        if (player && !player.isSittingOut && player.stack > 0) {
            break;
        }
        sbIndex = (sbIndex + 1) % numPlayers;
    }

    // Find next active player for BB (must be different from SB)
    bbIndex = (sbIndex + 1) % numPlayers;
    for (let i = 0; i < numPlayers; i++) {
        const player = players[bbIndex];
        if (player && !player.isSittingOut && player.stack > 0) {
            break;
        }
        bbIndex = (bbIndex + 1) % numPlayers;
    }

    return { sbIndex, bbIndex };
}

/**
 * Generate a unique ID
 */
function generateId(): string {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * Check if the hand is complete
 */
export function isHandComplete(state: GameState): boolean {
    return state.isHandComplete;
}

/**
 * Get the current pot total
 */
export function getCurrentPot(state: GameState): number {
    // Sum of pots plus current round bets
    const potTotal = getTotalPot(state.pots);
    const currentBets = state.players.reduce((sum, p) => sum + p.currentBet, 0);
    return potTotal + currentBets;
}
