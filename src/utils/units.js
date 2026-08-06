const UNIT_META = {
  'M':      { dim: 'molar',    toBase: 1e6  },
  'mM':     { dim: 'molar',    toBase: 1e3  },
  'µM':     { dim: 'molar',    toBase: 1    },
  'nM':     { dim: 'molar',    toBase: 1e-3 },
  'mg/mL':  { dim: 'mass_vol', toBase: 1    },
  'µg/µL':  { dim: 'mass_vol', toBase: 1    },
  'ng/µL':  { dim: 'mass_vol', toBase: 1e-3 },
  'X':      { dim: 'ratio',    toBase: 1    },
  'U/µL':   { dim: 'enzyme',   toBase: 1    },
  '%':      { dim: 'percent',  toBase: 1    },
  'L':      { dim: 'volume',   toBase: 1e6  },
  'mL':     { dim: 'volume',   toBase: 1e3  },
  'µL':     { dim: 'volume',   toBase: 1    },
  'nL':     { dim: 'volume',   toBase: 1e-3 },
}

export const CONC_UNITS = ['M', 'mM', 'µM', 'nM', 'mg/mL', 'µg/µL', 'ng/µL', 'X', 'U/µL', '%']

export function unitDimension(unit) {
  return UNIT_META[unit]?.dim ?? 'unknown'
}

export function compatibleUnits(stockUnit) {
  const dim = unitDimension(stockUnit)
  return Object.keys(UNIT_META).filter(u => UNIT_META[u].dim === dim)
}

export function dimsCompatible(unitA, unitB) {
  return unitDimension(unitA) === unitDimension(unitB)
}

function _toBase(val, unit) {
  return (UNIT_META[unit]?.toBase ?? 1) * val
}

// Returns C_target / C_stock (dimensionless ratio), or null when dimensions are incompatible.
// Used as: V_stock = concentrationRatio(...) * V_total
export function concentrationRatio(targetVal, targetUnit, stockVal, stockUnit) {
  if (!dimsCompatible(targetUnit, stockUnit)) return null
  const stockBase = _toBase(stockVal, stockUnit)
  if (!stockBase) return null
  return _toBase(targetVal, targetUnit) / stockBase
}

const DIM_DEFAULT = {
  molar:    'µM',
  mass_vol: 'mg/mL',
  ratio:    'X',
  enzyme:   'U/µL',
  percent:  '%',
  volume:   'µL',
}

// Returns the most common unit for the same dimension as stockUnit.
export function defaultUnitForDim(stockUnit) {
  return DIM_DEFAULT[unitDimension(stockUnit)] ?? stockUnit
}
