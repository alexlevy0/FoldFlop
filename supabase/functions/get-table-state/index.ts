// Get Table State Edge Function
// Returns current table state including active hand if any
import {
    createSupabaseClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface GetTableStateRequest {
    tableId: string;
}

Deno.serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authenticate user (optional for viewing public tables)
        const user = await getUser(req);

        // Parse request
        const { tableId }: GetTableStateRequest = await req.json();

        if (!tableId) {
            return errorResponse('Missing tableId');
        }

        const supabase = createSupabaseClient(req);

        // Get table info
        const { data: table, error: tableError } = await supabase
            .from('tables')
            .select('*')
            .eq('id', tableId)
            .single();

        if (tableError || !table) {
            return errorResponse('Table not found');
        }

        // Get players at table
        const { data: players, error: playersError } = await supabase
            .from('table_players')
            .select('id, user_id, seat, stack, is_sitting_out')
            .eq('table_id', tableId)
            .order('seat');

        if (playersError) {
            console.error('Players error:', playersError);
            return errorResponse('Failed to load players: ' + playersError.message);
        }

        // Get profiles for all players
        const playerIds = (players || []).map((p: any) => p.user_id);
        let profilesMap: Record<string, any> = {};

        if (playerIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', playerIds);

            (profiles || []).forEach((p: any) => {
                profilesMap[p.id] = p;
            });
        }

        // Get active hand if any
        const { data: activeHand } = await supabase
            .from('active_hands')
            .select('*')
            .eq('table_id', tableId)
            .single();

        // Build player list with game state
        const playerList = (players || []).map((p: any) => {
            const profile = profilesMap[p.user_id];

            // Find player state from active hand if exists
            let playerGameState: any = null;
            if (activeHand?.player_states) {
                playerGameState = activeHand.player_states.find(
                    (ps: any) => ps.user_id === p.user_id
                );
            }

            return {
                id: p.user_id,
                username: profile?.username || 'Player',
                avatarUrl: profile?.avatar_url,
                seatIndex: p.seat,
                stack: playerGameState?.stack ?? p.stack,
                isSittingOut: p.is_sitting_out,
                currentBet: playerGameState?.current_bet ?? 0,
                isFolded: playerGameState?.is_folded ?? false,
                isAllIn: playerGameState?.is_all_in ?? false,
                isDealer: activeHand ? p.seat === activeHand.dealer_seat : false,
                isSmallBlind: activeHand ? p.seat === activeHand.sb_seat : false,
                isBigBlind: activeHand ? p.seat === activeHand.bb_seat : false,
                isCurrentPlayer: activeHand ? p.seat === activeHand.current_seat : false,
                hasCards: activeHand ? !playerGameState?.is_folded : false,
            };
        });

        // Determine phase
        const phase = activeHand?.phase || 'waiting';

        // Build table state
        const tableState = {
            id: table.id,
            name: table.name,
            blinds: {
                sb: table.blinds_sb,
                bb: table.blinds_bb,
            },
            maxPlayers: table.max_players,
            turnTimeout: table.turn_timeout_ms,
            isPrivate: table.is_private,
            players: playerList,
            phase,
            pot: activeHand?.pot || 0,
            pots: activeHand?.pots || [],
            currentBet: activeHand?.current_bet || 0,
            communityCards: (activeHand?.community_cards || []).map((c: any) =>
                typeof c === 'string' ? c : `${c.rank}${c.suit}`
            ),
            dealerIndex: activeHand?.dealer_seat ?? -1,
            currentPlayerIndex: activeHand?.current_seat ?? -1,
            turnStartTime: activeHand?.turn_started_at || null,
            handNumber: activeHand?.hand_number || 0,
            myCards: [], // Will be set below for the requesting user
        };

        // If user is at the table and there's a hand, get their hole cards
        if (user && activeHand?.player_states) {
            const myPlayerState = activeHand.player_states.find(
                (ps: any) => ps.user_id === user.id
            );
            if (myPlayerState && !myPlayerState.is_folded) {
                // Convert Card objects {rank, suit} to strings "Ah" for frontend
                const cards = myPlayerState.hole_cards || [];
                tableState.myCards = cards.map((c: any) =>
                    typeof c === 'string' ? c : `${c.rank}${c.suit}`
                );
            }
        }

        return jsonResponse({
            success: true,
            data: tableState,
        });

    } catch (error) {
        console.error('Get table state error:', error);
        return errorResponse('Internal server error', 500);
    }
});
