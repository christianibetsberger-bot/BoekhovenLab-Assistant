// Minimal line-level diff for showing what changed between two journal versions.
// Works on the visible text (HTML stripped), not the raw markup, so the change
// view reads like the entry, not like source.

export function htmlToLines(html) {
  const s = String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/blockquote)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  // Trim each line; collapse runs of blank lines to a single blank.
  const raw = s.split('\n').map(l => l.trim())
  const out = []
  for (const l of raw) { if (l === '' && out[out.length - 1] === '') continue; out.push(l) }
  while (out.length && out[0] === '') out.shift()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out
}

// Returns ops [{ type: 'ctx' | 'add' | 'del', text }] via a classic LCS backtrack.
export function diffLines(aHtml, bHtml) {
  const a = htmlToLines(aHtml)
  const b = htmlToLines(bHtml)
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'ctx', text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: a[i] }); i++ }
    else { ops.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

// Compact summary like "+3 −1" for a version row.
export function diffStat(aHtml, bHtml) {
  let add = 0, del = 0
  for (const op of diffLines(aHtml, bHtml)) { if (op.type === 'add') add++; else if (op.type === 'del') del++ }
  return { add, del }
}
