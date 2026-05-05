// Web Worker that runs METIS (Bayesian active learning) inside Pyodide.
//
// XGBoost is compiled to WebAssembly in Pyodide 0.27.x (package: xgboost 2.1.2),
// so the Python code below is the exact same source as
// experiment-backend/lida_kinetics.py — no modifications, same XGBRegressor,
// same _PARAM_GRID, same UCB acquisition. Numerical output is identical to
// the server engine.
//
// Protocol (postMessage):
//   { type: 'init' }                          → loads Pyodide + packages
//   { type: 'suggest',          id, payload } → runs suggest_next(payload)
//   { type: 'sequence-predict', id, payload } → runs predict_sequence(payload)
//   ─→ { type: 'progress', stage, text }      emitted during init/run
//   ─→ { type: 'ready' }                      emitted once init finishes
//   ─→ { type: 'result', id, ... }            on completion
//   ─→ { type: 'error',  id?, message }       on any failure

const PYODIDE_VERSION = '0.27.7'
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodide = null
let initPromise = null

// Verbatim copy of the METIS helpers + endpoint logic from
// experiment-backend/lida_kinetics.py (minus Flask scaffolding).
// Wrapped into suggest_next() / predict_sequence() that take/return JSON.
const METIS_CODE = `
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import RandomizedSearchCV
from xgboost import XGBRegressor

BASES = ['A', 'C', 'G', 'T']

_PARAM_GRID = {
    'learning_rate':    [0.01, 0.03, 0.1, 0.3],
    'colsample_bytree': [0.6, 0.8, 0.9, 1.0],
    'subsample':        [0.6, 0.8, 0.9, 1.0],
    'max_depth':        [2, 3, 4, 6, 8],
    'n_estimators':     [20, 40, 80, 150, 300],
    'reg_lambda':       [1, 1.5, 2],
    'gamma':            [0, 0.1, 0.4],
    'min_child_weight': [1, 2, 4],
}


def _encode_sequence(seq, max_len):
    out = np.zeros(max_len * 4, dtype=float)
    for i, b in enumerate(seq[:max_len]):
        if b in BASES:
            out[i * 4 + BASES.index(b)] = 1.0
    return out


def _featurize(exp, max_len, env_vocab):
    c = exp['conditions']
    env_oh = np.zeros(len(env_vocab))
    if c.get('env') in env_vocab:
        env_oh[env_vocab.index(c['env'])] = 1.0
    return np.concatenate([
        np.array([
            float(c.get('temperature', 0)),
            float(c.get('ligase', 0)),
            float(c.get('atp', 0)),
            float(c.get('mg2', 0)),
        ], dtype=float),
        env_oh,
        _encode_sequence(exp.get('sequence', ''), max_len),
    ])


def _max_yield(exp):
    if 'maxConversion' in exp:
        return float(exp['maxConversion'])
    tc = exp.get('timeCourse', [])
    return float(max(p['conversion'] for p in tc)) if tc else 0.0


def _build_ensemble(X, y, ensemble_size=20, n_iter=50):
    n = len(y)
    cv_folds = min(5, n)

    if n < 5:
        m = XGBRegressor(
            objective='reg:squarederror',
            n_estimators=40, learning_rate=0.1, max_depth=3,
            subsample=0.9, colsample_bytree=0.9, random_state=0,
        )
        m.fit(X, y)
        return [m] * min(ensemble_size, 5)

    effective_n_iter = min(n_iter, max(10, n * 2)) if n <= 20 else min(n_iter, 100)

    grid = RandomizedSearchCV(
        estimator=XGBRegressor(objective='reg:squarederror'),
        param_distributions=_PARAM_GRID,
        cv=cv_folds,
        scoring='neg_mean_absolute_error',
        n_jobs=1,
        n_iter=effective_n_iter,
        random_state=0,
    )
    grid.fit(X, y)

    results = (
        pd.DataFrame(grid.cv_results_)
        .sort_values('mean_test_score', ascending=False)
    )
    ensemble = []
    for params in results['params'].iloc[:ensemble_size]:
        m = XGBRegressor(objective='reg:squarederror', **params)
        m.fit(X, y)
        ensemble.append(m)
    return ensemble


def _ucb_score(ensemble, X_cand, kappa, exploitation=1.0):
    preds = np.column_stack([m.predict(X_cand) for m in ensemble])
    mean  = preds.mean(axis=1)
    std   = preds.std(axis=1)
    ucb   = exploitation * mean + kappa * std
    return mean, std, ucb


def suggest_next(payload_json):
    body          = json.loads(payload_json)
    exps          = body.get('experiments', [])
    if not exps:
        return json.dumps({'suggestions': []})

    ranges        = body.get('ranges', {}) or {}
    n             = int(body.get('nSuggestions', 12))
    kappa         = float(body.get('explorationCoeff', 1.41))
    ensemble_size = int(body.get('ensembleSize', 20))
    pool_size     = int(body.get('poolSize', 5000))

    max_len   = max(len(e.get('sequence', '')) for e in exps) or 1
    env_vocab = sorted({(e.get('conditions') or {}).get('env', 'none') for e in exps})

    X = np.array([_featurize(e, max_len, env_vocab) for e in exps])
    y = np.array([_max_yield(e) for e in exps], dtype=float)

    if len(y) < 3:
        return json.dumps({'suggestions': [],
                           'note': 'METIS needs >= 3 experiments. Add more data first.'})

    ensemble = _build_ensemble(X, y, ensemble_size=ensemble_size)

    observed_seqs = [e.get('sequence', '') for e in exps]
    per_seq = max(1, pool_size // len(observed_seqs))
    rng = np.random.default_rng()
    cand_exps = []
    for seq in observed_seqs:
        for _ in range(per_seq):
            cand_exps.append({
                'sequence': seq,
                'conditions': {
                    'temperature': float(rng.uniform(ranges.get('tMin', 20),      ranges.get('tMax', 50))),
                    'ligase':      float(rng.uniform(ranges.get('ligaseMin', 0),   ranges.get('ligaseMax', 10))),
                    'atp':         float(rng.uniform(ranges.get('atpMin', 0),      ranges.get('atpMax', 10))),
                    'mg2':         float(rng.uniform(ranges.get('mg2Min', 0),      ranges.get('mg2Max', 20))),
                    'env':         str(rng.choice(env_vocab)),
                },
            })
    cand_exps = cand_exps[:pool_size]

    Xc             = np.asarray([_featurize(c, max_len, env_vocab) for c in cand_exps])
    mean, std, ucb = _ucb_score(ensemble, Xc, kappa)

    top_idx = np.argsort(ucb)[::-1][:n]
    suggestions = [{
        **cand_exps[i],
        'predicted_conversion': round(float(mean[i]), 2),
        'uncertainty':          round(float(std[i]),  2),
        'ucb':                  round(float(ucb[i]),  2),
    } for i in top_idx]

    return json.dumps({'suggestions': suggestions})


def predict_sequence(payload_json):
    body          = json.loads(payload_json)
    exps          = body.get('experiments', [])
    if not exps:
        return json.dumps({'candidates': []})

    topK          = int(body.get('topK', 5))
    ensemble_size = int(body.get('ensembleSize', 20))
    pool_size     = int(body.get('poolSize', 2000))

    max_len   = max(len(e.get('sequence', '')) for e in exps) or 1
    env_vocab = sorted({(e.get('conditions') or {}).get('env', 'none') for e in exps})

    X = np.array([_featurize(e, max_len, env_vocab) for e in exps])
    y = np.array([_max_yield(e) for e in exps], dtype=float)

    ensemble = _build_ensemble(X, y, ensemble_size=ensemble_size)

    obs_conditions = [e['conditions'] for e in exps]
    n_cond = len(obs_conditions)
    rng = np.random.default_rng()

    cand_seqs = [''.join(rng.choice(BASES, size=max_len).tolist()) for _ in range(pool_size)]

    all_feats = np.asarray([
        _featurize({'sequence': seq, 'conditions': cond}, max_len, env_vocab)
        for seq in cand_seqs
        for cond in obs_conditions
    ])

    preds_flat = np.column_stack([m.predict(all_feats) for m in ensemble])
    preds_3d   = preds_flat.reshape(pool_size, n_cond, len(ensemble))

    seq_means = preds_3d.mean(axis=(1, 2))
    seq_stds  = preds_3d.std(axis=2).mean(axis=1)

    top_idx = np.argsort(seq_means)[::-1][:topK]

    candidates = []
    for i in top_idx:
        seq_chars = list(cand_seqs[i])
        per_pos = []
        for pos in range(max_len):
            pos_scores = {}
            for b in BASES:
                tmp = seq_chars.copy(); tmp[pos] = b
                feats = np.asarray([
                    _featurize({'sequence': ''.join(tmp), 'conditions': c}, max_len, env_vocab)
                    for c in obs_conditions
                ])
                p = np.column_stack([m.predict(feats) for m in ensemble])
                pos_scores[b] = round(float(p.mean()), 2)
            per_pos.append(pos_scores)

        candidates.append({
            'sequence':             cand_seqs[i],
            'predicted_conversion': round(float(seq_means[i]), 2),
            'uncertainty':          round(float(seq_stds[i]),  2),
            'perPositionScore':     per_pos,
        })

    return json.dumps({'candidates': candidates})
`

async function init() {
  if (pyodide) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    self.postMessage({ type: 'progress', stage: 'downloading', text: 'Downloading Python engine…' })
    importScripts(`${PYODIDE_CDN}pyodide.js`)
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })

    self.postMessage({ type: 'progress', stage: 'loading-packages', text: 'Loading numpy + pandas + xgboost…' })
    await pyodide.loadPackage(['numpy', 'pandas', 'scikit-learn', 'xgboost'])

    self.postMessage({ type: 'progress', stage: 'compiling-code', text: 'Compiling METIS engine…' })
    // XGBoost 2.1.x predates scikit-learn 1.6's __sklearn_tags__ API.
    // Patch XGBRegressor before running METIS_CODE so RandomizedSearchCV
    // can introspect it. METIS_CODE itself is not modified.
    pyodide.runPython(`
try:
    from xgboost import XGBRegressor
    if not hasattr(XGBRegressor, '__sklearn_tags__'):
        from sklearn.base import RegressorMixin
        XGBRegressor.__sklearn_tags__ = RegressorMixin.__sklearn_tags__
except Exception:
    pass
`)
    pyodide.runPython(METIS_CODE)

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

    if (msg.type === 'suggest') {
      await init()
      self.postMessage({ type: 'progress', stage: 'fitting', text: 'Training METIS ensemble…' })
      const fn = pyodide.globals.get('suggest_next')
      const resultJson = fn(JSON.stringify(msg.payload))
      fn.destroy()
      const result = JSON.parse(resultJson)
      self.postMessage({ type: 'result', id: msg.id, suggestions: result.suggestions, note: result.note })
      return
    }

    if (msg.type === 'sequence-predict') {
      await init()
      self.postMessage({ type: 'progress', stage: 'fitting', text: 'Predicting sequences…' })
      const fn = pyodide.globals.get('predict_sequence')
      const resultJson = fn(JSON.stringify(msg.payload))
      fn.destroy()
      const result = JSON.parse(resultJson)
      self.postMessage({ type: 'result', id: msg.id, candidates: result.candidates })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err?.message || String(err) })
  }
}
