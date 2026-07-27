// Inline SVG line icons for every module — the redesign's icon language.
// 16×16 viewBox, stroke: currentColor, stroke-width 1.5, round caps/joins.
// The seven covered by the design prototypes use its exact paths; the rest are
// authored in the same style. Rendered via v-html into the dock, command
// palette, mobile nav and card-header chips (colour comes from currentColor).

const ATTRS =
  'viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
const svg = (inner) => `<svg ${ATTRS}>${inner}</svg>`

export const MODULE_ICONS = {
  // ── from the prototypes ──
  labJournal:       svg('<rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.5" y1="5.5" x2="10.5" y2="5.5"/><line x1="5.5" y1="8" x2="10.5" y2="8"/>'),
  inventoryManager: svg('<path d="M2.7 5.2 8 2.6 13.3 5.2 13.3 10.8 8 13.4 2.7 10.8Z"/><path d="M2.7 5.2 8 7.8 13.3 5.2"/><path d="M8 7.8v5.6"/>'),
  reactionPlan:     svg('<path d="M6 2.5h4M8 2.5v4L12.5 13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1L8 6.5"/>'),
  dataFigures:      svg('<polyline points="2.5,12 6,7.5 9,10 13.5,3.5"/>'),
  wellPlateEditor:  svg('<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><circle cx="5" cy="6.5" r="0.9"/><circle cx="8" cy="6.5" r="0.9"/><circle cx="11" cy="6.5" r="0.9"/><circle cx="5" cy="9.5" r="0.9"/><circle cx="8" cy="9.5" r="0.9"/><circle cx="11" cy="9.5" r="0.9"/>'),
  timeTracker:      svg('<circle cx="8" cy="8" r="5.5"/><polyline points="8,5 8,8 10.2,9.4"/>'),
  instrumentBooking: svg('<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/><line x1="5.5" y1="2" x2="5.5" y2="5"/><line x1="10.5" y1="2" x2="10.5" y2="5"/><path d="M6 9.5 7.2 10.7 10 8"/>'),
  protocols:         svg('<path d="M4.5 2.5h5l3 3v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M9.5 2.5v3h3"/><path d="M5.8 9 7 10.2 10.2 7"/>'),
  // ── authored to match ──
  globalSettings:   svg('<line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="6" cy="5" r="1.7"/><circle cx="10" cy="11" r="1.7"/>'),
  standardStock:    svg('<path d="M5.5 2h5"/><path d="M6.5 2v8.5a1.5 1.5 0 0 0 3 0V2"/><line x1="6.5" y1="9" x2="9.5" y2="9"/>'),
  sequenceCalc:     svg('<path d="M5 2c0 3 6 3 6 6s-6 3-6 6"/><path d="M11 2c0 3-6 3-6 6s6 3 6 6"/><line x1="5.7" y1="4" x2="10.3" y2="4"/><line x1="5.7" y1="12" x2="10.3" y2="12"/>'),
  archiveManager:   svg('<rect x="2.5" y="4.5" width="11" height="9" rx="1"/><rect x="2" y="2.5" width="12" height="2.6" rx="0.6"/><line x1="6.3" y1="8.5" x2="9.7" y2="8.5"/>'),
  matrixPlanner:    svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/><line x1="2.5" y1="10" x2="13.5" y2="10"/><line x1="6.5" y1="2.5" x2="6.5" y2="13.5"/><line x1="10" y1="2.5" x2="10" y2="13.5"/>'),
  screeningPlanner: svg('<path d="M2.5 3.5H13.5L9.3 8.4V12.6L6.7 13.9V8.4Z"/>'),
  phasePredictor:   svg('<path d="M2.5 2.5v11h11"/><circle cx="5.5" cy="10.5" r="1"/><circle cx="8.5" cy="7" r="1"/><circle cx="11.5" cy="9" r="1"/>'),
  lidaKinetics:     svg('<path d="M2.5 2.5v11h11"/><path d="M3.5 12c2-6 3.5-6 4.5-3s2.5 4 4.5-4"/>'),
}

export function moduleIcon(id) { return MODULE_ICONS[id] || '' }
