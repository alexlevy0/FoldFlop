// Deal Hand Edge Function
// Starts a new hand at a table, persists state to DB
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface DealHandRequest {
    tableId: string;
}

interface PlayerState {
    user_id: string;
    seat: number;
    stack: number;
    hole_cards: string[];
    current_bet: number;
    total_bet: number;
    is_folded: boolean;
    is_all_in: boolean;
}

const SUITS = ['h', 'd', 'c', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function createShuffledDeck(): string[] {
    const deck: string[] = [];

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(`${rank}${suit}`);
        }
    }

    // Fisher-Yates shuffle with crypto random
    const randomValues = new Uint32Array(deck.length);
    crypto.getRandomValues(randomValues);

    for (let i = deck.length - 1; i > 0; i--) {
        const j = randomValues[i] % (i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
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

        // Check if there's already an active hand
        const { data: existingHand } = await adminClient
            .from('active_hands')
            .select('id, hand_number')
            .eq('table_id', tableId)
            .single();

        if (existingHand) {
            // Delete the old hand (or could return error)
            await adminClient
                .from('active_hands')
                .delete()
                .eq('id', existingHand.id);
        }

        // Get players at table
        const { data: tablePlayers, error: playersError } = await supabase
            .from('table_players')
            .select('id, user_id, seat, stack, is_sitting_out')
            .eq('table_id', tableId)
            .order('seat');

        if (playersError || !tablePlayers) {
            return errorResponse('Failed to get players');
        }

        // Filter active players with chips
        const activePlayers = tablePlayers.filter(p => !p.is_sitting_out && p.stack > 0);

        if (activePlayers.length < 2) {
            return errorResponse('Need at least 2 players to start a hand');
        }

        // Determine dealer position (simple: first player for now, or rotate from previous)
        const previousHandNumber = existingHand?.hand_number ?? 0;
        const dealerIndex = previousHandNumber % activePlayers.length;

        // Create deck and shuffle
        const deck = createShuffledDeck();

        // Calculate blind positions
        const isHeadsUp = activePlayers.length === 2;
        let sbIndex: number;
        let bbIndex: number;

        if (isHeadsUp) {
            // Heads-up: dealer is small blind
            sbIndex = dealerIndex;
            bbIndex = (dealerIndex + 1) % 2;
        } else {
            sbIndex = (dealerIndex + 1) % activePlayers.length;
            bbIndex = (dealerIndex + 2) % activePlayers.length;
        }

        // Create player states
        const playerStates: PlayerState[] = activePlayers.map((p) => ({
            user_id: p.user_id,
            seat: p.seat,
            stack: p.stack,
            hole_cards: [],
            current_bet: 0,
            total_bet: 0,
            is_folded: false,
            is_all_in: false,
        }));

        // Post blinds
        const sbAmount = Math.min(table.blinds_sb, playerStates[sbIndex].stack);
        playerStates[sbIndex].stack -= sbAmount;
        playerStates[sbIndex].current_bet = sbAmount;
        playerStates[sbIndex].total_bet = sbAmount;
        if (playerStates[sbIndex].stack === 0) playerStates[sbIndex].is_all_in = true;

        const bbAmount = Math.min(table.blinds_bb, playerStates[bbIndex].stack);
        playerStates[bbIndex].stack -= bbAmount;
        playerStates[bbIndex].current_bet = bbAmount;
        playerStates[bbIndex].total_bet = bbAmount;
        if (playerStates[bbIndex].stack === 0) playerStates[bbIndex].is_all_in = true;

        // Deal hole cards
        const remainingDeck = [...deck];
        for (let round = 0; round < 2; round++) {
            for (let i = 0; i < playerStates.length; i++) {
                const dealIndex = (dealerIndex + 1 + i) % playerStates.length;
                playerStates[dealIndex].hole_cards.push(remainingDeck.shift()!);
            }
        }

        // Determine first to act
        let firstToActIndex: number;
        if (isHeadsUp) {
            // Heads-up: dealer/SB acts first preflop
            firstToActIndex = dealerIndex;
        } else {
            // UTG is left of BB
            firstToActIndex = (bbIndex + 1) % playerStates.length;
        }

        // Calculate initial pot
        const initialPot = sbAmount + bbAmount;
        const handNumber = previousHandNumber + 1;

        // Insert active hand into DB
        const { data: activeHand, error: insertError } = await adminClient
            .from('active_hands')
            .insert({
                table_id: tableId,
                hand_number: handNumber,
                phase: 'preflop',
                dealer_seat: activePlayers[dealerIndex].seat,
                sb_seat: activePlayers[sbIndex].seat,
                bb_seat: activePlayers[bbIndex].seat,
                current_seat: activePlayers[firstToActIndex].seat,
                current_bet: table.blinds_bb,
                last_raise_amount: table.blinds_bb,
                pot: initialPot,
                community_cards: [],
                deck: remainingDeck,
                player_states: playerStates,
                turn_started_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            return errorResponse('Failed to start hand: ' + insertError.message);
        }

        // Update player stacks in table_players
        for (const ps of playerStates) {
            await adminClient
                .from('table_players')
                .update({ stack: ps.stack })
                .eq('table_id', tableId)
                .eq('user_id', ps.user_id);
        }

        // Broadcast hand started via Realtime
        const channel = adminClient.channel(`table:${tableId}`);

        await channel.send({
            type: 'broadcast',
            event: 'hand_started',
            payload: {
                type: 'hand_started',
                tableId,
                timestamp: Date.now(),
                handNumber,
                dealerSeat: activePlayers[dealerIndex].seat,
                sbSeat: activePlayers[sbIndex].seat,
                bbSeat: activePlayers[bbIndex].seat,
                currentSeat: activePlayers[firstToActIndex].seat,
                pot: initialPot,
            },
        });

        // Send cards to each player individually
        for (const player of playerStates) {
            await channel.send({
                type: 'broadcast',
                event: 'cards_dealt',
                payload: {
                    type: 'cards_dealt',
                    tableId,
                    timestamp: Date.now(),
                    handNumber,
                    playerId: player.user_id,
                    cards: player.hole_cards,
                },
            });
        }

        return jsonResponse({
            success: true,
            data: {
                handId: activeHand.id,
                handNumber,
                dealerSeat: activePlayers[dealerIndex].seat,
                sbSeat: activePlayers[sbIndex].seat,
                bbSeat: activePlayers[bbIndex].seat,
                currentSeat: activePlayers[firstToActIndex].seat,
                pot: initialPot,
                phase: 'preflop',
            },
        });

    } catch (error) {
        console.error('Deal hand error:', error);
        return errorResponse('Internal server error', 500);
    }
});
