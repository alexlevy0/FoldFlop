// Leave Table Edge Function
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface LeaveTableRequest {
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
        const { tableId }: LeaveTableRequest = await req.json();

        if (!tableId) {
            return errorResponse('Missing tableId');
        }

        const supabase = createSupabaseClient(req);
        const adminClient = createAdminClient();

        // Get player at table
        const { data: tablePlayer, error: playerError } = await supabase
            .from('table_players')
            .select('id, stack, seat')
            .eq('table_id', tableId)
            .eq('user_id', user.id)
            .single();

        if (playerError || !tablePlayer) {
            return errorResponse('You are not at this table');
        }

        const cashOut = tablePlayer.stack;
        const seatIndex = tablePlayer.seat;

        // TODO: Check if it's player's turn to act
        // For now, we allow leaving anytime
        // In production, should mark as "leaving" and process after hand

        // Remove from table
        const { error: deleteError } = await adminClient
            .from('table_players')
            .delete()
            .eq('id', tablePlayer.id);

        if (deleteError) {
            return errorResponse('Failed to leave table');
        }

        // Credit chips back to profile
        if (cashOut > 0) {
            const { error: creditError } = await adminClient.rpc('update_chips', {
                p_user_id: user.id,
                p_amount: cashOut,
                p_type: 'table_cashout',
                p_table_id: tableId,
            });

            if (creditError) {
                console.error('Failed to credit chips:', creditError);
                // Player is already removed, log the error but don't fail
            }
        }

        // Broadcast player left event
        const channel = adminClient.channel(`table:${tableId}`);

        await channel.send({
            type: 'broadcast',
            event: 'player_left',
            payload: {
                type: 'player_left',
                tableId,
                timestamp: Date.now(),
                playerId: user.id,
                seatIndex,
            },
        });

        // Check remaining player count - if <= 1, stop the current game
        const { data: remainingPlayers, error: countError } = await adminClient
            .from('table_players')
            .select('id')
            .eq('table_id', tableId);

        const remainingCount = remainingPlayers?.length ?? 0;

        if (remainingCount <= 1) {
            console.log(`Table ${tableId}: Only ${remainingCount} player(s) remaining, ending current hand`);

            // Delete any active hand
            const { error: deleteHandError } = await adminClient
                .from('hands')
                .delete()
                .eq('table_id', tableId)
                .is('ended_at', null);

            if (deleteHandError) {
                console.error('Failed to delete active hand:', deleteHandError);
            }

            // If there's a remaining player, refund their current bet from the hand
            if (remainingCount === 1 && remainingPlayers?.[0]) {
                // Award the pot to the remaining player (they win by default)
                const { data: activeHand } = await adminClient
                    .from('hands')
                    .select('pot, current_bet')
                    .eq('table_id', tableId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                // Broadcast game ended event
                await channel.send({
                    type: 'broadcast',
                    event: 'game_ended',
                    payload: {
                        type: 'game_ended',
                        tableId,
                        reason: 'not_enough_players',
                        timestamp: Date.now(),
                    },
                });
            }
        }

        return jsonResponse({
            success: true,
            data: {
                cashOut,
            },
        });

    } catch (error) {
        console.error('Leave table error:', error);
        return errorResponse('Internal server error', 500);
    }
});
