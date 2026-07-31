# Free short-URL redirect on GitHub Pages (no Cloudflare, no paid domain)

These two files (`404.html` + `index.html`) turn a short host into a redirect:
`<host>/R00012` → `…/BoekhovenLab-Assistant/?qr=R00012`. GitHub Pages serves
`404.html` for any unknown path, so **one file redirects every code** — no per-code
setup. The main app is never moved or renamed.

## How small the QR gets = how short the host is

A QR that scans on the **0.5 mL cap** can hold ~17 chars → the host must be tiny.

| Free host | Example | ~chars | QR | Setup |
|---|---|---|---|---|
| A short **GitHub org** page | `bk.github.io/R00012` | ~19 | v2 | instant, no approval |
| A **`*.workers.dev`** Worker | `a.bk.workers.dev/R00012` | ~23 | v2 | instant (Cloudflare) |
| **`js.org`** subdomain (2-char) | `bk.js.org/R00012` | 16 | **v1** ✓ | free, needs a PR |

- **v2** = scans great on 1.5 mL & Falcon, tight on the 0.5 mL cap.
- **v1** (only `js.org` is short enough) = scans on the 0.5 mL cap too.

## Deploy (instant, free — GitHub org route → v2)

1. Create a new GitHub account/org with a **short** name, e.g. `bklab`.
2. Under it, create a repo named `<name>.github.io` (a user/org Pages site).
3. Add these two files (`404.html`, `index.html`) to it. Push.
4. **Settings → Pages** → Source: `main` / root. Wait for it to go live.
5. Test: open `https://<name>.github.io/R00012` → it should bounce to the inventory.
6. In the label tool: QR mode → **Short URL**, shortHost = `<name>.github.io`.

## Upgrade to v1 for free (0.5 mL scannable — `js.org`)

1. Do the deploy above in a normal repo (any name) — but **do not** rely on the
   `github.io` host; instead you'll attach a `js.org` subdomain to it.
2. Request a subdomain at **github.com/js-org/js.org**: PR adding
   `bk.js.org` (pick a 2-char label) → your GitHub Pages repo. (Approval required;
   the project should have real content — the lab inventory qualifies.)
3. Add a `CNAME` file containing `bk.js.org` to the redirect repo, and set that as
   the repo's **Pages custom domain**.
4. shortHost = `bk.js.org`.

> `is-a.dev` is an easier-to-get alternative (lenient PR) but its domain is longer
> (`bo.is-a.dev/R00012` ≈ v2), so it doesn't help the 0.5 mL cap over the GitHub org.
