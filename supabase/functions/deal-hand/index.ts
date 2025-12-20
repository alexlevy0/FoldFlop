// Deal Hand Edge Function
// Starts a new hand using the shared poker engine
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';
import {
    Player,
    GameState,
    TableConfig,
    Card
} from '../_shared/poker-engine/types.ts';
import { createGameState, startHand } from '../_shared/poker-engine/game.ts';

interface DealHandRequest {
    tableId: string;
}

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
        const { tableId }: DealHandRequest = await req.json();

        if (!tableId) {
            return errorResponse('Missing tableId');
        }

        const supabase = createSupabaseClient(req);
        const adminClient = createAdminClient();

        // Get table info
        const { data: table, error: tableError } = await supabase
            .from('tables')
            .select('*')
            .eq('id', tableId)
            .single();

        if (tableError || !table) {
            return errorResponse('Table not found');
        }

        // Check for existing active hand (for previous dealer/hand info)
        // We use upsert with ON CONFLICT for atomic operation
        const { data: existingHand } = await adminClient
            .from('active_hands')
            .select('dealer_seat, hand_number')
            .eq('table_id', tableId)
            .single();

        let previousDealerSeat = -1;
        let previousHandNumber = 0;

        if (existingHand) {
            previousDealerSeat = existingHand.dealer_seat;
            previousHandNumber = existingHand.hand_number;
        }

        // Get players at table
        const { data: tablePlayers, error: playersError } = await adminClient
            .from('table_players')
            .select('id, user_id, seat, stack, is_sitting_out')
            .eq('table_id', tableId)
            .order('seat');

        if (playersError || !tablePlayers) {
            return errorResponse('Failed to get players');
        }

        // Filter active players (must have chips and not sitting out)
        // Engine handles filtering too, but good to check count here
        const activeTablePlayers = tablePlayers.filter(p => !p.is_sitting_out && p.stack > 0);

        if (activeTablePlayers.length < 2) {
            return errorResponse('Need at least 2 players to start a hand');
        }

        // 1. Map to Engine Players
        // Convert table_players to engine Player objects
        // Note: engine expects clean state, so we just pass basic info
        const enginePlayers: Player[] = tablePlayers.map(p => ({
            id: p.user_id,
            seatIndex: p.seat,
            stack: p.stack, // Current stack from table_players
            holeCards: null,
            currentBet: 0,
            totalBetThisHand: 0,
            isFolded: false,
            isAllIn: false,
            // FORCE FALSE for debugging - rule out DB state issue
            isSittingOut: false, // p.is_sitting_out,
            isDisconnected: false,
        }));

        console.log('[DealHand] Engine Players:', enginePlayers.map(p => ({ id: p.id, seat: p.seatIndex, stack: p.stack, sitOut: p.isSittingOut })));

        // 2. Prepare Table Config
        const tableConfig: TableConfig = {
            id: table.id,
            name: table.name,
            maxPlayers: table.max_players,
            smallBlind: table.blinds_sb,
            bigBlind: table.blinds_bb,
            minBuyIn: table.min_buy_in,
            maxBuyIn: table.max_buy_in,
            turnTimeoutMs: table.turn_timeout_ms || 30000,
            isPrivate: table.is_private,
            inviteCode: table.invite_code,
        };

        // 3. Determine Previous Dealer Index
        // Find the index in the player array (including sitouts) corresponding to the prev dealer seat
        let previousDealerIndex = -1;
        if (previousDealerSeat !== -1) {
            previousDealerIndex = enginePlayers.findIndex(p => p.seatIndex === previousDealerSeat);
        }

        // 4. Create & Start Game
        let gameState = createGameState(tableConfig, enginePlayers, previousDealerIndex);

        // Ensure accurate hand number
        gameState.handNumber = previousHandNumber + 1;

        // Shuffle, deal, post blinds
        console.log('[DealHand] Starting hand with players:', gameState.players.length);
        gameState = startHand(gameState);
        console.log('[DealHand] Hand started. Players:', gameState.players.map(p => ({
            id: p.id,
            stack: p.stack,
            isFolded: p.isFolded,
            isSittingOut: p.isSittingOut,
            holeCards: p.holeCards
        })));


        // 5. Map back to DB Active Hand
        const playerStates = gameState.players.map(p => ({
            user_id: p.id,
            seat: p.seatIndex,
            stack: p.stack,
            hole_cards: p.holeCards || [], // Array of objects or strings? 
            // Engine has Card objects {rank, suit}. 
            // DB JSON expects array. 
            // Existing code used strings "Ah".
            // We need to match what front-end expects or migrate front-end.
            // Front-end typically parses `Card` objects from JSON if it matches `{rank, suit}`.
            // Let's check `types.ts` in front-end or assume `active_hand` stores JSONB which is flexible.
            // Ideally strict typing. `PlayerState` interface in this file used `string[]`.
            // But `Card` object is better. 
            // Let's check `player-action` mapping. It cast DB to `Card[]`. 
            // So DB should store `Card` objects (JSON).
            current_bet: p.currentBet,
            total_bet: p.totalBetThisHand,
            is_folded: p.isFolded,
            is_all_in: p.isAllIn,
            has_acted: false, // Always reset to false for new hand
        }));

        const dealerPlayer = gameState.players[gameState.dealerIndex];
        const sbPlayer = gameState.players[gameState.smallBlindIndex];
        const bbPlayer = gameState.players[gameState.bigBlindIndex];
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        // Calculate total pot (main + side pots + active bets)
        // startHand has 0 side pots usually, just active bets + main pot (0 initially).
        // Actually `startHand` posts blinds into `currentBet` but doesn't sweep into pot yet?
        // Let's check engine pot logic. `startHand` just updates stacks and `currentBet`. 
        // Real pot is 0 until betting round ends? 
        // No, visual pot usually includes active bets.
        // `gameState.currentBet` is the call amount.
        // `gameState.pots` is empty.
        // Initial visual "pot" = SB + BB.
        const initialPot = playerStates.reduce((sum, p) => sum + p.current_bet, 0);

        // Use upsert with ON CONFLICT for atomic hand replacement
        // This prevents race conditions between delete and insert
        const handData = {
            table_id: tableId,
            hand_number: gameState.handNumber,
            phase: gameState.phase, // 'preflop'

            dealer_seat: dealerPlayer.seatIndex,
            sb_seat: sbPlayer.seatIndex,
            bb_seat: bbPlayer.seatIndex,
            current_seat: currentPlayer.seatIndex,

            current_bet: gameState.currentBet,
            last_raise_amount: gameState.lastRaiseAmount,

            pot: initialPot,
            community_cards: gameState.communityCards,
            deck: gameState.deck,
            player_states: playerStates,

            // New fields
            pots: gameState.pots,
            last_aggressor_id: gameState.lastAggressorId,
            last_raise_was_complete: gameState.lastRaiseWasComplete,
            bb_has_acted: gameState.bbHasActed,
            version: 1, // Reset version for new hand

            turn_started_at: new Date(gameState.turnStartedAt).toISOString(),
            started_at: new Date().toISOString(),
        };

        const { data: activeHand, error: upsertError } = await adminClient
            .from('active_hands')
            .upsert(handData, {
                onConflict: 'table_id', // Uses the one_active_hand_per_table constraint
                ignoreDuplicates: false, // Replace existing row
            })
            .select()
            .single();

        if (upsertError) {
            console.error('Upsert error:', upsertError);
            return errorResponse('Failed to start hand: ' + upsertError.message);
        }

        // 6. Update Player Stacks in table_players
        // StartHand deduces blinds from stacks, so we must update table_players
        for (const p of gameState.players) {
            await adminClient
                .from('table_players')
                .update({ stack: p.stack })
                .eq('table_id', tableId)
                .eq('user_id', p.id);
        }

        // 7. Broadcast Hand Started (SECURE - NO CARDS)
        const channel = adminClient.channel(`table:${tableId}`);

        await channel.send({
            type: 'broadcast',
            event: 'hand_started',
            payload: {
                type: 'hand_started',
                tableId,
                timestamp: Date.now(),
                handNumber: gameState.handNumber,
                dealerSeat: dealerPlayer.seatIndex,
                sbSeat: sbPlayer.seatIndex,
                bbSeat: bbPlayer.seatIndex,
                currentSeat: currentPlayer.seatIndex,
                pot: initialPot,
                // Critical: Tell clients cards are dealt, but make them fetch securely
                hasCards: true
            },
        });

        return jsonResponse({
            success: true,
            data: {
                handId: activeHand.id,
                handNumber: gameState.handNumber,
                dealerSeat: dealerPlayer.seatIndex,
                sbSeat: sbPlayer.seatIndex,
                bbSeat: bbPlayer.seatIndex,
                currentSeat: currentPlayer.seatIndex,
                pot: initialPot,
                phase: gameState.phase,
            },
        });

    } catch (error: any) {
        console.error('Deal hand error:', error);
        return errorResponse('Internal server error: ' + error.message, 500);
    }
});
