#!/usr/bin/env node
/**
 * Manage Supabase cron jobs for game ticks.
 * 
 * Usage:
 *   node scripts/manage-supabase-cron.mjs status
 *   node scripts/manage-supabase-cron.mjs set-url <api-url>
 *   node scripts/manage-supabase-cron.mjs enable
 *   node scripts/manage-supabase-cron.mjs disable
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const envFile = readFileSync(`${__dirname}/../.env.local`, 'utf-8');
const SUPABASE_URL = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const DB_PASSWORD = process.env.DB_PASSWORD || 'sQ7cV9k885o4eu2b';

if (!SUPABASE_URL) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}

const DB_HOST = SUPABASE_URL.replace('https://', 'db.').replace('.supabase.co', '.supabase.co');
const DB_USER = 'postgres';
const DB_NAME = 'postgres';

function psql(query) {
  const cmd = `PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p 5432 -U ${DB_USER} -d ${DB_NAME} -c "${query.replace(/"/g, '\\"')}" -t -A`;
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (e) {
    console.error('❌ Database error:', e.message);
    return null;
  }
}

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'status': {
    console.log('📊 Cron Job Status\n');
    
    const jobs = psql(`
      SELECT 
        jobid,
        jobname,
        schedule,
        active,
        command
      FROM cron.job 
      WHERE jobname LIKE 'game-tick%'
      ORDER BY jobid;
    `);
    
    if (!jobs) {
      console.log('❌ Could not fetch cron jobs');
      break;
    }
    
    const lines = jobs.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      console.log('⚠️  No cron jobs found');
      break;
    }
    
    console.log('Job ID | Name | Schedule | Active | Command');
    console.log('─'.repeat(80));
    lines.forEach(line => {
      const [jobid, jobname, schedule, active, ...cmdParts] = line.split('|');
      const cmd = cmdParts.join('|').slice(0, 40) + '...';
      console.log(`${jobid.padEnd(6)} | ${jobname.padEnd(25)} | ${schedule.padEnd(8)} | ${active.padEnd(6)} | ${cmd}`);
    });
    
    const config = psql(`SELECT api_url, enabled FROM game_tick_config WHERE id = 1;`);
    if (config) {
      const [url, enabled] = config.split('|');
      console.log(`\n📍 API URL: ${url}`);
      console.log(`🔘 Enabled: ${enabled === 't' ? 'Yes' : 'No'}`);
    }
    break;
  }
  
  case 'set-url': {
    if (!arg) {
      console.error('❌ Usage: node scripts/manage-supabase-cron.mjs set-url <api-url>');
      console.error('   Example: node scripts/manage-supabase-cron.mjs set-url https://your-app.vercel.app');
      process.exit(1);
    }
    
    const result = psql(`SELECT set_tick_api_url('${arg}');`);
    if (result !== null) {
      console.log(`✅ API URL updated to: ${arg}`);
    }
    break;
  }
  
  case 'enable': {
    const result = psql(`SELECT toggle_tick_cron(true);`);
    if (result !== null) {
      console.log('✅ Cron job enabled');
    }
    break;
  }
  
  case 'disable': {
    const result = psql(`SELECT toggle_tick_cron(false);`);
    if (result !== null) {
      console.log('⏸️  Cron job disabled');
    }
    break;
  }
  
  case 'unschedule': {
    const result1 = psql(`SELECT cron.unschedule('game-tick-every-minute');`);
    const result2 = psql(`SELECT cron.unschedule('game-tick-every-minute-30s');`);
    if (result1 !== null && result2 !== null) {
      console.log('🗑️  Cron jobs unscheduled');
    }
    break;
  }
  
  default:
    console.log('📋 Supabase Cron Management\n');
    console.log('Usage:');
    console.log('  node scripts/manage-supabase-cron.mjs status          - Show cron job status');
    console.log('  node scripts/manage-supabase-cron.mjs set-url <url>  - Update API URL');
    console.log('  node scripts/manage-supabase-cron.mjs enable          - Enable cron jobs');
    console.log('  node scripts/manage-supabase-cron.mjs disable        - Disable cron jobs');
    console.log('  node scripts/manage-supabase-cron.mjs unschedule     - Remove cron jobs');
    break;
}
