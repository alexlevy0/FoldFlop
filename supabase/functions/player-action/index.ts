// Player Action Edge Function
// Validates and processes player actions using shared poker engine
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';
import {
    GameState,
    Player,
    ActionType,
    Card,
    PlayerAction,
    Pot
} from '../_shared/poker-engine/types.ts';
import { processAction } from '../_shared/poker-engine/game.ts';

interface ActionRequest {
    type: ActionType;
    amount?: number;
}

interface PlayerActionRequest {
    tableId: string;
    action: ActionRequest;
    actionId?: string;
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

        const adminClient = createAdminClient();

        // Get active hand from DB with table config
        const { data: activeHand, error: handError } = await adminClient
            .from('active_hands')
            .select('*, tables!inner(blinds_sb, blinds_bb, turn_timeout_ms)')
            .eq('table_id', tableId)
            .single();

        if (handError || !activeHand) {
            return errorResponse('No active hand at this table');
        }

        // Optimistic locking check (Phase 4)
        if (activeHand.version) {
            // This will be checked during update
        }

        // Verify it's the player's turn
        const playerStates: any[] = activeHand.player_states;
        const playerIndex = playerStates.findIndex(p => p.user_id === user.id);

        if (playerIndex === -1) {
            return errorResponse('You are not at this table');
        }

        const player = playerStates[playerIndex];

        // Strict turn check
        if (activeHand.current_seat !== player.seat) {
            return errorResponse(`Not your turn (current seat: ${activeHand.current_seat}, your seat: ${player.seat})`);
        }

        // Build GameState from DB
        const gameState = mapDbToEngine(activeHand);

        // Process action using the engine
        let newGameState: GameState;
        try {
            newGameState = processAction(
                gameState,
                user.id,
                action.type,
                action.amount || 0
            );
        } catch (e: any) {
            return errorResponse(e.message);
        }

        // Update DB with new state
        const updatePayload = mapEngineToDb(newGameState, activeHand);

        const { data: updatedData, error: updateError } = await adminClient
            .from('active_hands')
            .update({
                ...updatePayload,
                version: (activeHand.version || 1) + 1 // Increment version
            })
            .eq('id', activeHand.id)
            .eq('version', activeHand.version || 1) // Optimistic lock
            .select();

        if (updateError) {
            console.error('Update error:', updateError);
            return errorResponse('Failed to update game state - internal error');
        }

        if (!updatedData || updatedData.length === 0) {
            return jsonResponse({
                success: false,
                error: 'Conflict: Game state changed by another action. Please retry.',
                code: 'CONFLICT'
            }, 409);
        }

        // Mark action as processed
        if (actionId) {
            processedActions.add(actionId);
            // Cleanup
            if (processedActions.size > 1000) {
                const firstId = processedActions.values().next().value;
                processedActions.delete(firstId);
            }
        }

        // Broadcast the action
        // Get player name for broadcast
        const { data: profileData } = await adminClient
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();

        const channel = adminClient.channel(`table:${tableId}`);
        await channel.send({
            type: 'broadcast',
            event: 'player_action',
            payload: {
                type: 'player_action',
                tableId,
                timestamp: Date.now(),
                handNumber: activeHand.hand_number,
                playerId: user.id,
                playerName: profileData?.username || 'Player',
                seat: player.seat,
                action: action.type,
                amount: action.amount ?? 0,
                // Broadcast new state summaries
                pot: updatePayload.pot,
                currentSeat: updatePayload.current_seat,
                phase: updatePayload.phase,
            },
        });

        if (newGameState.isHandComplete) {
            // Broadcast hand results (winners)
            await channel.send({
                type: 'broadcast',
                event: 'hand_complete',
                payload: {
                    type: 'hand_complete',
                    tableId,
                    timestamp: Date.now(),
                    handNumber: activeHand.hand_number,
                    winners: newGameState.winners,
                    pots: newGameState.pots
                },
            });
        }

        return jsonResponse({
            success: true,
            data: {
                actionId: actionId ?? crypto.randomUUID(),
                pot: updatePayload.pot,
                currentSeat: updatePayload.current_seat,
                phase: updatePayload.phase,
                isHandComplete: newGameState.isHandComplete,
            },
        });

    } catch (error) {
        console.error('Player action error:', error);
        return errorResponse('Internal server error', 500);
    }
});

// Helper: Map DB ActiveHand to Engine GameState
function mapDbToEngine(dbHand: any): GameState {
    // Map players
    const players: Player[] = dbHand.player_states.map((p: any, index: number) => ({
        id: p.user_id,
        seatIndex: p.seat,
        stack: p.stack,
        holeCards: p.hole_cards as Card[], // DB JSON -> Card[]
        currentBet: p.current_bet,
        totalBetThisHand: p.total_bet,
        isFolded: p.is_folded,
        isAllIn: p.is_all_in,
        isSittingOut: p.is_sitting_out || false,
        isDisconnected: false,
    }));

    // Find indices
    const dealerIndex = players.findIndex(p => p.seatIndex === dbHand.dealer_seat);
    const sbIndex = players.findIndex(p => p.seatIndex === dbHand.sb_seat);
    const bbIndex = players.findIndex(p => p.seatIndex === dbHand.bb_seat);
    const currentPlayerIndex = players.findIndex(p => p.seatIndex === dbHand.current_seat);

    return {
        id: dbHand.id,
        tableId: dbHand.table_id,
        handNumber: dbHand.hand_number,
        phase: dbHand.phase,
        players,
        dealerIndex: dealerIndex !== -1 ? dealerIndex : 0,
        smallBlindIndex: sbIndex !== -1 ? sbIndex : 0,
        bigBlindIndex: bbIndex !== -1 ? bbIndex : 0,
        currentPlayerIndex: currentPlayerIndex !== -1 ? currentPlayerIndex : -1,

        // Cards
        deck: dbHand.deck as Card[],
        communityCards: dbHand.community_cards as Card[],
        burnedCards: [], // DB doesn't store burned

        // Betting
        smallBlind: dbHand.tables?.blinds_sb || 10,
        bigBlind: dbHand.tables?.blinds_bb || 20,
        currentBet: dbHand.current_bet,
        lastRaiseAmount: dbHand.last_raise_amount,
        minRaise: 0, // Calculated dynamically

        lastAggressorId: dbHand.last_aggressor_id,
        lastRaiseWasComplete: dbHand.last_raise_was_complete ?? true,

        pots: dbHand.pots || [],
        actions: [],

        turnStartedAt: new Date(dbHand.turn_started_at).getTime(),
        turnTimeoutMs: dbHand.tables?.turn_timeout_ms || 30000,
        isHandComplete: false,
        bbHasActed: dbHand.bb_has_acted ?? false,
        winners: null,
    };
}

// Helper: Map Engine GameState to DB Updates
function mapEngineToDb(gameState: GameState, originalHand: any): any {
    // Map players back to player_states
    const playerStates = gameState.players.map(p => ({
        user_id: p.id,
        seat: p.seatIndex,
        stack: p.stack,
        hole_cards: p.hole_cards,
        current_bet: p.currentBet,
        total_bet: p.totalBetThisHand,
        is_folded: p.isFolded,
        is_all_in: p.isAllIn,
    }));

    const currentSeat = gameState.currentPlayerIndex !== -1
        ? gameState.players[gameState.currentPlayerIndex].seatIndex
        : originalHand.current_seat;

    // Calculate total pot from pots array for display
    const totalPot = (gameState.pots || []).reduce((sum, p) => sum + p.amount, 0)
        + gameState.players.reduce((sum, p) => sum + p.currentBet, 0); // Active bets

    return {
        phase: gameState.phase,
        current_bet: gameState.currentBet,
        last_raise_amount: gameState.lastRaiseAmount,
        pot: totalPot, // Simplified total
        pots: gameState.pots, // JSONB side pots
        community_cards: gameState.communityCards,
        deck: gameState.deck,
        player_states: playerStates,
        current_seat: currentSeat,

        last_aggressor_id: gameState.lastAggressorId,
        last_raise_was_complete: gameState.lastRaiseWasComplete,
        bb_has_acted: gameState.bbHasActed
    };
}
