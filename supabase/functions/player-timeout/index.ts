
// Player Timeout Edge Function
// Allows clients to claim a timeout, forcing a Fold/Check if time is up
import {
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';
import {
    GameState,
    Player,
    Card,
    PlayerAction,
} from '../_shared/poker-engine/types.ts';
import { processAction, getCallAmount } from '../_shared/poker-engine/game.ts';

interface TimeoutRequest {
    tableId: string;
}

const GRACE_PERIOD_MS = 2000; // 2 seconds grace period for network latency

Deno.serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authenticate user (any logged in user can trigger this cleanup)
        const user = await getUser(req);
        if (!user) {
            return errorResponse('Unauthorized', 401);
        }

        // Parse request
        const { tableId }: TimeoutRequest = await req.json();

        if (!tableId) {
            return errorResponse('Missing tableId');
        }

        const adminClient = createAdminClient();

        // Get active hand
        const { data: activeHand, error: handError } = await adminClient
            .from('active_hands')
            .select('*, tables!inner(blinds_sb, blinds_bb, turn_timeout_ms)')
            .eq('table_id', tableId)
            .single();

        if (handError || !activeHand) {
            return errorResponse('No active hand at this table');
        }

        // Check if time has actually passed
        const now = Date.now();
        const turnStartedAt = new Date(activeHand.turn_started_at).getTime();
        const timeoutMs = activeHand.tables?.turn_timeout_ms || 30000;

        // Add a small grace period (e.g. 0.5 seconds) to account for network latency
        const GRACE_PERIOD_MS = 500;

        const timeElapsed = now - turnStartedAt;
        if (timeElapsed < timeoutMs + GRACE_PERIOD_MS) {
            const waitTime = Math.ceil((timeoutMs + GRACE_PERIOD_MS - timeElapsed) / 1000);
            return errorResponse(`Too early to claim timeout. Wait ${waitTime}s`);
        }

        // Build GameState
        const gameState = mapDbToEngine(activeHand);
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        if (!currentPlayer) {
            return errorResponse('No current player found');
        }

        console.log(`Timeout claimed for player ${currentPlayer.id} at seat ${currentPlayer.seatIndex}`);

        // Determine Action (Check if possible, otherwise Fold)
        // A player can check if currentBet == player.currentBet
        const toCall = gameState.currentBet - currentPlayer.currentBet;
        const actionType = toCall === 0 ? 'check' : 'fold';

        // Process action
        let newGameState: GameState;
        try {
            newGameState = processAction(
                gameState,
                currentPlayer.id,
                actionType,
                0
            );
        } catch (e: any) {
            return errorResponse(`Failed to process timeout action: ${e.message}`);
        }

        // Update DB with new state
        const updatePayload = mapEngineToDb(newGameState, activeHand);

        // Broadcast the action
        const { data: profileData } = await adminClient
            .from('profiles')
            .select('username')
            .eq('id', currentPlayer.id)
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
                playerId: currentPlayer.id,
                playerName: profileData?.username || 'Player',
                seat: currentPlayer.seatIndex,
                action: actionType, // 'fold' or 'check'
                amount: 0,
                isTimeout: true,
                // Broadcast new state summaries
                pot: updatePayload.pot,
                currentSeat: updatePayload.current_seat,
                phase: updatePayload.phase,
            },
        });

        await channel.send({
            type: 'broadcast',
            event: 'player_timeout',
            payload: {
                playerId: currentPlayer.id,
                tableId
            }
        });

        if (newGameState.isHandComplete) {
            // Broadcast hand results
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

            // 1. Update persistent stacks in table_players
            const stackUpdates = newGameState.players.map(p =>
                adminClient
                    .from('table_players')
                    .update({ stack: p.stack })
                    .eq('table_id', tableId)
                    .eq('user_id', p.id)
            );
            await Promise.all(stackUpdates);

            // 2. Delete active hand
            await adminClient
                .from('active_hands')
                .delete()
                .eq('id', activeHand.id);

        } else {
            // Update active hand
            const { error: updateError } = await adminClient
                .from('active_hands')
                .update({
                    ...updatePayload,
                    version: (activeHand.version || 1) + 1
                })
                .eq('id', activeHand.id)
                .eq('version', activeHand.version || 1); // Optimistic lock possible failure ignored for now as timeout race is rare

            if (updateError) {
                console.error('Update error:', updateError);
                return errorResponse('Failed to update game state');
            }
        }

        return jsonResponse({
            success: true,
            message: `Player ${currentPlayer.id} timed out and ${actionType}ed`
        });

    } catch (error) {
        console.error('Timeout error:', error);
        return errorResponse('Internal server error', 500);
    }
});

// Helper: Map DB ActiveHand to Engine GameState
// (Duplicated from player-action to keep function standalone and robust)
function mapDbToEngine(dbHand: any): GameState {
    const players: Player[] = dbHand.player_states.map((p: any) => ({
        id: p.user_id,
        seatIndex: p.seat,
        stack: p.stack,
        holeCards: p.hole_cards as Card[],
        currentBet: p.current_bet,
        totalBetThisHand: p.total_bet,
        isFolded: !!p.is_folded,
        isAllIn: !!p.is_all_in,
        isSittingOut: !!p.is_sitting_out,
        isDisconnected: false,
        hasActed: !!p.has_acted,
    })).sort((a: Player, b: Player) => a.seatIndex - b.seatIndex);

    const dealerIndex = players.findIndex((p: Player) => p.seatIndex === dbHand.dealer_seat);
    const sbIndex = players.findIndex((p: Player) => p.seatIndex === dbHand.sb_seat);
    const bbIndex = players.findIndex((p: Player) => p.seatIndex === dbHand.bb_seat);
    const currentPlayerIndex = players.findIndex((p: Player) => p.seatIndex === dbHand.current_seat);

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

        deck: dbHand.deck as Card[],
        communityCards: dbHand.community_cards as Card[],
        burnedCards: [],

        smallBlind: dbHand.tables?.blinds_sb || 10,
        bigBlind: dbHand.tables?.blinds_bb || 20,
        currentBet: dbHand.current_bet,
        lastRaiseAmount: dbHand.last_raise_amount,
        minRaise: 0,

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

function mapEngineToDb(gameState: GameState, originalHand: any): any {
    const playerStates = gameState.players.map(p => ({
        user_id: p.id,
        seat: p.seatIndex,
        stack: p.stack,
        hole_cards: p.holeCards,
        current_bet: p.currentBet,
        total_bet: p.totalBetThisHand,
        is_folded: p.isFolded,
        is_all_in: p.isAllIn,
        is_sitting_out: p.isSittingOut, // Was missing!
        has_acted: p.hasActed,
    }));

    const currentSeat = gameState.currentPlayerIndex !== -1
        ? gameState.players[gameState.currentPlayerIndex].seatIndex
        : -1;

    const totalPot = (gameState.pots || []).reduce((sum, p) => sum + p.amount, 0)
        + gameState.players.reduce((sum, p) => sum + p.currentBet, 0);

    return {
        phase: gameState.phase,
        current_bet: gameState.currentBet,
        last_raise_amount: gameState.lastRaiseAmount,
        pot: totalPot,
        pots: gameState.pots,
        community_cards: gameState.communityCards,
        deck: gameState.deck,
        player_states: playerStates,
        current_seat: currentSeat,
        last_aggressor_id: gameState.lastAggressorId,
        last_raise_was_complete: gameState.lastRaiseWasComplete,
        bb_has_acted: gameState.bbHasActed,
        turn_started_at: new Date().toISOString() // Reset timer for next player
    };
}
