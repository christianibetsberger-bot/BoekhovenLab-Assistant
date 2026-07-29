#!/usr/bin/env python3
"""
Incoming-chemicals reader — hourly job for the Boekhoven Lab Assistant.

Reads the administration's Shopping List (READ-ONLY, without exception), finds
chemicals added in the last 12 weeks that have not yet arrived, and upserts them
into the Supabase `incoming_chemicals` table. The app shows them in Inventory and
lets a user confirm each into the real inventory.

Design constraints (all deliberate):
  * The Excel is never opened for writing and never parsed in place. Excel holds a
    `~$...` lock file while anyone has it open, and reading mid-save yields a
    truncated file — so we copy to a local temp file and parse the copy.
  * The five sheets do not share a schema. We only touch **Chemicals** (header on
    row 1, with a CAS column) and map columns by header NAME, not position, so the
    per-sheet drift elsewhere in the workbook can't misalign us.
  * Credentials come from the macOS Keychain, never a config file.

Setup (once):
    python3 -m pip install -r requirements.txt
    # store secrets in the login Keychain:
    keyring set boekhovenlab supabase_url            # https://<ref>.supabase.co
    keyring set boekhovenlab supabase_service_key    # the SERVICE ROLE key
Run:
    python3 reader.py            # add --dry-run to parse + print without uploading
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta

import requests

try:
    import keyring
except ImportError:  # pragma: no cover
    keyring = None

# Default location once the SMB share (smb://nas.ads.mwn.de/tuch/...) is mounted on
# macOS — the share `tuch` appears under /Volumes/tuch. Override with SHOPPING_LIST.
DEFAULT_PATH = "/Volumes/tuch/ocg/group/Administration/01_Shopping List_2026.xlsx"
SHEET_NAME = "Chemicals"
WEEKS_BACK = 12
KEYCHAIN_SERVICE = "boekhovenlab"

# Header keyword → canonical field. Matched case-insensitively as a substring of
# the actual header cell, most-specific first. Adjust here if the real headers
# differ (the script logs the mapping it detected so you can correct it).
HEADER_MAP = {
    "name":         ["chemical", "substance", "reagent", "product name", "compound", "material", "item", "name"],
    "cas":          ["cas"],
    "vendor":       ["vendor", "supplier", "lieferant", "hersteller", "manufacturer", "company", "firma", "brand"],
    "catalogue":    ["cat", "catalog", "catalogue", "artikel", "article", "product number", "order number", "bestellnummer", "art.-nr", "art nr"],
    "weblink":      ["link", "url", "weblink", "website", "web"],
    "quantity":     ["quantity", "amount", "size", "menge", "pack", "bottle", "volume", "grösse", "groesse", "größe"],
    "ordered_at":   ["date", "datum", "ordered", "order date", "bestelldatum", "bestellt", "added", "requested on"],
    "arrived":      ["arrived", "received", "angekommen", "erhalten", "delivered", "geliefert", "da?", "eingetroffen"],
    "requested_by": ["requested by", "requester", "owner", "besteller", "person", "initials", "wer", "user", "ordered by"],
}


def log(*a):
    print("[incoming]", *a, file=sys.stderr)


def secret(name: str, env: str) -> str:
    val = os.environ.get(env)
    if val:
        return val
    if keyring:
        val = keyring.get_password(KEYCHAIN_SERVICE, name)
    if not val:
        sys.exit(f"Missing secret '{name}'. Set it: keyring set {KEYCHAIN_SERVICE} {name}  (or export {env})")
    return val


def safe_copy(src: str) -> str:
    """Copy the workbook to a local temp file and return the temp path.

    Never parse in place. If the `~$` lock file is present the file is open; we
    still copy (a copy is atomic enough for a snapshot) but log it, and if the
    copy/parse fails the run is simply skipped until the next hour.
    """
    if not os.path.exists(src):
        sys.exit(f"Shopping list not found at {src!r}. Is the SMB share mounted? "
                 f"Set SHOPPING_LIST to override.")
    d, base = os.path.split(src)
    lock = os.path.join(d, "~$" + base)
    if os.path.exists(lock):
        log("note: workbook is open (lock file present) — copying a snapshot anyway")
    fd, tmp = tempfile.mkstemp(suffix=".xlsx", prefix="shoplist_")
    os.close(fd)
    shutil.copy2(src, tmp)   # copy2 = bytes only; we never open the original for writing
    return tmp


def detect_columns(header_cells: list) -> dict:
    """Map canonical field → 0-based column index by header text."""
    headers = [(str(c).strip().lower() if c is not None else "") for c in header_cells]
    mapping: dict[str, int] = {}
    used: set[int] = set()
    for field, keys in HEADER_MAP.items():
        best = None
        for key in keys:  # keys are ordered most-specific first
            for i, h in enumerate(headers):
                if i in used or not h:
                    continue
                if key in h:
                    best = i
                    break
            if best is not None:
                break
        if best is not None:
            mapping[field] = best
            used.add(best)
    return mapping


def as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%y", "%Y/%m/%d"):
            try:
                return datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                continue
    return None


def is_arrived(v) -> bool:
    if v is None:
        return False
    if isinstance(v, (datetime, date)):
        return True
    s = str(v).strip().lower()
    if s in ("", "no", "nein", "-", "0", "false", "open", "offen", "pending"):
        return False
    return True  # 'x', 'yes', 'ja', a date-like string, initials, etc. → arrived


def source_key(row: dict) -> str:
    basis = (row.get("weblink") or "").strip().lower()
    if not basis:
        basis = "|".join((row.get("vendor") or "", row.get("catalogue") or "", row.get("name") or "")).strip().lower()
    return hashlib.sha1(basis.encode("utf-8")).hexdigest() if basis else ""


def parse(path: str) -> list[dict]:
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    if SHEET_NAME not in wb.sheetnames:
        sys.exit(f"Sheet {SHEET_NAME!r} not found. Sheets: {wb.sheetnames}")
    ws = wb[SHEET_NAME]
    rows = ws.iter_rows(values_only=True)
    try:
        header = list(next(rows))   # Chemicals header is on row 1
    except StopIteration:
        return []
    cols = detect_columns(header)
    log("detected columns:", {k: header[v] for k, v in cols.items()})
    missing = [f for f in ("name", "ordered_at", "arrived") if f not in cols]
    if missing:
        log(f"WARNING: could not find columns {missing} by header — adjust HEADER_MAP.")

    cutoff = date.today() - timedelta(weeks=WEEKS_BACK)
    out: list[dict] = []
    for raw in rows:
        if raw is None or all(c is None for c in raw):
            continue

        def cell(field):
            i = cols.get(field)
            return raw[i] if i is not None and i < len(raw) else None

        name = cell("name")
        if not name or not str(name).strip():
            continue
        ordered = as_date(cell("ordered_at"))
        arrived = is_arrived(cell("arrived"))
        # Keep last-12-weeks items. If a row has no parseable date we still keep it
        # (better shown than silently dropped) but it won't be filtered by age.
        if ordered is not None and ordered < cutoff:
            continue

        row = {
            "name": str(name).strip(),
            "cas": _s(cell("cas")),
            "vendor": _s(cell("vendor")),
            "catalogue": _s(cell("catalogue")),
            "weblink": _s(cell("weblink")),
            "quantity": _s(cell("quantity")),
            "ordered_at": ordered.isoformat() if ordered else None,
            "requested_by": _s(cell("requested_by")),
            "arrived": arrived,
            "raw": {(_s(header[i]) or f"col{i}"): _s(v) for i, v in enumerate(raw)},
        }
        key = source_key(row)
        if not key:
            continue
        row["source_key"] = key
        out.append(row)
    return out


def _s(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    s = str(v).strip()
    return s or None


def upsert(rows: list[dict]):
    url = secret("supabase_url", "SUPABASE_URL").rstrip("/")
    key = secret("supabase_service_key", "SUPABASE_SERVICE_KEY")
    if not rows:
        log("nothing to upsert")
        return
    # de-dup within this batch (same source_key can appear twice)
    dedup = {r["source_key"]: {**r, "updated_at": datetime.utcnow().isoformat()} for r in rows}
    payload = list(dedup.values())
    resp = requests.post(
        f"{url}/rest/v1/incoming_chemicals?on_conflict=source_key",
        params={"columns": ",".join(payload[0].keys())},
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=payload,
        timeout=60,
    )
    if not resp.ok:
        sys.exit(f"Supabase upsert failed [{resp.status_code}]: {resp.text[:400]}")
    log(f"upserted {len(payload)} row(s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="parse and print, do not upload")
    ap.add_argument("--path", default=os.environ.get("SHOPPING_LIST", DEFAULT_PATH))
    args = ap.parse_args()

    tmp = safe_copy(args.path)
    try:
        rows = parse(tmp)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass

    fresh = [r for r in rows if not r["arrived"]]
    log(f"{len(rows)} recent chemicals, {len(fresh)} not yet arrived")
    if args.dry_run:
        for r in rows[:40]:
            flag = "✓arrived" if r["arrived"] else "…incoming"
            print(f"  {flag}  {r['ordered_at'] or '????-??-??'}  {r['name'][:40]:40}  {r.get('vendor') or ''} {r.get('catalogue') or ''}")
        return
    upsert(rows)   # upsert both arrived + not-arrived within 12 wks, so arrivals reflect


if __name__ == "__main__":
    main()
