
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tableId = process.argv[2];

if (!tableId) {
    console.error('Please provide tableId');
    process.exit(1);
}

async function run() {
    console.log(`Resetting table ${tableId}...`);

    // Delete active hand
    const { error } = await supabase
        .from('active_hands')
        .delete()
        .eq('table_id', tableId);

    if (error) {
        console.error('Error deleting active hand:', error);
    } else {
        console.log('Active hand deleted successfully.');
    }
}

run();
