## Data Import (one-time)
To pull existing tasks out of a Supabase project and into the local `toasty.db`:
1. Quit Toasty (tray → Quit).
2. Copy `scripts/migrate.env.example` → `scripts/migrate.env`; fill in `SUPABASE_URL` and `SUPABASE_KEY`.
3. Run `npm run migrate` — outputs the resolved DB path, rows fetched, rows upserted.
4. Launch Toasty normally. Imported UUIDs coexist with local `t001`-style ids.
- Idempotent: re-running is safe (UPSERT on id).
- Why `electron scripts/...` not bare `node`: `better-sqlite3` is rebuilt for Electron's Node ABI; running under system Node hits `ERR_DLOPEN_FAILED`. The script also uses `app.getPath("userData")` to find the exact same DB file the live app uses.

