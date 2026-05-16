// Beer-Lambert + dilution math for HPLC peak areas exported from Chromeleon.
// Area is in mAU·min (Chromeleon reports mAU·s; the worker already divides by 60).
//
//   c_in_vial (M) = (area_mAU_min * flow_mL_min)
//                   / (injection_uL * epsilon * pathLength_cm * solventCorrection)
//   c_final  (M) = c_in_vial * dilutionFactor
//
// `dilutionFactor` defaults to vial_uL / aliquot_uL but can be overridden directly.

export const DEFAULT_HPLC_PARAMS = Object.freeze({
  pathLength_cm: 0.7,
  flow_mL_min: 0.3,
  injection_uL: 2.0,
  solventCorrection: 1.441,
  aliquot_uL: 1.5,
  vial_uL: 14.0,
})

export function dilutionFactorFromVial(vial_uL, aliquot_uL) {
  if (!aliquot_uL || aliquot_uL <= 0) return 1
  return vial_uL / aliquot_uL
}

// Returns concentration in molar (M). Use ×1e6 for µM.
export function areaToMolarity(area_mAU_min, epsilon, params) {
  const p = { ...DEFAULT_HPLC_PARAMS, ...(params || {}) }
  const dilutionFactor = p.dilutionFactor != null
    ? p.dilutionFactor
    : dilutionFactorFromVial(p.vial_uL, p.aliquot_uL)
  if (!epsilon || epsilon <= 0 || !p.injection_uL || !p.pathLength_cm || !p.solventCorrection) return 0
  const c_vial_M = (Number(area_mAU_min || 0) * p.flow_mL_min) /
    (p.injection_uL * epsilon * p.pathLength_cm * p.solventCorrection)
  return c_vial_M * dilutionFactor
}

export function areaToMicromolar(area_mAU_min, epsilon, params) {
  return areaToMolarity(area_mAU_min, epsilon, params) * 1e6
}

// Clamped to [0, 100]. R_max in the same unit as concentration (µM).
export function concentrationToConversion(concentration_uM, rMaxTheoretical_uM) {
  if (!rMaxTheoretical_uM || rMaxTheoretical_uM <= 0) return 0
  const v = (100 * Number(concentration_uM || 0)) / rMaxTheoretical_uM
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}
