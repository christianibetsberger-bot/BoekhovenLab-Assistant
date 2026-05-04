# experiment-backend snippets — LIDA Kinetics

These files belong in the **separate** `experiment-backend` repo (Render-hosted Flask). They are kept here as a snapshot of the contract the frontend expects; copy them over manually.

## Files

| File | Destination in experiment-backend |
|---|---|
| `lida_kinetics.py` | next to `app.py` (root) |

## Two-line patch to `app.py`

The existing `app.py` is **not** to be deleted. Add only these two lines:

```python
# Near the other imports at the top of app.py
from lida_kinetics import lida_bp
```

```python
# Right after `app = Flask(__name__)` and your existing CORS setup
app.register_blueprint(lida_bp)
```

## Dependencies

Add (or confirm) these in `requirements.txt`:

```
scikit-learn>=1.3
scipy>=1.11
numpy>=1.24
xgboost>=1.7
pandas>=1.5
```

`scipy` and `numpy` are likely already pinned for the existing `/api/phase-boundary` endpoint.

## Endpoints exposed

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/kinetics-fit` | Per-group kinetic model (first-order or sigmoidal, AIC-selected) — unchanged |
| POST | `/api/kinetics-suggest` | METIS UCB active-learning suggestions |
| POST | `/api/kinetics-sequence-predict` | XGBoost ensemble sequence optimization |

### `/api/kinetics-suggest` — request fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `experiments` | list | required | array of experiment groups |
| `ranges` | object | required | `{tMin, tMax, ligaseMin, ligaseMax, atpMin, atpMax, mg2Min, mg2Max}` |
| `nSuggestions` | int | 12 | how many top candidates to return |
| `explorationCoeff` | float | 1.41 | κ in UCB = mean + κ·std. 0 = pure exploit, √2 ≈ 1.41 = UCB1, 3 = pure explore |
| `ensembleSize` | int | 20 | number of XGBoost models in ensemble (top-N from RandomizedSearchCV) |
| `poolSize` | int | 5000 | random condition combinations to score before returning top-N |

**Response** includes per-suggestion `predicted_conversion`, `uncertainty` (ensemble std), and `ucb` score.

### `/api/kinetics-sequence-predict` — request fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `experiments` | list | required | — |
| `fixedConditions` | object | null | conditions to hold constant while varying sequence |
| `topK` | int | 5 | sequences to return |
| `ensembleSize` | int | 20 | — |
| `poolSize` | int | 5000 | random sequences sampled from ACGT space |

**Response** includes per-candidate `predicted_conversion` and `uncertainty`.

The frontend calls these from `src/components/LidaKinetics.vue` via `src/services/kineticsBackend.js`. If the backend is not yet deployed, the frontend gracefully degrades — CSV import, ledger, sequence-logo math, and Supabase save still work.

## Smoke test (after deploy)

```bash
curl -X POST https://experiment-backend-s71q.onrender.com/api/kinetics-fit \
  -H "Content-Type: application/json" \
  -d '{"experiments":[{"groupId":"g1","sequence":"GATCAG","timeCourse":[{"time":0,"conversion":0},{"time":30,"conversion":40},{"time":60,"conversion":75}],"conditions":{"temperature":30,"ligase":1,"atp":1,"mg2":5,"env":"none"}}]}'
```

Expected: `{"fits":[{"groupId":"g1","Cmax":..., "k":..., ...}], "summary":{...}}`
