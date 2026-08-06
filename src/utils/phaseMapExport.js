import { esc } from './htmlSafe'

// Plotly build the exported file loads. Pinned to the version that produced the
// figure JSON: Plotly reads its own format across majors well enough most days,
// but "most days" is not a promise worth making to a file somebody opens a year
// from now, on a machine with no lab app on it.
export const EXPORT_PLOTLY_VERSION = '3.5.0'

// JSON destined for an inline <script>. A closing tag anywhere inside a string
// ends the block early — the rest of the figure would land on the page as text
// and the file would open blank. Component names and hover labels are typed by
// the user, so this is reachable, not theoretical. Escaping every `<` costs
// nothing and closes `</script>` and `<!--` together.
const scriptJson = (value) => JSON.stringify(value ?? null).replace(/</g, '\\u003c')

/**
 * A standalone, interactive copy of the phase map.
 *
 * Plotly draws 3D in WebGL, so its image export captures only the SVG overlay —
 * a picture of the legend and nothing else. Writing the figure out as HTML is
 * what preserves a scene you can still rotate.
 *
 * When `levels` holds more than one value the file gets a slider, and `frames`
 * is expected to hold one trace list per level. `staticTraces` are concatenated
 * onto whichever frame is showing: the fitted boundaries are modelled over the
 * three axis components only, so they are the same at every level, and repeating
 * a voxel grid per phase per frame is what would make the file unopenable.
 *
 * @param {object}   o
 * @param {string}   o.title           document title, also the download name
 * @param {Array}    o.frames          one Plotly trace list per level
 * @param {Array}    [o.staticTraces]  traces drawn on every frame
 * @param {object}   o.layout          Plotly layout, shared by all frames
 * @param {number[]} [o.levels]        slider stops; ≤1 means no slider
 * @param {number}   [o.startIndex]    which level to open on
 * @param {string}   [o.unit]          unit shown beside the level readout
 * @param {number}   [o.tolerance]     ± window each level covers, 0 to omit
 * @param {string}   [o.sliderLabel]   component name shown beside the slider
 * @param {boolean}  [o.gridView]      lay out for a tall grid that scrolls
 * @returns {string} a complete HTML document
 */
export function buildExportHtml(o) {
  const {
    title = 'Phase map',
    frames = [],
    staticTraces = [],
    layout = {},
    levels = [],
    startIndex = 0,
    unit = '',
    tolerance = 0,
    sliderLabel = '',
    gridView = false,
  } = o || {}

  const showSlider = levels.length > 1
  const start = Math.min(Math.max(0, Math.round(startIndex) || 0), Math.max(0, frames.length - 1))

  const sliderHtml = showSlider
    ? `
    <div id="ui">
      <span><strong>${esc(sliderLabel)}</strong> slice</span>
      <input id="slider" type="range" min="0" max="${levels.length - 1}" step="1" value="${start}">
      <span id="val"></span>
    </div>`
    : ''

  // In a .vue file the closing tags below have to be written `<\/script>` or the
  // SFC parser ends the component's own script block on them. Kept that way here
  // so the two files can be compared line for line; the emitted text is the same.
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <script src="https://cdn.plot.ly/plotly-${EXPORT_PLOTLY_VERSION}.min.js"><\/script>
  <style>
    html,body{margin:0;height:100%;background:#000;color:#e2e8f0;
      font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;}
    #wrap{display:flex;flex-direction:column;${gridView ? '' : 'height:100vh;'}}
    #plot{${gridView ? 'width:100%;' : 'flex:1;min-height:0;'}}
    #ui{display:flex;align-items:center;gap:12px;padding:9px 14px;
      border-top:1px solid #262626;background:#0b0b0b;}
    #ui input{flex:1;min-width:0;}
    #val{font-variant-numeric:tabular-nums;min-width:130px;text-align:right;}
  </style>
</head>
<body>
  <div id="wrap">
    <div id="plot"></div>${sliderHtml}
  </div>
  <script>
    var FRAMES = ${scriptJson(frames)};
    var STATIC = ${scriptJson(staticTraces)};
    var LAYOUT = ${scriptJson(layout)};
    var LEVELS = ${scriptJson(levels)};
    var UNIT   = ${scriptJson(unit)};
    var TOL    = ${scriptJson(tolerance)};
    var el  = document.getElementById('plot');
    var out = document.getElementById('val');

    function draw(i) {
      // Carry the camera across redraws. A slider that snaps the view back to
      // the default on every step cannot be used to watch a boundary move,
      // which is the one thing it is there for.
      var fl = el._fullLayout;
      if (fl && fl.scene && fl.scene.camera) {
        LAYOUT.scene = Object.assign({}, LAYOUT.scene, { camera: fl.scene.camera });
      }
      Plotly.react(el, (FRAMES[i] || []).concat(STATIC), LAYOUT, { responsive: true });
      if (out) out.textContent = LEVELS[i] + (UNIT ? ' ' + UNIT : '') + (TOL ? ' \\u00b1 ' + TOL : '');
    }

    draw(${start});
    var s = document.getElementById('slider');
    if (s) s.addEventListener('input', function (e) { draw(+e.target.value); });
  <\/script>
</body>
</html>`
}
