import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

let cachedClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!cachedClient) {
    cachedClient = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cachedClient;
}
