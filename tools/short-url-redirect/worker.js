/**
 * Cryo-label short-URL redirect — Cloudflare Worker.
 *
 * Turns a short address like  https://<your-host>/R00116  into a 302 redirect to
 * the full inventory deep link  .../BoekhovenLab-Assistant/?qr=R00116  so a phone
 * camera scanning the small QR opens the right compound. The main app is NOT
 * moved or renamed — this just sits in front of it.
 *
 * Deploy (free): Cloudflare dashboard → Workers & Pages → Create Worker → paste
 * this → Deploy. You get  <name>.<subdomain>.workers.dev  for free; for a genuinely
 * SHORT address (needed to shrink the 0.5 mL cap QR to a scannable size), add a
 * short custom domain under the Worker's Settings → Domains & Routes.
 *
 * Then set that host as “shortHost” in the label tool and pick QR payload “Short URL”.
 */

// Where the app lives (leave as-is unless you move the app to a custom domain).
const INVENTORY = 'https://christianibetsberger-bot.github.io/BoekhovenLab-Assistant/'

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url)
    const code = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, '').trim()
    if (!code) return Response.redirect(INVENTORY, 302)
    return Response.redirect(INVENTORY + '?qr=' + encodeURIComponent(code), 302)
  },
}
