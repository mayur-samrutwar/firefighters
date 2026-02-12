#!/usr/bin/env node
/**
 * Lightweight sanity check for Supabase configuration.
 *
 * This does NOT hit the Supabase API; it only verifies that
 * the URL and key environment variables are present and that
 * our helper can be imported without throwing.
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from .env.local if present
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log('Checking Supabase env vars...');
  if (!url) {
    console.log('SKIP: NEXT_PUBLIC_SUPABASE_URL is not set (expected in some dev/test envs).');
    return;
  }
  if (!serviceKey && !anonKey) {
    throw new Error(
      'Supabase URL is set but no key found. Configure SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  // Try importing the server helper to ensure it can construct a client.
  const helperPath = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'supabaseServer.ts')
  ).href;

  console.log('Importing supabaseServer helper from', helperPath);
  const { isSupabaseConfigured, supabaseServer } = await import(helperPath);

  if (!isSupabaseConfigured()) {
    throw new Error('isSupabaseConfigured() returned false despite env vars being set');
  }

  // Try to access the client (lazy initialization)
  try {
    const client = supabaseServer.client;
    console.log('Supabase client initialized successfully');
  } catch (err) {
    throw new Error(`Failed to initialize Supabase client: ${err.message}`);
  }

  console.log('Supabase configuration looks OK.');
}

main().catch((err) => {
  console.error('Supabase config test failed:', err);
  process.exit(1);
});

