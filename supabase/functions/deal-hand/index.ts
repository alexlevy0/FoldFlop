// Deal Hand Edge Function
// Starts a new hand at a table
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

// Shared game state store (in production, use Redis)
const gameStates = new Map<string, GameState>();

interface DealHandRequest {
    tableId: string;
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
    smallBlind: number;
    bigBlind: number;
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

const SUITS = ['h', 'd', 'c', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

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

        // Check if there's an active hand
        const existingState = gameStates.get(tableId);
        if (existingState && !existingState.isHandComplete) {
            return errorResponse('Hand already in progress');
        }

        // Determine dealer position
        let dealerIndex = 0;
        if (existingState) {
            // Move button to next player
            dealerIndex = (existingState.dealerIndex + 1) % activePlayers.length;
        }

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
        const players: PlayerState[] = activePlayers.map((p, i) => ({
            id: p.id,
            oderId: p.user_id,
            seat: p.seat,
            stack: p.stack,
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            isFolded: false,
            isAllIn: false,
        }));

        // Post blinds
        const sbAmount = Math.min(table.blinds_sb, players[sbIndex].stack);
        players[sbIndex].stack -= sbAmount;
        players[sbIndex].currentBet = sbAmount;
        players[sbIndex].totalBetThisHand = sbAmount;
        if (players[sbIndex].stack === 0) players[sbIndex].isAllIn = true;

        const bbAmount = Math.min(table.blinds_bb, players[bbIndex].stack);
        players[bbIndex].stack -= bbAmount;
        players[bbIndex].currentBet = bbAmount;
        players[bbIndex].totalBetThisHand = bbAmount;
        if (players[bbIndex].stack === 0) players[bbIndex].isAllIn = true;

        // Deal hole cards
        const remainingDeck = [...deck];
        for (let round = 0; round < 2; round++) {
            for (let i = 0; i < players.length; i++) {
                const dealIndex = (dealerIndex + 1 + i) % players.length;
                players[dealIndex].holeCards.push(remainingDeck.shift()!);
            }
        }

        // Determine first to act
        let firstToAct: number;
        if (isHeadsUp) {
            // Heads-up: dealer/SB acts first preflop
            firstToAct = dealerIndex;
        } else {
            // UTG is left of BB
            firstToAct = (bbIndex + 1) % players.length;
        }

        // Create game state
        const handNumber = (existingState?.handNumber ?? 0) + 1;
        const gameState: GameState = {
            tableId,
            handNumber,
            phase: 'preflop',
            dealerIndex,
            currentPlayerIndex: firstToAct,
            currentBet: table.blinds_bb,
            lastRaiseAmount: table.blinds_bb,
            communityCards: [],
            deck: remainingDeck,
            pots: [],
            players,
            turnStartedAt: Date.now(),
            isHandComplete: false,
            smallBlind: table.blinds_sb,
            bigBlind: table.blinds_bb,
        };

        // Store game state
        gameStates.set(tableId, gameState);

        // Broadcast hand started
        const channel = adminClient.channel(`table:${tableId}`);

        await channel.send({
            type: 'broadcast',
            event: 'hand_started',
            payload: {
                type: 'hand_started',
                tableId,
                timestamp: Date.now(),
                handNumber,
                dealerIndex,
                smallBlindIndex: sbIndex,
                bigBlindIndex: bbIndex,
                smallBlindAmount: sbAmount,
                bigBlindAmount: bbAmount,
                playerStacks: Object.fromEntries(players.map(p => [p.oderId, p.stack])),
            },
        });

        // Send cards to each player individually
        for (const player of players) {
            await channel.send({
                type: 'broadcast',
                event: 'cards_dealt',
                payload: {
                    type: 'cards_dealt',
                    tableId,
                    timestamp: Date.now(),
                    handNumber,
                    playerId: player.oderId,
                    cards: player.holeCards,
                },
            });
        }

        return jsonResponse({
            success: true,
            data: {
                handNumber,
                dealerIndex: activePlayers[dealerIndex].seat,
                firstToAct: activePlayers[firstToAct].user_id,
                playerCount: players.length,
            },
        });

    } catch (error) {
        console.error('Deal hand error:', error);
        return errorResponse('Internal server error', 500);
    }
});

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

// Export for use by player-action function
export { gameStates };
