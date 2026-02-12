# Supabase Setup for Firefighters

This directory contains the database schema for external agent management.

## Quick Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Create a new project
3. Note your project URL and API keys:
   - **Project URL**: Found in Settings → API → Project URL
   - **Service Role Key**: Found in Settings → API → Service Role (keep this secret!)
   - **Anon Key**: Found in Settings → API → anon/public key

### 2. Run the Schema

In your Supabase dashboard:
1. Go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)

This creates:
- `owners` table (for agent owners/public addresses)
- `agents` table (for external agent registrations)
- `agent_secrets` table (for authentication secrets)
- `agent_state_meta` table (for tracking agent state)

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
# OR use anon key for local dev (less secure):
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**: 
- Never commit `.env.local` to git (it's already in `.gitignore`)
- Use `SUPABASE_SERVICE_ROLE_KEY` in production (bypasses RLS)
- Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` only for local development

### 4. Install Dependencies

```bash
npm install
```

This installs `@supabase/supabase-js` if not already installed.

### 5. Verify Setup

Run the config test:

```bash
node scripts/test-supabase-config.mjs
```

If configured correctly, it should print:
```
Checking Supabase env vars...
Importing supabaseServer helper from ...
Supabase configuration looks OK.
```

## Current Status

✅ **Code structure**: Ready (`src/lib/supabaseServer.ts`)  
✅ **Schema**: Ready (`supabase/schema.sql`)  
⏳ **Database**: Not created yet (follow steps above)  
⏳ **Env vars**: Not configured yet (follow steps above)  

The app will run fine without Supabase configured - external agent APIs will fail gracefully until setup is complete.
