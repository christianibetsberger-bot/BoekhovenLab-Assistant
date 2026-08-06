/**
 * Which values a slice control should step through.
 *
 * A phase map puts three components on axes and the fourth on a slider, so the
 * slider needs a list of levels to visit. The levels the data actually visits
 * are the honest answer: they are the concentrations that were pipetted, and
 * stopping on one of them is the difference between reading a screened
 * condition and reading an empty gap between two of them.
 *
 * That only holds while the component was screened at a handful of levels, which
 * is how a fourth component is usually varied. If it was swept continuously,
 * every well has its own value and "one frame per level" would mean hundreds of
 * frames — so past `maxLevels` this sweeps the range evenly instead.
 *
 * @param {Array<number>} values     the component's value in each well
 * @param {object}        [opts]
 * @param {number}        [opts.min] search-space floor, preferred for a sweep
 * @param {number}        [opts.max] search-space ceiling
 * @param {number}        [opts.maxLevels=40]  above this, sweep rather than enumerate
 * @param {number}        [opts.sweepSteps=12] intervals in a sweep (so 13 levels)
 * @param {number}        [opts.fallback=0]    used when there is nothing else to go on
 * @returns {Array<number>} ascending, distinct, never empty
 */
export function sliceLevels(values, opts = {}) {
  const { min, max, maxLevels = 40, sweepSteps = 12, fallback = 0 } = opts

  // Only real numbers count. `null`, `''` and `undefined` all mean "this well has
  // no value for the component", and Number() would quietly turn each of them
  // into a 0 that reads as a screened level nobody ran. A caller that wants
  // missing to mean zero — as the phase map does — says so on the way in.
  const vals = [...new Set(
    (values || [])
      .filter(v => v !== null && v !== undefined && v !== '')
      .map(Number)
      .filter(Number.isFinite)
  )].sort((a, b) => a - b)

  // Nothing to slice. One stop is still a valid slider; it just does not move.
  if (!vals.length) return [Number.isFinite(Number(fallback)) ? Number(fallback) : 0]
  if (vals.length <= maxLevels) return vals

  // Prefer the configured search space, because that is the range the map's axes
  // are drawn over. Fall back to the spread of the data when it is missing or
  // degenerate — a sweep of the wells that exist beats refusing to draw.
  let lo = Number(min)
  let hi = Number(max)
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) {
    lo = vals[0]
    hi = vals[vals.length - 1]
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) return [vals[0]]

  const n = Math.max(1, Math.round(sweepSteps))
  return Array.from({ length: n + 1 }, (_, i) => +(lo + ((hi - lo) * i) / n).toFixed(6))
}
