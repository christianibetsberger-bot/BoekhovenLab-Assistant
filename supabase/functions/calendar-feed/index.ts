// ─────────────────────────────────────────────────────────────────────────────
// calendar-feed — per-user iCalendar (.ics) subscription feed of lab meetings.
//
// Apple Calendar and Google Calendar both let a user *subscribe* to a calendar
// by URL, then re-poll it on their own schedule. This function is that URL: it
// returns `text/calendar` for the meetings the requesting user is allowed to see
// (lab-wide, ones they own, or ones they're invited to). Because a subscribed
// feed is fetched by Apple/Google servers with no login, the caller is
// identified by an unguessable `?token=` that maps to a user via calendar_tokens.
//
// Deploy (JWT verification MUST be off — calendar clients can't send a JWT):
//   supabase functions deploy calendar-feed --no-verify-jwt
//
// No extra secrets to set: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically. The service-role client bypasses RLS on purpose — the
// token *is* the authorization, and we filter visibility ourselves below.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const PROD_ID = "-//Boekhoven Lab Assistant//Meetings//EN";
const CAL_NAME = "Boekhoven Lab — Meetings";

// RFC 5545 text escaping: backslash, semicolon, comma, and newlines.
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// UTC timestamp in iCalendar basic format, e.g. 20260729T131500Z.
function toICS(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

// Fold content lines to the 75-octet limit (continuations start with a space).
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 73) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length;
    if (curBytes + chBytes > 73) {
      out.push(cur);
      cur = " ";
      curBytes = 1;
    }
    cur += ch;
    curBytes += chBytes;
  }
  out.push(cur);
  return out.join("\r\n");
}

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  category: string | null;
  date: string;          // YYYY-MM-DD
  start_min: number;     // minutes from midnight, local wall-clock
  duration_min: number;
  done: boolean;
  created_at?: string | null;
}

// Planner todos carry a local wall-clock time (date + minutes), not a timezone —
// emitted as iCalendar *floating* times (no Z), so "10:30" stays 10:30 wherever
// the subscribing calendar lives. Minutes past midnight roll into the next day:
// hour 24 is not a valid iCalendar TIME and can make a parser drop the event.
function toFloating(date: string, min: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + Math.floor(min / 1440));
  const m = ((min % 1440) + 1440) % 1440;
  return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}` +
    `T${p(Math.floor(m / 60))}${p(m % 60)}00`;
}

function todoEventLines(todos: Todo[], stamp: string): string[] {
  const lines: string[] = [];
  for (const t of todos) {
    const descParts: string[] = [];
    if (t.notes) descParts.push(t.notes);
    if (t.category) descParts.push(`Category: ${t.category}`);
    descParts.push("Planner todo (Boekhoven Lab Assistant)");
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:todo-${t.id}@boekhovenlab.app`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${toFloating(t.date, t.start_min)}`,
      `DTEND:${toFloating(t.date, t.start_min + t.duration_min)}`,
      fold(`SUMMARY:${esc((t.done ? "✓ " : "") + t.title)}`),
      fold(`DESCRIPTION:${esc(descParts.join("\n"))}`),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      `LAST-MODIFIED:${toICS(t.created_at || new Date().toISOString())}`,
      "SEQUENCE:0",
      "END:VEVENT",
    );
  }
  return lines;
}

interface Meeting {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  scope: string;
  invitees: string[] | null;
  notes: string | null;
  owner_email: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function buildICS(meetings: Meeting[], todos: Todo[] = []): string {
  const stamp = toICS(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(CAL_NAME)}`,
    "X-WR-CALDESC:Meetings shared with you in the Boekhoven Lab Assistant",
    "X-WR-TIMEZONE:UTC",
    // Hint to Apple/Google how often to re-poll (they may still use their own cadence).
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const m of meetings) {
    const descParts: string[] = [];
    if (m.notes) descParts.push(m.notes);
    if (m.owner_email) descParts.push(`Organiser: ${m.owner_email}`);
    if (m.scope === "lab") descParts.push("Shared: whole lab");
    else if (m.invitees?.length) descParts.push(`Invited: ${m.invitees.join(", ")}`);
    const lastMod = m.updated_at || m.created_at || m.starts_at;

    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:meeting-${m.id}@boekhovenlab.app`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${toICS(m.starts_at)}`,
      `DTEND:${toICS(m.ends_at)}`,
      fold(`SUMMARY:${esc(m.title)}`),
    );
    if (m.location) lines.push(fold(`LOCATION:${esc(m.location)}`));
    if (descParts.length) lines.push(fold(`DESCRIPTION:${esc(descParts.join("\n"))}`));
    if (m.owner_email) lines.push(fold(`ORGANIZER;CN=${esc(m.owner_email)}:mailto:${m.owner_email}`));
    lines.push(
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      `LAST-MODIFIED:${toICS(lastMod)}`,
      "SEQUENCE:0",
      "END:VEVENT",
    );
  }

  lines.push(...todoEventLines(todos, stamp));

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return new Response("Missing feed token.", { status: 401, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Resolve the token → the user it belongs to.
  const { data: tok, error: tokErr } = await supabase
    .from("calendar_tokens")
    .select("user_id, user_email, include_todos")
    .eq("token", token)
    .maybeSingle();
  if (tokErr) {
    return new Response("Feed lookup failed.", { status: 500, headers: CORS });
  }
  if (!tok) {
    return new Response("Unknown or revoked feed token.", { status: 403, headers: CORS });
  }

  const email = String(tok.user_email || "").toLowerCase();

  // Everything ending in the last 60 days onward, limited to meetings this user
  // may see — mirrors the app's RLS: lab-wide OR owned OR invited.
  const cutoff = new Date(Date.now() - 60 * 864e5).toISOString();
  const visibility = [
    "scope.eq.lab",
    `owner_id.eq.${tok.user_id}`,
    email ? `invitees.cs.{${email}}` : "",
  ].filter(Boolean).join(",");

  const { data: meetings, error: mErr } = await supabase
    .from("meetings")
    .select("*")
    .gte("ends_at", cutoff)
    .or(visibility)
    .order("starts_at");
  if (mErr) {
    return new Response("Could not load meetings.", { status: 500, headers: CORS });
  }

  // Personal Planner todos — STRICTLY this user's own (owner_id = token's user),
  // and only when they opted in. Todos are never served into anyone else's feed.
  let todos: Todo[] = [];
  if (tok.include_todos) {
    const dayCutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const { data: tRows } = await supabase
      .from("todo_items")
      .select("*")
      .eq("owner_id", tok.user_id)
      .not("date", "is", null)
      .not("start_min", "is", null)
      .gte("date", dayCutoff)
      .order("date");
    todos = (tRows ?? []) as Todo[];
  }

  const body = buildICS((meetings ?? []) as Meeting[], todos);
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="boekhoven-lab-meetings.ics"',
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
  });
});
