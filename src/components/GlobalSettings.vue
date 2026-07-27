<script setup>
import { useLabStore } from '../stores/labStore'

const store = useLabStore()

// Accent swatches (dark mode lightens each 38% toward white automatically).
const ACCENTS = store.accentOptions

function pickAccent(hex) {
  store.uiSettings.primaryColor = hex
  store.updateThemeColors()
}
function pickRadius(name) {
  store.uiSettings.radiusName = name
  store.updateThemeColors()
}
</script>

<template>
  <div class="card">
    <div class="gs-head">
      <h2 style="border:none;padding:0;margin:0;"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="6" cy="5" r="1.7"/><circle cx="10" cy="11" r="1.7"/></svg> Settings &amp; appearance</h2>
      <button class="secondary small" @click="store.toggleDarkMode()"
              :title="store.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'">
        <i class="fas" :class="store.isDarkMode ? 'fa-sun' : 'fa-moon'"></i>
        {{ store.isDarkMode ? 'Light' : 'Dark' }}
      </button>
    </div>

    <!-- ── Appearance ─────────────────────────────────────────────────────── -->
    <div class="gs-section">
      <div class="input-group">
        <label>Accent color</label>
        <div class="gs-swatches">
          <button v-for="c in ACCENTS" :key="c" class="gs-swatch"
                  :class="{ active: store.uiSettings.primaryColor.toLowerCase() === c.toLowerCase() }"
                  :style="{ background: c }" :title="c" @click="pickAccent(c)">
            <i v-if="store.uiSettings.primaryColor.toLowerCase() === c.toLowerCase()" class="fas fa-check"></i>
          </button>
          <label class="gs-custom" title="Custom accent">
            <input type="color" v-model="store.uiSettings.primaryColor" @input="store.updateThemeColors()" />
            <i class="fas fa-eye-dropper"></i>
          </label>
        </div>
      </div>

      <div class="input-group">
        <label>Corner radius</label>
        <div class="gs-seg" role="group" aria-label="Corner radius">
          <button v-for="r in ['Sharp', 'Soft', 'Round']" :key="r" type="button"
                  class="gs-seg-btn" :class="{ active: store.resolveRadiusName() === r }"
                  @click="pickRadius(r)">{{ r }}</button>
        </div>
      </div>
    </div>

    <!-- ── Experimental ───────────────────────────────────────────────────── -->
    <div class="gs-alpha">
      <label class="gs-label">Experimental</label>
      <label class="gs-toggle">
        <input type="checkbox" v-model="store.uiSettings.showAlpha" @change="store.saveUserPreferences()" />
        <span class="gs-switch"></span>
        <span class="gs-toggle-text">Show alpha modules</span>
      </label>
      <div class="gs-hint">Reveals in-development modules (Data &amp; Figures, LIDA Kinetics) in the dock, search, and dashboard. Off by default.</div>
    </div>

    <!-- ── Calculation defaults ───────────────────────────────────────────── -->
    <div class="grid-2">
      <div class="input-group">
        <label>Output decimal precision</label>
        <select v-model.number="store.globalSettings.decimals">
          <option value="1">1 decimal (0.0)</option>
          <option value="2">2 decimals (0.00)</option>
          <option value="3">3 decimals (0.000)</option>
          <option value="4">4 decimals (0.0000)</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--ln); padding-bottom: 10px; margin-bottom: 14px; }
.gs-head button { text-transform: none; }
.gs-section { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 14px; }
@media (max-width: 520px) { .gs-section { grid-template-columns: 1fr; } }

/* Accent swatches */
.gs-swatches { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gs-swatch {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent;
  cursor: pointer; padding: 0; box-shadow: 0 1px 4px rgba(0,0,0,.18);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 0.7rem; transition: transform .12s, border-color .12s;
}
.gs-swatch:hover { transform: scale(1.1); filter: none; }
.gs-swatch.active { border-color: var(--tx); }
.gs-custom {
  position: relative; width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: var(--fl); color: var(--tx2); border: 1px dashed var(--ln2);
}
.gs-custom input[type="color"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; padding: 0; height: 100%; }

/* Radius segmented control */
.gs-seg { display: inline-flex; padding: 2px; gap: 2px; background: var(--fl); border-radius: calc(var(--rc) + 2px); }
.gs-seg-btn { flex: 1; background: transparent; color: var(--tx2); border: none; box-shadow: none; padding: 7px 14px; border-radius: var(--rc); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.gs-seg-btn:hover { filter: none; color: var(--tx); }
.gs-seg-btn.active { background: var(--acc); color: #fff; box-shadow: 0 2px 6px var(--acsh); }

/* Alpha toggle switch */
.gs-alpha { margin-bottom: 14px; }
.gs-label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.72rem; color: var(--tx2); }
.gs-toggle { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
.gs-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.gs-switch { display: inline-block; vertical-align: middle; width: 40px; height: 24px; border-radius: 999px; background: var(--ln2); position: relative; transition: background .15s; flex: none; }
.gs-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }
.gs-toggle input:checked + .gs-switch { background: var(--acc); }
.gs-toggle input:checked + .gs-switch::after { transform: translateX(16px); }
.gs-toggle input:focus-visible + .gs-switch { box-shadow: 0 0 0 3px var(--acs); }
.gs-toggle-text { font-size: 0.85rem; font-weight: 600; color: var(--tx); }
.gs-hint { font-size: 0.72rem; color: var(--tx2); margin-top: 6px; max-width: 520px; line-height: 1.4; }
</style>
