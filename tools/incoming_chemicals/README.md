# Incoming-chemicals reader

Hourly local job that reads the administration's **Shopping List** (read-only) and
publishes recently-ordered, not-yet-arrived chemicals to Supabase, where the app's
Inventory → **Incoming** section shows them for one-click confirmation.

The Excel file is **never written and never parsed in place** — the reader copies
it to a temp file and parses the copy. It touches only the **Chemicals** sheet and
maps columns by header name, so drift on the other sheets can't misalign it.

## One-time setup (on the Mac that has the share mounted)

1. **Mount the share** (Finder → Go → Connect to Server):
   `smb://nas.ads.mwn.de/tuch` → it appears at `/Volumes/tuch`.
   The reader then finds `…/ocg/group/Administration/01_Shopping List_2026.xlsx`.
   If your mount path differs, set `SHOPPING_LIST=/full/path.xlsx`.

2. **Install deps** (reuse the repo venv, or make one):
   ```bash
   cd tools/incoming_chemicals
   python3 -m pip install -r requirements.txt
   ```

3. **Store secrets in the Keychain** (never a config file):
   ```bash
   keyring set boekhovenlab supabase_url          # https://<ref>.supabase.co
   keyring set boekhovenlab supabase_service_key  # the SERVICE ROLE key (Supabase → Project Settings → API)
   ```
   The service-role key is powerful (bypasses row-level security) — the Keychain is
   the right place for it; do not commit it or put it in a file.

4. **Create the table**: run `supabase/incoming_chemicals.sql` in the Supabase SQL editor.

5. **Test it**:
   ```bash
   python3 reader.py --dry-run     # parses + prints; uploads nothing
   ```
   Check the "detected columns" line it logs. If a column is wrong or missing,
   edit `HEADER_MAP` at the top of `reader.py` to match the real headers, then
   re-run. Once it looks right:
   ```bash
   python3 reader.py               # actually upserts to Supabase
   ```

6. **Schedule hourly** with launchd:
   - Edit `de.boekhovenlab.incoming-chemicals.plist` — replace both `REPLACE_ME`
     with the absolute repo path, and point the first argument at your Python
     (the venv's `python3`).
   - ```bash
     cp de.boekhovenlab.incoming-chemicals.plist ~/Library/LaunchAgents/
     launchctl load ~/Library/LaunchAgents/de.boekhovenlab.incoming-chemicals.plist
     ```
   - Logs: `/tmp/incoming-chemicals.log`.

## Notes / limits

- Runs only while your Mac is on and you're logged in. If it's asleep at the tick,
  launchd runs it on the next wake. For 24/7 coverage, move it to an always-on
  machine or an LRZ service account (that path needs `smbprotocol` instead of the
  mounted volume).
- Column detection is heuristic. The `--dry-run` "detected columns" log is the
  source of truth — verify it once against the real sheet and tune `HEADER_MAP`.
- The reader upserts by a stable `source_key` (the row's weblink, else
  vendor|catalogue|name hashed), so re-runs update rows instead of duplicating and
  arrivals are reflected the next hour.
