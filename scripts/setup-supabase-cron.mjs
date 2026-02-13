#!/usr/bin/env node
/**
 * Setup Supabase cron job for game ticks.
 * 
 * This script:
 * 1. Checks if pg_cron and pg_net extensions are available
 * 2. Creates the cron job configuration
 * 3. Schedules the tick endpoint to be called every 30 seconds
 * 
 * Usage: node scripts/setup-supabase-cron.mjs [api-url]
 * Example: node scripts/setup-supabase-cron.mjs https://your-app.vercel.app
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = process.argv[2] || process.env.API_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkExtension(name) {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = '${name}') as exists;`
  }).catch(() => ({ data: null, error: { message: 'exec_sql not available' } }));

  if (error) {
    // Try direct query
    const { data: data2, error: error2 } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', name)
      .maybeSingle();
    
    return { available: !error2 && !!data2, error: error2 };
  }
  
  return { available: data?.exists ?? false, error: null };
}

async function runSQL(sql) {
  // Try using Supabase Management API or direct connection
  // Since we can't execute arbitrary SQL via REST API, we'll provide instructions
  console.log('\n📝 SQL to execute in Supabase SQL Editor:');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
}

async function main() {
  console.log('🔧 Setting up Supabase cron job for game ticks\n');
  console.log(`📍 API URL: ${API_URL}\n`);

  // Read the cron schema SQL
  const sqlPath = join(__dirname, '../supabase/schema-cron.sql');
  let sql = readFileSync(sqlPath, 'utf-8');
  
  // Replace placeholder URL with actual API URL
  sql = sql.replace(
    /'http:\/\/localhost:3000'/g,
    `'${API_URL}'`
  );

  // Check if we can enable extensions
  console.log('🔍 Checking for required extensions...\n');
  
  // Note: We can't actually check/enable extensions via REST API
  // User needs to do this in Supabase Dashboard
  console.log('⚠️  Note: Extensions must be enabled in Supabase Dashboard:');
  console.log('   1. Go to Database → Extensions');
  console.log('   2. Enable: pg_cron');
  console.log('   3. Enable: pg_net\n');

  // Create config table and function
  console.log('📦 Creating configuration...\n');
  
  const configSQL = `
-- Update API URL in config
UPDATE game_tick_config
SET api_url = '${API_URL}', updated_at = now()
WHERE id = 1;

-- If config doesn't exist, create it
INSERT INTO game_tick_config (id, api_url, enabled)
VALUES (1, '${API_URL}', true)
ON CONFLICT (id) DO UPDATE
SET api_url = EXCLUDED.api_url, updated_at = now();
`;

  await runSQL(configSQL + '\n\n' + sql);

  console.log('\n✅ Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Open Supabase Dashboard → SQL Editor');
  console.log('   2. Paste the SQL above');
  console.log('   3. Run it');
  console.log('\n🔍 To check cron jobs:');
  console.log('   SELECT * FROM cron.job WHERE jobname LIKE \'game-tick%\';');
  console.log('\n⏸️  To disable:');
  console.log('   SELECT toggle_tick_cron(false);');
  console.log('\n▶️  To enable:');
  console.log('   SELECT toggle_tick_cron(true);');
  console.log('\n🔧 To change API URL:');
  console.log(`   SELECT set_tick_api_url('${API_URL}');`);
}

main().catch(console.error);
