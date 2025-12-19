// Shared utilities for Edge Functions
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Types
export interface AuthUser {
    id: string;
    email: string;
}

// Create Supabase client for Edge Functions
export function createSupabaseClient(req: Request): SupabaseClient {
    const authHeader = req.headers.get('Authorization');

    return createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
            global: {
                headers: authHeader ? { Authorization: authHeader } : {},
            },
        }
    );
}

// Create admin client (bypasses RLS)
export function createAdminClient(): SupabaseClient {
    return createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );
}

// Get authenticated user from request
export async function getUser(req: Request): Promise<AuthUser | null> {
    const supabase = createSupabaseClient(req);

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    return {
        id: user.id,
        email: user.email ?? '',
    };
}

// Standard JSON response
export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
    });
}

// Error response
export function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ success: false, error: message }, status);
}

// Handle CORS preflight
export function handleCors(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }
    return null;
}
