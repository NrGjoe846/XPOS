import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { AppDatabase } from '../src/types/pos.ts';

// Load .env.local then .env so server processes pick up Supabase credentials
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const supabaseServer: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createSupabaseClient(supabaseUrl, supabaseKey) : null;

const STATE_ROW_ID = 'primary';

export async function loadStateFromSupabase(): Promise<AppDatabase | null> {
  if (!supabaseServer) return null;
  try {
    const { data, error } = await supabaseServer
      .from('orderrestro_state')
      .select('data')
      .eq('id', STATE_ROW_ID)
      .maybeSingle();

    if (error || !data?.data) return null;
    return data.data as AppDatabase;
  } catch {
    return null;
  }
}

export async function saveStateToSupabase(db: AppDatabase): Promise<{ ok: boolean; reason?: string }> {
  if (!supabaseServer) return { ok: false, reason: 'Supabase credentials not configured' };
  try {
    const { error } = await supabaseServer.from('orderrestro_state').upsert(
      {
        id: STATE_ROW_ID,
        data: db,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'Supabase sync error' };
  }
}

export async function checkSupabaseTableReady(): Promise<{ connected: boolean; tableReady: boolean; message?: string }> {
  if (!supabaseServer) {
    return { connected: false, tableReady: false, message: 'Missing SUPABASE_URL or key' };
  }
  try {
    const { error } = await supabaseServer.from('orderrestro_state').select('id').limit(1);
    if (error) {
      return { connected: true, tableReady: false, message: error.message };
    }
    return { connected: true, tableReady: true };
  } catch (err: any) {
    return { connected: false, tableReady: false, message: err?.message };
  }
}
