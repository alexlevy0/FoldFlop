// Join Table Edge Function
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface JoinTableRequest {
    tableId: string;
    seatIndex: number;
    buyIn: number;
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
        const { tableId, seatIndex, buyIn }: JoinTableRequest = await req.json();

        // Validate inputs
        if (!tableId || seatIndex === undefined || !buyIn) {
            return errorResponse('Missing required fields: tableId, seatIndex, buyIn');
        }

        if (seatIndex < 0 || seatIndex > 8) {
            return errorResponse('Invalid seat index (0-8)');
        }

        if (buyIn <= 0) {
            return errorResponse('Buy-in must be positive');
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

        // Check seat limits
        if (seatIndex >= table.max_players) {
            return errorResponse(`Seat ${seatIndex} is invalid for this table (max ${table.max_players} players)`);
        }

        // Calculate buy-in in chips
        const minBuyInChips = table.min_buyin * table.blinds_bb;
        const maxBuyInChips = table.max_buyin * table.blinds_bb;

        if (buyIn < minBuyInChips) {
            return errorResponse(`Minimum buy-in is ${minBuyInChips} chips (${table.min_buyin}BB)`);
        }

        if (buyIn > maxBuyInChips) {
            return errorResponse(`Maximum buy-in is ${maxBuyInChips} chips (${table.max_buyin}BB)`);
        }

        // Get user profile and check balance
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('chips')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return errorResponse('Profile not found');
        }

        if (profile.chips < buyIn) {
            return errorResponse(`Insufficient chips. You have ${profile.chips}, need ${buyIn}`);
        }

        // Check max tables per player
        const { data: configData } = await supabase
            .from('admin_config')
            .select('value')
            .eq('key', 'max_tables_per_player')
            .single();

        const maxTables = configData?.value ? Number(configData.value) : 12;

        const { count: currentTableCount } = await supabase
            .from('table_players')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if ((currentTableCount ?? 0) >= maxTables) {
            return errorResponse(`Maximum ${maxTables} tables reached`);
        }

        // Check if already at this table
        const { data: existingPlayer } = await supabase
            .from('table_players')
            .select('id')
            .eq('table_id', tableId)
            .eq('user_id', user.id)
            .single();

        if (existingPlayer) {
            return errorResponse('Already seated at this table');
        }

        // Check if seat is taken
        const { data: seatTaken } = await supabase
            .from('table_players')
            .select('id')
            .eq('table_id', tableId)
            .eq('seat', seatIndex)
            .single();

        if (seatTaken) {
            return errorResponse('Seat is already taken');
        }

        // All checks passed - perform transaction
        // 1. Deduct chips from profile
        // 2. Add player to table

        // Use admin client for atomic operation
        const { error: deductError } = await adminClient
            .from('profiles')
            .update({ chips: profile.chips - buyIn })
            .eq('id', user.id)
            .gt('chips', buyIn - 1); // Ensure they still have enough

        if (deductError) {
            return errorResponse('Failed to deduct chips');
        }

        // Add to table_players
        const { data: tablePlayer, error: insertError } = await adminClient
            .from('table_players')
            .insert({
                table_id: tableId,
                user_id: user.id,
                seat: seatIndex,
                stack: buyIn,
            })
            .select()
            .single();

        if (insertError) {
            // Rollback chip deduction
            await adminClient
                .from('profiles')
                .update({ chips: profile.chips })
                .eq('id', user.id);

            return errorResponse('Failed to join table: ' + insertError.message);
        }

        // Log transaction
        await adminClient.from('transactions').insert({
            user_id: user.id,
            amount: -buyIn,
            type: 'table_buyin',
            table_id: tableId,
        });

        // Broadcast player joined event
        const channel = adminClient.channel(`table:${tableId}`);

        const { data: playerProfile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', user.id)
            .single();

        await channel.send({
            type: 'broadcast',
            event: 'player_joined',
            payload: {
                type: 'player_joined',
                tableId,
                timestamp: Date.now(),
                player: {
                    id: user.id,
                    username: playerProfile?.username ?? 'Unknown',
                    avatarUrl: playerProfile?.avatar_url,
                    seatIndex,
                    stack: buyIn,
                },
            },
        });

        return jsonResponse({
            success: true,
            data: {
                playerId: tablePlayer.id,
                seatIndex,
                stack: buyIn,
            },
        });

    } catch (error) {
        console.error('Join table error:', error);
        return errorResponse('Internal server error', 500);
    }
});
