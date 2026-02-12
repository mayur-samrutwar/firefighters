import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client.
// Uses service role key when available (for backend-only calls),
// otherwise falls back to anon key for local development.
//
// Lazy initialization: only creates client when getSupabaseClient() is called.
// This allows the app to run without Supabase configured (for development/testing).

let _supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_supabaseClient) {
    return _supabaseClient;
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL) {
    throw new Error(
      'Supabase URL is not set. Please configure NEXT_PUBLIC_SUPABASE_URL in your environment.'
    );
  }

  const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

  if (!SUPABASE_KEY) {
    throw new Error(
      'Supabase key is not set. Please configure SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
    },
  });

  return _supabaseClient;
}

export const supabaseServer = {
  get client() {
    return getSupabaseClient();
  },
};

// Helper to check if Supabase is configured (without throwing)
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

