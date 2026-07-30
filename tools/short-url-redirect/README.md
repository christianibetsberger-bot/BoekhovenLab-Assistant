# Short-URL redirect (for the tiny cryo-label QR codes)

The full inventory URL (~76 chars) makes a version-4 QR — too dense for the 0.5 mL
DYMO cap. A **short** URL that redirects to the inventory makes a much smaller,
scannable QR. This redirect lets you do that **without renaming or moving the app**.

`worker.js` is a Cloudflare Worker: `https://<host>/R00116` → `302` →
`…/BoekhovenLab-Assistant/?qr=R00116`.

## How short can it actually get?

| Host | Example | ~chars | Helps the 0.5 mL cap? |
|---|---|---|---|
| Full URL (today) | `…-bot.github.io/BoekhovenLab-Assistant/?qr=R00116` | 76 | — |
| Free `*.workers.dev` | `boek-labels.you.workers.dev/R00116` | ~40 | Only a little (bigger labels fine) |
| **Short custom domain** | `boek.li/R00116` | ~14 | **Yes — QR drops to version 1, scannable** |

Free works and shrinks the QR a bit; a short custom domain (~€10/yr) is what makes
the smallest cap actually scan. Either way, **the main app is untouched.**

## Deploy (5 min, free)

1. Sign in at **dash.cloudflare.com** (free account).
2. **Workers & Pages → Create → Worker**, name it (e.g. `boek-labels`), **Deploy**.
3. **Edit code**, paste `worker.js`, **Deploy** again.
4. Test: open `https://<name>.<subdomain>.workers.dev/R00116` — it should bounce to the inventory.
5. *(Optional, for a truly short link)* buy a short domain, add it in the Worker's
   **Settings → Domains & Routes → Add custom domain**. Now `https://yourdomain/R00116` works.

## Point the labels at it

In the label tool: choose **QR payload → Short URL**, and set **shortHost** to your
redirect host (`<name>.<subdomain>.workers.dev` or your custom domain — no `https://`).
The app remembers it. Print — scanning now opens the inventory via the short link.

> No Cloudflare? Any host that can 302 `/{code}` → the inventory URL works the same
> (Netlify redirect, a registrar's path-preserving URL forward, etc.).
