<script setup>
import { useLabStore } from '../stores/labStore'

const store = useLabStore()
</script>

<template>
  <div class="card">
    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between;">
      <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-sliders"></i> Global Settings & UI</h2>
      <div>
        <button class="secondary small" @click="store.toggleDarkMode()" title="Toggle Dark/Light Mode" style="margin-right: 8px;">
          <i class="fas" :class="store.isDarkMode ? 'fa-sun' : 'fa-moon'"></i>
        </button>
      </div>
    </div>
    
    <div class="grid-2">
      <div class="input-group">
        <label>Master Mix Reactions</label>
        <input type="number" v-model.number="store.globalSettings.mmReactions" step="any">
      </div>
      <div class="input-group">
        <label>Output Decimal Precision</label>
        <select v-model.number="store.globalSettings.decimals">
          <option value="1">1 Decimal (0.0)</option>
          <option value="2">2 Decimals (0.00)</option>
          <option value="3">3 Decimals (0.000)</option>
          <option value="4">4 Decimals (0.0000)</option>
        </select>
      </div>
    </div>
    
    <div class="grid-2">
      <div class="input-group">
        <label>Theme Color</label>
        <div style="display: flex; gap: 10px;">
          <input type="color" v-model="store.uiSettings.primaryColor" @input="store.updateThemeColors()" style="width: 40px; padding:0;">
          <input type="text" v-model="store.uiSettings.primaryColor" @input="store.updateThemeColors()" style="flex-grow: 1; font-family: monospace; font-size: 0.8rem;">
        </div>
      </div>
      <div class="input-group">
        <label>Border Style</label>
        <select v-model="store.uiSettings.borderRadius" @change="store.updateThemeColors()">
          <option value="0px">Sharp (0px)</option>
          <option value="2px">Flat (2px)</option>
          <option value="6px">Soft (6px)</option>
          <option value="12px">Rounded (12px)</option>
        </select>
      </div>
    </div>
  </div>
</template>