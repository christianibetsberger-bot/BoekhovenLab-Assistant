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
```

`scipy` and `numpy` are likely already pinned for the existing `/api/phase-boundary` endpoint.

## Endpoints exposed

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/kinetics-fit` | Per-group kinetic model (first-order or sigmoidal, AIC-selected) |
| POST | `/api/kinetics-suggest` | Active-learning suggestions for next experiments |
| POST | `/api/kinetics-sequence-predict` | Greedy sequence optimization for high yield |

The frontend calls these from `src/components/LidaKinetics.vue` via `src/services/kineticsBackend.js`. If the backend is not yet deployed, the frontend gracefully degrades — CSV import, ledger, sequence-logo math, and Supabase save still work.

## Smoke test (after deploy)

```bash
curl -X POST https://experiment-backend-s71q.onrender.com/api/kinetics-fit \
  -H "Content-Type: application/json" \
  -d '{"experiments":[{"groupId":"g1","sequence":"GATCAG","timeCourse":[{"time":0,"conversion":0},{"time":30,"conversion":40},{"time":60,"conversion":75}],"conditions":{"temperature":30,"ligase":1,"atp":1,"mg2":5,"env":"none"}}]}'
```

Expected: `{"fits":[{"groupId":"g1","Cmax":..., "k":..., ...}], "summary":{...}}`
