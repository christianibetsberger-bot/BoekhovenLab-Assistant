(function(){let e=`https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`,t=null,n=null;async function r(){if(!t)return n||(n=(async()=>{self.postMessage({type:`progress`,stage:`downloading`,text:`Downloading Python engine…`}),importScripts(`${e}pyodide.js`),t=await self.loadPyodide({indexURL:e}),self.postMessage({type:`progress`,stage:`loading-packages`,text:`Loading numpy + scipy…`}),await t.loadPackage([`numpy`,`scipy`]),self.postMessage({type:`progress`,stage:`compiling-code`,text:`Compiling fit routine…`}),t.runPython(`
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
        if np.any(np.isnan(R)) or np.any(np.isinf(R)):
            return None
        return np.maximum.accumulate(R)
    except Exception:
        return None

def _simulate_R_dense(params, initial_R, t_max, A0, B0, n=100):
    # Try every solver scipy ships at progressively looser tolerances and
    # shorter intervals. Includes Radau/BDF for stiff parameter combos.
    ku, k1, k2, kr = params
    y0 = [A0, A0, B0, B0, 0.0, 0.0, float(initial_R)]
    attempts = [
        (t_max,        n,  'LSODA', 1e-4, 1e-7),
        (t_max,        n,  'LSODA', 1e-3, 1e-6),
        (t_max,        n,  'LSODA', 1e-2, 1e-5),
        (t_max,        n,  'Radau', 1e-3, 1e-6),
        (t_max,        n,  'BDF',   1e-3, 1e-6),
        (t_max,        n,  'RK45',  1e-3, 1e-6),
        (t_max * 0.95, 60, 'RK45',  1e-3, 1e-5),
        (t_max * 0.85, 40, 'RK45',  1e-2, 1e-4),
        (t_max * 0.5,  30, 'LSODA', 1e-2, 1e-4),
    ]
    for tmax, npts, method, rtol, atol in attempts:
        if tmax <= 0:
            continue
        t_grid = np.linspace(0.0, tmax, npts)
        try:
            sol = solve_ivp(
                _replication_ode, (0.0, tmax), y0,
                args=(ku, k1, k2, kr),
                t_eval=t_grid, method=method,
                rtol=rtol, atol=atol,
            )
            if not sol.success:
                continue
            R = sol.y[6]
            if np.any(np.isnan(R)) or np.any(np.isinf(R)):
                continue
            return sol.t, np.maximum.accumulate(R)
        except Exception:
            continue
    return None, None

def _safe_floats(arr):
    return [float(v) if np.isfinite(v) else None for v in arr]

def _residuals(params, t_data, y_data, initial_R, A0, B0):
    y_sim = _simulate_R_at(params, initial_R, t_data, A0, B0)
    if y_sim is None or np.any(np.isnan(y_sim)):
        return np.full_like(y_data, 1e6)
    return y_sim - y_data

def _build_initial_guesses():
    # 5 fixed + 15 random log-uniform guesses — matches the notebook exactly.
    base = [
        [1e-6, 1e-3,  1e-11, 1e-6 ],
        [1e-4, 0.1,   1e-11, 0.1  ],
        [1e-3, 1.0,   1e-11, 1.0  ],
        [1e-5, 1.0,   1e-11, 10.0 ],
        [1e-6, 10.0,  1e-11, 50.0 ],
    ]
    np.random.seed(42)
    for _ in range(15):
        g = np.power(10, np.random.uniform(-6, 2.0, size=4)).tolist()
        g[2] = 1e-11
        base.append(g)
    return base

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
                             'simT': [], 'simY': [], 'simY_uM': [], 'note': 'Need at least 3 timepoints.'})
                continue

            limit_uM = float(g.get('limit_uM', default_lim))
            A0_exp   = float(g.get('A0', A0))
            B0_exp   = float(g.get('B0', B0))
            env      = ((g.get('conditions') or {}).get('env') or '')
            seed_pct = 0.05 if 'seed' in str(env).lower() else 0.0

            t_data = np.array([float(p['time'])       for p in tc], dtype=float)
            y_pct  = np.array([float(p['conversion']) for p in tc], dtype=float)
            order  = np.argsort(t_data)
            t_data, y_pct = t_data[order], y_pct[order]

            # Use raw µM when available (HPLC import), else derive from conversion%.
            has_conc = tc[0].get('concentration_uM') is not None
            if has_conc:
                conc_arr = [p.get('concentration_uM') for p in tc]
                conc_arr = [conc_arr[i] for i in order]
                y_data = np.array([float(v) for v in conc_arr], dtype=float)
            else:
                y_data = (y_pct / 100.0) * limit_uM

            initial_R = float(seed_pct * y_data[0]) if seed_pct > 0 else 0.0

            best_res, best_cost = None, np.inf

            for p0 in guesses:
                try:
                    res = least_squares(
                        _residuals, p0,
                        args=(t_data, y_data, initial_R, A0_exp, B0_exp),
                        bounds=([1e-12, 1e-12, 0.0, 1e-12], [100.0, 100.0, 1e-10, 100.0]),
                        x_scale='jac', ftol=1e-8, xtol=1e-8,
                    )
                    if res.success and res.cost < best_cost:
                        best_cost, best_res = res.cost, res
                except Exception:
                    continue

            if best_res is None:
                fits.append({'groupId': gid, 'model': None,
                             'ku': None, 'k1': None, 'k2': None, 'kr': None, 'k_bg': None,
                             'limit_uM': limit_uM, 'seed_uM': initial_R, 'cost': None,
                             'simT': [], 'simY': [], 'simY_uM': [], 'note': 'Fit did not converge.'})
                continue

            ku, k1, k2, kr = best_res.x
            sim_t, sim_R = _simulate_R_dense(best_res.x, initial_R, float(t_data[-1]) + 5.0, A0_exp, B0_exp)

            curve_note = None
            if sim_t is None:
                sim_t = np.linspace(0.0, float(t_data[-1]), 50)
                sim_R = np.interp(sim_t, t_data, y_data)
                curve_note = 'Curve via data interpolation (ODE sim unstable for fit params).'

            sim_y_pct = (sim_R / limit_uM) * 100.0

            fit_record = {
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
                'simT':    _safe_floats(sim_t),
                'simY':    _safe_floats(sim_y_pct),
                'simY_uM': _safe_floats(sim_R),
            }
            if curve_note:
                fit_record['note'] = curve_note
            fits.append(fit_record)
        except Exception as exc:
            fits.append({'groupId': gid, 'model': None,
                         'ku': None, 'k1': None, 'k2': None, 'kr': None, 'k_bg': None,
                         'limit_uM': None, 'seed_uM': None, 'cost': None,
                         'simT': [], 'simY': [], 'simY_uM': [], 'note': f'Unexpected error: {exc}'})

    return json.dumps({'fits': fits})
`),self.postMessage({type:`ready`})})(),n)}self.onmessage=async e=>{let n=e.data||{};try{if(n.type===`init`){await r();return}if(n.type===`fit`){await r(),self.postMessage({type:`progress`,stage:`fitting`,text:`Fitting…`});let e=t.globals.get(`fit_experiments`),i=e(JSON.stringify(n.payload));e.destroy();let a=JSON.parse(i);self.postMessage({type:`result`,id:n.id,fits:a.fits});return}}catch(e){self.postMessage({type:`error`,id:n.id,message:e?.message||String(e)})}}})();