// Web Worker that runs the LIDA replication-kinetics ODE fit inside Pyodide.
//
// Why a worker: the fit takes 5–10 s on a typical laptop and blocks JS for the
// duration. Off-main-thread keeps the Vue UI responsive. Why Pyodide: the same
// scipy LSODA + least_squares call as the Render backend, just running locally
// so there's no shared CPU bottleneck across users.
//
// Protocol (postMessage):
//   { type: 'init' }                     → loads Pyodide + numpy + scipy
//   { type: 'fit', id, payload }         → runs fit_experiments(payload)
//   ─→ { type: 'progress', stage, ... }  emitted during init/fit
//   ─→ { type: 'ready' }                 emitted once init finishes
//   ─→ { type: 'result', id, fits }      emitted on fit completion
//   ─→ { type: 'error',  id?, message }  on any failure
//
// Pyodide is loaded via importScripts from the public CDN — no npm dependency,
// no Vite changes. The browser caches the ~12 MB payload after first download.

const PYODIDE_VERSION = '0.27.7'
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodide = null
let initPromise = null

// The Python fit code is the exact same source as experiment-backend/lida_kinetics.py
// (functions _replication_ode through _safe_floats, plus the per-group loop from
// kinetics_fit). Kept verbatim so numerical output matches the server engine.
const FIT_CODE = `
import json
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares

DEFAULT_A0       = 2.8
DEFAULT_B0       = 1.4
DEFAULT_LIMIT_UM = 1.4

def _replication_ode(t, y, ku, k1, k2, kr):
    A, a, B, b, Aa, Bb, R = y
    rJ1 = ku * A * a
    rJ2 = ku * B * b
    rJ3 = k1 * Aa * Bb - k2 * R
    rJ4 = kr * A * a * R
    rJ5 = kr * B * b * R
    dA  = -rJ1 - rJ4
    da  = -rJ1 - rJ4
    dB  = -rJ2 - rJ5
    db  = -rJ2 - rJ5
    dAa =  rJ1 - rJ3 - rJ5
    dBb =  rJ2 - rJ3 - rJ4
    dR  =  rJ3 + rJ4 + rJ5
    return [dA, da, dB, db, dAa, dBb, dR]

def _simulate_R_at(params, initial_R, t_eval, A0, B0, rtol=1e-4, atol=1e-7):
    ku, k1, k2, kr = params
    y0 = [A0, A0, B0, B0, 0.0, 0.0, float(initial_R)]
    t_max = float(t_eval[-1]) + 1e-6
    try:
        sol = solve_ivp(
            _replication_ode, (0.0, t_max), y0,
            args=(ku, k1, k2, kr),
            t_eval=t_eval, method='LSODA',
            rtol=rtol, atol=atol,
        )
        if not sol.success:
            return None
        R = sol.y[6]
        return None if (np.any(np.isnan(R)) or np.any(np.isinf(R))) else R
    except Exception:
        return None

def _simulate_R_dense(params, initial_R, t_max, A0, B0, n=100):
    ku, k1, k2, kr = params
    y0 = [A0, A0, B0, B0, 0.0, 0.0, float(initial_R)]
    t_grid = np.linspace(0.0, t_max, n)
    attempts = [
        ('LSODA', 1e-4, 1e-7),
        ('LSODA', 1e-3, 1e-6),
        ('LSODA', 1e-2, 1e-5),
        ('RK45',  1e-3, 1e-6),
    ]
    for method, rtol, atol in attempts:
        try:
            sol = solve_ivp(
                _replication_ode, (0.0, t_max), y0,
                args=(ku, k1, k2, kr),
                t_eval=t_grid, method=method,
                rtol=rtol, atol=atol,
            )
            if not sol.success:
                continue
            R = sol.y[6]
            if np.any(np.isnan(R)) or np.any(np.isinf(R)):
                continue
            return sol.t, R
        except Exception:
            continue
    return None, None

def _safe_floats(arr):
    return [float(v) if np.isfinite(v) else None for v in arr]

def _residuals(params, t_data, y_data, initial_R, A0, B0):
    if np.any(np.array(params) < 0):
        return np.full_like(y_data, 1e6)
    y_sim = _simulate_R_at(params, initial_R, t_data, A0, B0)
    if y_sim is None or np.any(np.isnan(y_sim)):
        return np.full_like(y_data, 1e6)
    penalty = 1e6 if np.any(np.diff(y_sim) < -1e-5) else 0.0
    return (y_sim - y_data) + penalty

def _build_initial_guesses():
    return [
        [1e-3, 1e-1, 1e-11, 1e-1],
        [1e-2, 1.0,  1e-11, 1.0 ],
        [1e-5, 1.0,  1e-11, 10.0],
    ]

def fit_experiments(payload_json):
    body        = json.loads(payload_json)
    experiments = body.get('experiments', [])
    default_lim = float(body.get('limit_uM', DEFAULT_LIMIT_UM))
    A0          = float(body.get('A0', DEFAULT_A0))
    B0          = float(body.get('B0', DEFAULT_B0))

    fits    = []
    guesses = _build_initial_guesses()

    for g in experiments:
        gid = g.get('groupId')
        try:
            tc = g.get('timeCourse', [])
            if len(tc) < 3:
                fits.append({'groupId': gid, 'model': None,
                             'ku': None, 'k1': None, 'k2': None, 'kr': None, 'k_bg': None,
                             'limit_uM': None, 'seed_uM': None, 'cost': None,
                             'simT': [], 'simY': [], 'note': 'Need at least 3 timepoints.'})
                continue

            limit_uM = float(g.get('limit_uM', default_lim))
            env      = ((g.get('conditions') or {}).get('env') or '')
            seed_pct = 0.05 if 'seed' in str(env).lower() else 0.0

            t_data = np.array([float(p['time'])       for p in tc], dtype=float)
            y_pct  = np.array([float(p['conversion']) for p in tc], dtype=float)
            order  = np.argsort(t_data)
            t_data, y_pct = t_data[order], y_pct[order]

            y_data    = (y_pct / 100.0) * limit_uM
            initial_R = float(seed_pct * np.mean(y_data))

            best_res, best_cost = None, np.inf
            good_enough = max(1e-4, 1e-4 * (limit_uM ** 2) * len(t_data))

            for p0 in guesses:
                try:
                    res = least_squares(
                        _residuals, p0,
                        args=(t_data, y_data, initial_R, A0, B0),
                        bounds=([0.0]*4, [100.0, 100.0, 0.1, 100.0]),
                        ftol=1e-6, xtol=1e-6, max_nfev=60,
                    )
                    if res.success and res.cost < best_cost:
                        best_cost, best_res = res.cost, res
                        if best_cost < good_enough:
                            break
                except Exception:
                    continue

            if best_res is None:
                fits.append({'groupId': gid, 'model': None,
                             'ku': None, 'k1': None, 'k2': None, 'kr': None, 'k_bg': None,
                             'limit_uM': limit_uM, 'seed_uM': initial_R, 'cost': None,
                             'simT': [], 'simY': [], 'note': 'Fit did not converge.'})
                continue

            ku, k1, k2, kr = best_res.x
            sim_t, sim_R = _simulate_R_dense(best_res.x, initial_R, float(t_data[-1]) + 5.0, A0, B0)
            sim_y_pct = (sim_R / limit_uM) * 100.0 if sim_R is not None else None

            fits.append({
                'groupId': gid,
                'model':   'replication_kinetics',
                'ku':      float(ku),
                'k1':      float(k1),
                'k2':      float(k2),
                'kr':      float(kr),
                'k_bg':    float(ku * k1),
                'limit_uM': limit_uM,
                'seed_uM':  initial_R,
                'cost':     float(best_cost),
                'simT':  _safe_floats(sim_t)     if sim_t     is not None else [],
                'simY':  _safe_floats(sim_y_pct) if sim_y_pct is not None else [],
            })
        except Exception as exc:
            fits.append({'groupId': gid, 'model': None,
                         'ku': None, 'k1': None, 'k2': None, 'kr': None, 'k_bg': None,
                         'limit_uM': None, 'seed_uM': None, 'cost': None,
                         'simT': [], 'simY': [], 'note': f'Unexpected error: {exc}'})

    return json.dumps({'fits': fits})
`

async function init() {
  if (pyodide) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    self.postMessage({ type: 'progress', stage: 'downloading', text: 'Downloading Python engine…' })

    // importScripts is synchronous in classic workers and exposes loadPyodide() globally.
    importScripts(`${PYODIDE_CDN}pyodide.js`)

    pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })

    self.postMessage({ type: 'progress', stage: 'loading-packages', text: 'Loading numpy + scipy…' })
    await pyodide.loadPackage(['numpy', 'scipy'])

    self.postMessage({ type: 'progress', stage: 'compiling-code', text: 'Compiling fit routine…' })
    pyodide.runPython(FIT_CODE)

    self.postMessage({ type: 'ready' })
  })()

  return initPromise
}

self.onmessage = async (e) => {
  const msg = e.data || {}

  try {
    if (msg.type === 'init') {
      await init()
      return
    }

    if (msg.type === 'fit') {
      await init()
      self.postMessage({ type: 'progress', stage: 'fitting', text: 'Fitting…' })
      const fitFn = pyodide.globals.get('fit_experiments')
      const resultJson = fitFn(JSON.stringify(msg.payload))
      fitFn.destroy()  // release the PyProxy to avoid leaks
      const result = JSON.parse(resultJson)
      self.postMessage({ type: 'result', id: msg.id, fits: result.fits })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err?.message || String(err) })
  }
}
