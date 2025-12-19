// Claim Bonus Edge Function
import {
    createSupabaseClient,
    getUser,
    jsonResponse,
    errorResponse,
    handleCors,
} from '../_shared/utils.ts';

interface ClaimBonusRequest {
    bonusType: 'daily' | 'welcome';
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
        const { bonusType }: ClaimBonusRequest = await req.json();

        if (!bonusType || !['daily', 'welcome'].includes(bonusType)) {
            return errorResponse('Invalid bonus type');
        }

        const supabase = createSupabaseClient(req);

        try {
            if (bonusType === 'daily') {
                const { data, error } = await supabase.rpc('claim_daily_bonus', {
                    p_user_id: user.id,
                });

                if (error) {
                    if (error.message.includes('already claimed')) {
                        return errorResponse('Daily bonus already claimed today');
                    }
                    throw error;
                }

                // Get bonus amount
                const { data: configData } = await supabase
                    .from('admin_config')
                    .select('value')
                    .eq('key', 'daily_bonus')
                    .single();

                return jsonResponse({
                    success: true,
                    data: {
                        amount: Number(configData?.value ?? 10000),
                        newBalance: data,
                    },
                });

            } else {
                const { data, error } = await supabase.rpc('claim_welcome_bonus', {
                    p_user_id: user.id,
                });

                if (error) {
                    if (error.message.includes('already claimed')) {
                        return errorResponse('Welcome bonus already claimed');
                    }
                    throw error;
                }

                // Get bonus amount
                const { data: configData } = await supabase
                    .from('admin_config')
                    .select('value')
                    .eq('key', 'welcome_bonus')
                    .single();

                return jsonResponse({
                    success: true,
                    data: {
                        amount: Number(configData?.value ?? 50000),
                        newBalance: data,
                    },
                });
            }

        } catch (err) {
            console.error('Claim bonus error:', err);
            return errorResponse('Failed to claim bonus');
        }

    } catch (error) {
        console.error('Claim bonus error:', error);
        return errorResponse('Internal server error', 500);
    }
});
