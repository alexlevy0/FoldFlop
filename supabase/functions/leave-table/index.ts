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

        // Set up broadcast channel early (needed for active hand handling too)
        const channel = adminClient.channel(`table:${tableId}`);

        // Mark player as folded in any active hand (prevent ghost player)
        const { data: activeHand } = await adminClient
            .from('active_hands')
            .select('id, player_states, current_seat, phase, current_bet, last_raise_amount, pots, community_cards, deck, dealer_seat, sb_seat, bb_seat, hand_number, last_aggressor_id, last_raise_was_complete, bb_has_acted, version, tables!inner(blinds_sb, blinds_bb, turn_timeout_ms)')
            .eq('table_id', tableId)
            .single();

        if (activeHand && activeHand.player_states) {
            const leavingPlayerState = activeHand.player_states.find((p: any) => p.user_id === user.id);
            const isCurrentPlayer = leavingPlayerState && activeHand.current_seat === leavingPlayerState.seat;

            // Update the leaving player's state to folded
            const updatedPlayerStates = activeHand.player_states.map((p: any) => {
                if (p.user_id === user.id) {
                    return { ...p, is_folded: true, is_sitting_out: true };
                }
                return p;
            });

            // Find the next player to act if needed
            let newCurrentSeat = activeHand.current_seat;
            let newPhase = activeHand.phase;
            let handComplete = false;

            if (isCurrentPlayer) {
                // Count remaining active players (not folded, not sitting out)
                const activePlayers = updatedPlayerStates.filter((p: any) =>
                    !p.is_folded && !p.is_sitting_out && !p.is_all_in
                );

                const allNonFolded = updatedPlayerStates.filter((p: any) => !p.is_folded && !p.is_sitting_out);

                if (allNonFolded.length <= 1) {
                    // Only one player left - hand is over
                    handComplete = true;
                    newCurrentSeat = -1;
                } else if (activePlayers.length > 0) {
                    // Find next player clockwise from current seat
                    const seats = updatedPlayerStates
                        .filter((p: any) => !p.is_folded && !p.is_sitting_out && !p.is_all_in)
                        .map((p: any) => p.seat)
                        .sort((a: number, b: number) => a - b);

                    const currentIdx = seats.findIndex((s: number) => s > activeHand.current_seat);
                    newCurrentSeat = currentIdx >= 0 ? seats[currentIdx] : seats[0];
                } else {
                    // All remaining players are all-in, advance to showdown
                    handComplete = true;
                    newCurrentSeat = -1;
                }
            }

            const updatePayload: any = {
                player_states: updatedPlayerStates,
                version: (activeHand.version || 1) + 1
            };

            if (isCurrentPlayer) {
                updatePayload.current_seat = newCurrentSeat;
                updatePayload.turn_started_at = new Date().toISOString();
            }

            await adminClient
                .from('active_hands')
                .update(updatePayload)
                .eq('id', activeHand.id);

            console.log(`Marked player ${user.id} as folded in active hand ${activeHand.id}${isCurrentPlayer ? ', advanced turn to seat ' + newCurrentSeat : ''}`);

            // If the leaving player was current, broadcast the fold action
            if (isCurrentPlayer) {
                await channel.send({
                    type: 'broadcast',
                    event: 'player_action',
                    payload: {
                        type: 'player_action',
                        tableId,
                        timestamp: Date.now(),
                        handNumber: activeHand.hand_number,
                        playerId: user.id,
                        playerName: 'Player',
                        seat: leavingPlayerState.seat,
                        action: 'fold',
                        amount: 0,
                        isLeave: true, // Flag to indicate this was due to leaving
                        currentSeat: newCurrentSeat,
                        phase: newPhase,
                        turnStartTime: new Date().toISOString(),
                    },
                });

                if (handComplete) {
                    // The last remaining player wins
                    const winner = updatedPlayerStates.find((p: any) => !p.is_folded && !p.is_sitting_out);
                    if (winner) {
                        await channel.send({
                            type: 'broadcast',
                            event: 'hand_complete',
                            payload: {
                                type: 'hand_complete',
                                tableId,
                                timestamp: Date.now(),
                                handNumber: activeHand.hand_number,
                                winners: [{ playerId: winner.user_id, potIndex: 0, amount: activeHand.pots?.reduce((s: number, p: any) => s + p.amount, 0) || 0, hand: null }],
                                pots: activeHand.pots || []
                            },
                        });
                    }
                }
            }
        }

        // Broadcast player left event
        // channel is already declared above

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
