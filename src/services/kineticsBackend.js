// LIDA Kinetics backend endpoints. The Render-hosted experiment-backend repo
// exposes these via a Flask Blueprint registered into the existing app.
export const KINETICS_BACKEND_URL =
  import.meta.env.VITE_KINETICS_BACKEND_URL || 'https://experiment-backend-s71q.onrender.com'

export const ENDPOINTS = {
  fit:             `${KINETICS_BACKEND_URL}/api/kinetics-fit`,
  suggest:         `${KINETICS_BACKEND_URL}/api/kinetics-suggest`,
  sequencePredict: `${KINETICS_BACKEND_URL}/api/kinetics-sequence-predict`,
}
