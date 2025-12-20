
import {
    createSupabaseClient,
    createAdminClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface ResetTableRequest {
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
        const { tableId }: ResetTableRequest = await req.json();

        if (!tableId) {
            return errorResponse('Missing tableId');
        }

        const adminClient = createAdminClient();

        console.log(`Resetting table ${tableId} requested by ${user.id}`);

        // Delete active hand
        const { error: deleteError } = await adminClient
            .from('active_hands')
            .delete()
            .eq('table_id', tableId);

        if (deleteError) {
            console.error('Error deleting active hand:', deleteError);
            return errorResponse('Failed to delete active hand');
        }

        // Reset player states in table_players?
        // Maybe reset sitting_out status or ready status?
        // For now, just killing the hand is what's requested to "unstick" the game.
        // We could also broadcast a 'table_reset' event to force clients to refresh.

        const channel = adminClient.channel(`table:${tableId}`);
        await channel.send({
            type: 'broadcast',
            event: 'table_reset',
            payload: {
                type: 'table_reset',
                tableId,
                timestamp: Date.now(),
            },
        });

        return jsonResponse({
            success: true,
            message: 'Table reset successfully'
        });

    } catch (error) {
        console.error('Reset table error:', error);
        return errorResponse('Internal server error', 500);
    }
});
