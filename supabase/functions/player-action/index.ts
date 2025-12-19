// Player Action Edge Function
// This is the core game logic function - validates and processes player actions
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

// Simple in-memory game state store
// In production, this would be Redis or similar
const gameStates = new Map<string, GameState>();

interface ActionRequest {
    type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
    amount?: number;
}

interface PlayerActionRequest {
    tableId: string;
    action: ActionRequest;
    actionId?: string;
}

interface GameState {
    tableId: string;
    handNumber: number;
    phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    dealerIndex: number;
    currentPlayerIndex: number;
    currentBet: number;
    lastRaiseAmount: number;
    communityCards: string[];
    deck: string[];
    pots: Array<{ amount: number; eligiblePlayerIds: string[] }>;
    players: PlayerState[];
    turnStartedAt: number;
    isHandComplete: boolean;
}

interface PlayerState {
    id: string;
    oderId: string;
    seat: number;
    stack: number;
    holeCards: string[];
    currentBet: number;
    totalBetThisHand: number;
    isFolded: boolean;
    isAllIn: boolean;
}

// Processed action IDs to prevent duplicates
const processedActions = new Set<string>();

Deno.serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authenticate user
        const user = await getUser(req);
        if (!user) {
            return errorResponse('Unauthorized', 401);
        }

        // Parse request
        const { tableId, action, actionId }: PlayerActionRequest = await req.json();

        if (!tableId || !action || !action.type) {
            return errorResponse('Missing required fields');
        }

        // Check for duplicate action
        if (actionId && processedActions.has(actionId)) {
            return jsonResponse({
                success: true,
                alreadyProcessed: true,
            });
        }

        const supabase = createSupabaseClient(req);
        const adminClient = createAdminClient();

        // Get game state (or create if doesn't exist)
        let gameState = gameStates.get(tableId);

        if (!gameState || gameState.phase === 'waiting') {
            return errorResponse('No active hand at this table');
        }

        // Find the player
        const playerIndex = gameState.players.findIndex(p => p.oderId === user.id);
        if (playerIndex === -1) {
            return errorResponse('You are not at this table');
        }

        const player = gameState.players[playerIndex];

        // Verify it's the player's turn
        if (gameState.currentPlayerIndex !== playerIndex) {
            return errorResponse('Not your turn');
        }

        // Validate and process the action
        const validationResult = validateAction(gameState, player, action);
        if (!validationResult.valid) {
            return errorResponse(validationResult.error!);
        }

        // Process the action
        const newState = processAction(gameState, playerIndex, action);
        gameStates.set(tableId, newState);

        // Mark action as processed
        if (actionId) {
            processedActions.add(actionId);
            // Clean up old action IDs (keep last 1000)
            if (processedActions.size > 1000) {
                const firstId = processedActions.values().next().value;
                processedActions.delete(firstId);
            }
        }

        // Broadcast the action
        const channel = adminClient.channel(`table:${tableId}`);

        await channel.send({
            type: 'broadcast',
            event: 'player_action',
            payload: {
                type: 'player_action',
                tableId,
                timestamp: Date.now(),
                handNumber: newState.handNumber,
                playerId: user.id,
                action: action.type,
                amount: action.amount ?? 0,
                newBet: player.currentBet,
                newStack: player.stack,
                pot: calculateTotalPot(newState),
                nextPlayerId: newState.currentPlayerIndex >= 0
                    ? newState.players[newState.currentPlayerIndex]?.oderId
                    : null,
                turnStartedAt: newState.turnStartedAt,
            },
        });

        // Check for phase change or hand complete
        if (newState.isHandComplete) {
            // Handle hand completion
            await handleHandComplete(newState, adminClient, supabase);
        }

        return jsonResponse({
            success: true,
            data: {
                actionId: actionId ?? crypto.randomUUID(),
                newPot: calculateTotalPot(newState),
                nextPlayerId: newState.currentPlayerIndex >= 0
                    ? newState.players[newState.currentPlayerIndex]?.oderId
                    : null,
            },
        });

    } catch (error) {
        console.error('Player action error:', error);
        return errorResponse('Internal server error', 500);
    }
});

function validateAction(
    state: GameState,
    player: PlayerState,
    action: ActionRequest
): { valid: boolean; error?: string } {
    if (player.isFolded || player.isAllIn) {
        return { valid: false, error: 'Cannot act - folded or all-in' };
    }

    const toCall = state.currentBet - player.currentBet;

    switch (action.type) {
        case 'fold':
            return { valid: true };

        case 'check':
            if (toCall > 0) {
                return { valid: false, error: 'Cannot check, must call or fold' };
            }
            return { valid: true };

        case 'call':
            if (toCall === 0) {
                return { valid: false, error: 'Nothing to call' };
            }
            if (player.stack < toCall) {
                // This is an all-in call
                return { valid: true };
            }
            return { valid: true };

        case 'bet':
        case 'raise':
            if (!action.amount || action.amount <= 0) {
                return { valid: false, error: 'Invalid amount' };
            }
            // Simplified validation
            if (action.amount > player.stack + player.currentBet) {
                return { valid: false, error: 'Insufficient chips' };
            }
            return { valid: true };

        case 'all_in':
            if (player.stack === 0) {
                return { valid: false, error: 'No chips to go all-in' };
            }
            return { valid: true };

        default:
            return { valid: false, error: 'Unknown action' };
    }
}

function processAction(
    state: GameState,
    playerIndex: number,
    action: ActionRequest
): GameState {
    const newState = JSON.parse(JSON.stringify(state)) as GameState;
    const player = newState.players[playerIndex];

    switch (action.type) {
        case 'fold':
            player.isFolded = true;
            break;

        case 'check':
            // No chip change
            break;

        case 'call': {
            const toCall = Math.min(state.currentBet - player.currentBet, player.stack);
            player.stack -= toCall;
            player.currentBet += toCall;
            player.totalBetThisHand += toCall;
            if (player.stack === 0) player.isAllIn = true;
            break;
        }

        case 'bet':
        case 'raise': {
            const amount = action.amount!;
            const betAmount = amount - player.currentBet;
            const raiseAmount = amount - state.currentBet;
            player.stack -= betAmount;
            player.currentBet = amount;
            player.totalBetThisHand += betAmount;
            newState.lastRaiseAmount = raiseAmount;
            newState.currentBet = amount;
            if (player.stack === 0) player.isAllIn = true;
            break;
        }

        case 'all_in': {
            const allInAmount = player.stack;
            const newBet = player.currentBet + allInAmount;
            if (newBet > state.currentBet) {
                newState.lastRaiseAmount = newBet - state.currentBet;
                newState.currentBet = newBet;
            }
            player.stack = 0;
            player.currentBet = newBet;
            player.totalBetThisHand += allInAmount;
            player.isAllIn = true;
            break;
        }
    }

    // Update pots
    newState.pots = calculatePots(newState.players);

    // Check if only one player remains
    const activePlayers = newState.players.filter(p => !p.isFolded);
    if (activePlayers.length === 1) {
        newState.isHandComplete = true;
        return newState;
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

function isRoundComplete(state: GameState): boolean {
    const activePlayers = state.players.filter(p => !p.isFolded);
    const playersWhoCanAct = activePlayers.filter(p => !p.isAllIn);

    if (playersWhoCanAct.length === 0) return true;

    return playersWhoCanAct.every(p => p.currentBet === state.currentBet);
}

function advancePhase(state: GameState): GameState {
    const newState = { ...state };

    // Reset bets
    newState.players = newState.players.map(p => ({ ...p, currentBet: 0 }));
    newState.currentBet = 0;
    newState.lastRaiseAmount = 0;

    // Check if we should run out remaining cards
    const playersWhoCanAct = newState.players.filter(p => !p.isFolded && !p.isAllIn);

    if (playersWhoCanAct.length <= 1) {
        // Run out remaining community cards
        while (newState.communityCards.length < 5 && newState.deck.length > 0) {
            newState.deck.shift(); // Burn
            if (newState.deck.length > 0) {
                newState.communityCards.push(newState.deck.shift()!);
            }
        }
        newState.phase = 'showdown';
        newState.isHandComplete = true;
        return newState;
    }

    // Normal phase advancement
    switch (state.phase) {
        case 'preflop':
            // Deal flop (burn + 3 cards)
            newState.deck.shift(); // Burn
            newState.communityCards.push(
                newState.deck.shift()!,
                newState.deck.shift()!,
                newState.deck.shift()!
            );
            newState.phase = 'flop';
            break;
        case 'flop':
            newState.deck.shift(); // Burn
            newState.communityCards.push(newState.deck.shift()!);
            newState.phase = 'turn';
            break;
        case 'turn':
            newState.deck.shift(); // Burn
            newState.communityCards.push(newState.deck.shift()!);
            newState.phase = 'river';
            break;
        case 'river':
            newState.phase = 'showdown';
            newState.isHandComplete = true;
            break;
    }

    if (!newState.isHandComplete) {
        newState.currentPlayerIndex = getFirstToActIndex(newState);
        newState.turnStartedAt = Date.now();
    }

    return newState;
}

function getNextPlayerIndex(state: GameState): number {
    const numPlayers = state.players.length;
    let nextIndex = (state.currentPlayerIndex + 1) % numPlayers;

    for (let i = 0; i < numPlayers; i++) {
        const player = state.players[nextIndex];
        if (!player.isFolded && !player.isAllIn) {
            return nextIndex;
        }
        nextIndex = (nextIndex + 1) % numPlayers;
    }

    return -1;
}

function getFirstToActIndex(state: GameState): number {
    const numPlayers = state.players.length;
    let index = (state.dealerIndex + 1) % numPlayers;

    for (let i = 0; i < numPlayers; i++) {
        const player = state.players[index];
        if (!player.isFolded && !player.isAllIn) {
            return index;
        }
        index = (index + 1) % numPlayers;
    }

    return -1;
}

function calculatePots(players: PlayerState[]): Array<{ amount: number; eligiblePlayerIds: string[] }> {
    // Simplified pot calculation
    const totalBets = players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
    const eligiblePlayers = players.filter(p => !p.isFolded).map(p => p.oderId);

    return [{ amount: totalBets, eligiblePlayerIds: eligiblePlayers }];
}

function calculateTotalPot(state: GameState): number {
    return state.pots.reduce((sum, p) => sum + p.amount, 0);
}

async function handleHandComplete(
    state: GameState,
    adminClient: ReturnType<typeof createAdminClient>,
    _supabase: ReturnType<typeof createSupabaseClient>
): Promise<void> {
    // Determine winners and distribute pot
    // This is a simplified version - full implementation would use poker-engine

    const activePlayers = state.players.filter(p => !p.isFolded);
    const totalPot = calculateTotalPot(state);

    if (activePlayers.length === 1) {
        // Only one player left - they win everything
        const winner = activePlayers[0];

        // Update stack in DB
        await adminClient
            .from('table_players')
            .update({ stack: winner.stack + totalPot })
            .eq('user_id', winner.oderId)
            .eq('table_id', state.tableId);

        // Broadcast hand complete
        const channel = adminClient.channel(`table:${state.tableId}`);
        await channel.send({
            type: 'broadcast',
            event: 'hand_complete',
            payload: {
                type: 'hand_complete',
                tableId: state.tableId,
                timestamp: Date.now(),
                handNumber: state.handNumber,
                winners: [{
                    playerId: winner.oderId,
                    amount: totalPot,
                }],
                playerCards: {},
                nextHandIn: 3000,
            },
        });
    }

    // Log hand to history
    await adminClient.from('hands').insert({
        table_id: state.tableId,
        hand_number: state.handNumber,
        pot: totalPot,
        board: state.communityCards,
        winners: activePlayers.map(p => ({ playerId: p.oderId })),
        actions_json: [],
    });
}

// Export for use by deal-hand function
export { gameStates, GameState, PlayerState };
