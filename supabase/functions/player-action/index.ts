// Player Action Edge Function
// Validates and processes player actions using DB-backed game state
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface ActionRequest {
    type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
    amount?: number;
}

interface PlayerActionRequest {
    tableId: string;
    action: ActionRequest;
    actionId?: string;
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

        // Get active hand from DB
        const { data: activeHand, error: handError } = await adminClient
            .from('active_hands')
            .select('*')
            .eq('table_id', tableId)
            .single();

        if (handError || !activeHand) {
            return errorResponse('No active hand at this table');
        }

        const playerStates: PlayerState[] = activeHand.player_states;

        // Find the player
        const playerIndex = playerStates.findIndex(p => p.user_id === user.id);
        if (playerIndex === -1) {
            return errorResponse('You are not at this table');
        }

        const player = playerStates[playerIndex];

        // Verify it's the player's turn
        if (activeHand.current_seat !== player.seat) {
            return errorResponse(`Not your turn (current seat: ${activeHand.current_seat}, your seat: ${player.seat})`);
        }

        // Validate the action
        const validationResult = validateAction(activeHand, player, action);
        if (!validationResult.valid) {
            return errorResponse(validationResult.error!);
        }

        // Process the action
        const updates = processAction(activeHand, playerStates, playerIndex, action);

        // Update DB
        const { error: updateError } = await adminClient
            .from('active_hands')
            .update({
                player_states: updates.playerStates,
                pot: updates.pot,
                current_bet: updates.currentBet,
                current_seat: updates.currentSeat,
                phase: updates.phase,
                community_cards: updates.communityCards,
                deck: updates.deck,
                turn_started_at: new Date().toISOString(),
                players_acted_this_round: updates.playersActedThisRound ?? 0,
            })
            .eq('id', activeHand.id);

        if (updateError) {
            console.error('Update error:', updateError);
            return errorResponse('Failed to update game state');
        }

        // If hand is complete, handle it
        if (updates.isHandComplete) {
            await handleHandComplete(tableId, activeHand.id, updates, adminClient);
        }

        // Mark action as processed
        if (actionId) {
            processedActions.add(actionId);
            if (processedActions.size > 1000) {
                const firstId = processedActions.values().next().value;
                processedActions.delete(firstId);
            }
        }

        // Broadcast the action
        const playerProfile = player;
        const playerUsername = activeHand.player_states.find((p: PlayerState) => p.user_id === user.id)?.user_id;

        // Get username from profiles
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
                pot: updates.pot,
                currentSeat: updates.currentSeat,
                phase: updates.phase,
            },
        });

        return jsonResponse({
            success: true,
            data: {
                actionId: actionId ?? crypto.randomUUID(),
                pot: updates.pot,
                currentSeat: updates.currentSeat,
                phase: updates.phase,
                isHandComplete: updates.isHandComplete,
            },
        });

    } catch (error) {
        console.error('Player action error:', error);
        return errorResponse('Internal server error', 500);
    }
});

function validateAction(
    hand: any,
    player: PlayerState,
    action: ActionRequest
): { valid: boolean; error?: string } {
    if (player.is_folded || player.is_all_in) {
        return { valid: false, error: 'Cannot act - folded or all-in' };
    }

    const toCall = hand.current_bet - player.current_bet;

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
                return { valid: false, error: 'Nothing to call, use check' };
            }
            return { valid: true };

        case 'bet':
        case 'raise':
            if (!action.amount || action.amount <= 0) {
                return { valid: false, error: 'Invalid amount' };
            }
            if (action.amount > player.stack + player.current_bet) {
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
    hand: any,
    playerStates: PlayerState[],
    playerIndex: number,
    action: ActionRequest
): {
    playerStates: PlayerState[];
    pot: number;
    currentBet: number;
    currentSeat: number;
    phase: string;
    communityCards: string[];
    deck: string[];
    isHandComplete: boolean;
    playersActedThisRound: number;
} {
    const newPlayerStates = JSON.parse(JSON.stringify(playerStates)) as PlayerState[];
    const player = newPlayerStates[playerIndex];
    let newPot = hand.pot;
    let newCurrentBet = hand.current_bet;
    let newPhase = hand.phase;
    let newCommunityCards = [...hand.community_cards];
    let newDeck = [...hand.deck];
    let isHandComplete = false;

    switch (action.type) {
        case 'fold':
            player.is_folded = true;
            break;

        case 'check':
            // No chip change
            break;

        case 'call': {
            const toCall = Math.min(hand.current_bet - player.current_bet, player.stack);
            player.stack -= toCall;
            player.current_bet += toCall;
            player.total_bet += toCall;
            newPot += toCall;
            if (player.stack === 0) player.is_all_in = true;
            break;
        }

        case 'bet':
        case 'raise': {
            const amount = action.amount!;
            const betAmount = amount - player.current_bet;
            player.stack -= betAmount;
            player.current_bet = amount;
            player.total_bet += betAmount;
            newPot += betAmount;
            newCurrentBet = amount;
            if (player.stack === 0) player.is_all_in = true;
            break;
        }

        case 'all_in': {
            const allInAmount = player.stack;
            const newBet = player.current_bet + allInAmount;
            if (newBet > hand.current_bet) {
                newCurrentBet = newBet;
            }
            player.stack = 0;
            player.current_bet = newBet;
            player.total_bet += allInAmount;
            newPot += allInAmount;
            player.is_all_in = true;
            break;
        }
    }

    // Check if only one player remains
    const activePlayers = newPlayerStates.filter(p => !p.is_folded);
    if (activePlayers.length === 1) {
        isHandComplete = true;
        return {
            playerStates: newPlayerStates,
            pot: newPot,
            currentBet: newCurrentBet,
            currentSeat: -1,
            phase: 'showdown',
            communityCards: newCommunityCards,
            deck: newDeck,
            isHandComplete,
            playersActedThisRound: 0,
        };
    }

    // Check if betting round is complete
    // Round is complete when:
    // 1. All players who can act are all-in, OR
    // 2. All players who can act have matching bets AND at least one full orbit has happened
    const playersWhoCanAct = activePlayers.filter(p => !p.is_all_in);

    // Count how many players have acted in this betting round
    // We track this by checking players_acted_this_round counter in the hand state
    const playersActedThisRound = (hand.players_acted_this_round || 0) + 1;
    const allPlayersHaveActed = playersActedThisRound >= playersWhoCanAct.length;

    // For a round to be complete:
    // - Either everyone is all-in
    // - OR all players have same bet AND all players have had at least one turn
    const allBetsMatch = playersWhoCanAct.every(p => p.current_bet === newCurrentBet);
    const roundComplete = playersWhoCanAct.length === 0 ||
        (allBetsMatch && allPlayersHaveActed);

    if (roundComplete) {
        // Advance phase
        const phaseResult = advancePhase(hand, newPlayerStates, newCommunityCards, newDeck);
        return {
            playerStates: phaseResult.playerStates,
            pot: newPot,
            currentBet: 0,
            currentSeat: phaseResult.currentSeat,
            phase: phaseResult.phase,
            communityCards: phaseResult.communityCards,
            deck: phaseResult.deck,
            isHandComplete: phaseResult.isHandComplete,
            playersActedThisRound: 0, // Reset counter for new round
        };
    }

    // Move to next player
    const nextSeat = getNextPlayerSeat(newPlayerStates, player.seat);

    return {
        playerStates: newPlayerStates,
        pot: newPot,
        currentBet: newCurrentBet,
        currentSeat: nextSeat,
        phase: newPhase,
        communityCards: newCommunityCards,
        deck: newDeck,
        isHandComplete,
        playersActedThisRound, // Increment counter
    };
}

function advancePhase(
    hand: any,
    playerStates: PlayerState[],
    communityCards: string[],
    deck: string[]
): {
    playerStates: PlayerState[];
    currentSeat: number;
    phase: string;
    communityCards: string[];
    deck: string[];
    isHandComplete: boolean;
} {
    // Reset bets
    const newPlayerStates = playerStates.map(p => ({ ...p, current_bet: 0 }));
    const newDeck = [...deck];
    const newCommunityCards = [...communityCards];
    let newPhase = hand.phase;
    let isHandComplete = false;

    // Check if we should run out
    const playersWhoCanAct = newPlayerStates.filter(p => !p.is_folded && !p.is_all_in);
    if (playersWhoCanAct.length <= 1) {
        // Run out remaining cards
        while (newCommunityCards.length < 5 && newDeck.length > 0) {
            newDeck.shift(); // Burn
            if (newDeck.length > 0) {
                newCommunityCards.push(newDeck.shift()!);
            }
        }
        return {
            playerStates: newPlayerStates,
            currentSeat: -1,
            phase: 'showdown',
            communityCards: newCommunityCards,
            deck: newDeck,
            isHandComplete: true,
        };
    }

    // Normal phase advancement
    switch (hand.phase) {
        case 'preflop':
            newDeck.shift(); // Burn
            newCommunityCards.push(newDeck.shift()!, newDeck.shift()!, newDeck.shift()!);
            newPhase = 'flop';
            break;
        case 'flop':
            newDeck.shift(); // Burn
            newCommunityCards.push(newDeck.shift()!);
            newPhase = 'turn';
            break;
        case 'turn':
            newDeck.shift(); // Burn
            newCommunityCards.push(newDeck.shift()!);
            newPhase = 'river';
            break;
        case 'river':
            newPhase = 'showdown';
            isHandComplete = true;
            break;
    }

    // Get first to act (left of dealer)
    const firstSeat = getFirstToActSeat(newPlayerStates, hand.dealer_seat);

    return {
        playerStates: newPlayerStates,
        currentSeat: isHandComplete ? -1 : firstSeat,
        phase: newPhase,
        communityCards: newCommunityCards,
        deck: newDeck,
        isHandComplete,
    };
}

function getNextPlayerSeat(players: PlayerState[], currentSeat: number): number {
    const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
    const activePlayers = sortedPlayers.filter(p => !p.is_folded && !p.is_all_in);

    if (activePlayers.length === 0) return -1;

    // Find next player after current seat
    for (const player of activePlayers) {
        if (player.seat > currentSeat) {
            return player.seat;
        }
    }

    // Wrap around to first active player
    return activePlayers[0].seat;
}

function getFirstToActSeat(players: PlayerState[], dealerSeat: number): number {
    const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);

    // Find first active player after dealer
    for (const player of sortedPlayers) {
        if (player.seat > dealerSeat && !player.is_folded && !player.is_all_in) {
            return player.seat;
        }
    }

    // Wrap around
    const firstActive = sortedPlayers.find(p => !p.is_folded && !p.is_all_in);
    return firstActive?.seat ?? -1;
}

async function handleHandComplete(
    tableId: string,
    handId: string,
    updates: any,
    adminClient: ReturnType<typeof createAdminClient>
): Promise<void> {
    const activePlayers = updates.playerStates.filter((p: PlayerState) => !p.is_folded);

    // Get winner usernames from profiles
    const winnerIds = activePlayers.map((p: PlayerState) => p.user_id);
    const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, username')
        .in('id', winnerIds);

    const profileMap = new Map<string, string>();
    (profiles || []).forEach((p: { id: string; username: string }) => {
        profileMap.set(p.id, p.username);
    });

    if (activePlayers.length === 1) {
        const winner = activePlayers[0];

        // Update winner's stack in table_players
        await adminClient
            .from('table_players')
            .update({ stack: winner.stack + updates.pot })
            .eq('user_id', winner.user_id)
            .eq('table_id', tableId);
    }

    // Delete active hand
    await adminClient
        .from('active_hands')
        .delete()
        .eq('id', handId);

    // Broadcast completion with usernames
    const channel = adminClient.channel(`table:${tableId}`);
    await channel.send({
        type: 'broadcast',
        event: 'hand_complete',
        payload: {
            type: 'hand_complete',
            tableId,
            timestamp: Date.now(),
            winners: activePlayers.map((p: PlayerState) => ({
                playerId: p.user_id,
                playerName: profileMap.get(p.user_id) || 'Player',
                amount: updates.pot / activePlayers.length,
            })),
            pot: updates.pot,
        },
    });
}
