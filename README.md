# Sajra

Sajra is now a static React family-tree app that can run on GitHub Pages and sync to Supabase.

## What changed

- The app is rebuilt in React + TypeScript + Vite.
- Data is stored locally in the browser and mirrored to Supabase when the env vars are set.
- Members, users, gallery items, and backups are editable from the admin console.
- You can export and import the full app state as JSON.

## Local setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

1. Push the project to a GitHub repository named `sajra` or update `vite.config.ts` if the repo name is different.
2. In GitHub, go to `Settings > Pages`.
3. Set the source to GitHub Actions.
4. Add these repository secrets in `Settings > Secrets and variables > Actions`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Push to `main` and the workflow in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) will publish the site.

## Data storage

- The app keeps its state in browser storage.
- If Supabase env vars are present, the browser state is mirrored into a single `sajra_state` row.
- Use the admin console to export a JSON backup before clearing data.
- Import that backup later to restore the site.

## Supabase setup

Run this SQL in the Supabase SQL editor:

```sql
create table if not exists public.sajra_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sajra_state enable row level security;

create policy "Allow public read" on public.sajra_state
  for select using (true);

create policy "Allow public insert" on public.sajra_state
  for insert with check (true);

create policy "Allow public update" on public.sajra_state
  for update using (true) with check (true);
```

If you want to run it locally, create a `.env` file:

```bash
VITE_SUPABASE_URL=https://eobseycmexagcdyjgsch.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key_here
```

## Admin users (login accounts)

"Add user" in the admin panel creates a real Supabase login (email + password) through the
`admin-users` Edge Function in [`supabase/functions/admin-users/index.ts`](./supabase/functions/admin-users/index.ts).
One-time setup in the Supabase dashboard:

1. **Edge Functions → Deploy a new function → Via Editor**. Name it `admin-users`, paste the file above, keep *Verify JWT* on, and deploy.
2. **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**, so only admins can create accounts.

Roles live in each account's `app_metadata.role`. `editor` accounts can manage members and the gallery;
only admins see Users and Backup. Accounts without a role (for example ones created by hand in the dashboard) count as admins.

## Important files

- [`src/App.tsx`](./src/App.tsx) contains the full React app.
- [`src/lib.ts`](./src/lib.ts) contains storage, tree, and auth helpers.
- [`src/supabase.ts`](./src/supabase.ts) contains the Supabase REST sync helper.
- [`src/styles.css`](./src/styles.css) contains the UI styling.
