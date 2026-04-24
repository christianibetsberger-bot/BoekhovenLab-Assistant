import { defineStore } from 'pinia'
import { db } from '../services/supabase'

// Debounce timer for layout cloud saves (layout changes on every drag event)
let _layoutSaveTimer = null

export const useLabStore = defineStore('lab', {
  state: () => ({
    user: null,
    inventoryMode: 'Global',
    importTargetMode: 'Global',
    isDarkMode: false,
    uiSettings: { primaryColor: '#0E396E', borderRadius: '2px' },
    globalSettings: { mmReactions: 3.3, decimals: 3 },
    inventorySearch: '',
    archiveReactionSearch: '',
    rtfSearchQuery: '',
    wellRtfSearchQuery: '',
    journalRefSearchScope: 'Global',
    plateRefSearchScope: 'Global',
    selectedInvRef: '',
    activeDropdown: null,
    classOptions: ['DNA', 'RNA', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13+', 'Acid', 'Base', 'Dye', 'Chemical', 'Solvent', 'Enzyme', 'Buffer', 'Other'],
    
    // --- Calculators State ---
    stdCalc: { type: 'solid', mw: null, mass: null, massUnit: 0.001, density: null, vol: null, volUnit: 0.001, conc: null, concUnit: 0.000001, saveCode: '', saveCas: '', saveName: '', saveClass: 'Chemical' },
    dnaCalc: { a260: null, sequence: '', manualMw: null, saveCode: '', saveName: '', saveClass: 'DNA', type: 'DNA', pathLength: 0.05 },
    
    inventory: [],
    sourceLabwares: [
        { uuid: 'eda1c3ac-a089-4244-b0bc-9e5beb322475', name: '0.5 mL DNA LoBind microtube' },
        { uuid: '201812180800', name: '1.5 mL Fisherbrand Premium microtube' },
        { uuid: 'a4bf3318-6c09-4eb0-996d-d4959cd90bab', name: '2 mL Eppendorf Safe-Lock tube' },
        { uuid: '202307191430', name: '15 mL Centrifuge Tube, Conical' },
        { uuid: '201812181100', name: '50 mL Falcon conical centrifuge tube' },
        { uuid: '201812180900', name: '10 mL INTEGRA multichannel reservoir' },
        { uuid: '201907082250', name: '2 mL Waters LC/GC screw-top vial' },
        { uuid: '202204041502', name: 'Agilent screw-top vial w/ 0.3 mL' }
    ],
    targetLabwares: [
        { uuid: '201901101715', name: 'CELLSTAR® 24-well cell culture plate', format: 24 },
        { uuid: '201812181400', name: 'Greiner, 96-well PS F-bottom clear micro', format: 96 },
        { uuid: '202206200958', name: 'Porvair, 2 mL 96-deep well U-bottom plat #1', format: 96 },
        { uuid: '202504221135', name: 'Armadillo 96-Well PCR Plate, Skirted, Cl', format: 96 },
        { uuid: '201901101700', name: 'Greiner, 384-well PS F-bottom clear micr', format: 384 },
        { uuid: '4c72a888-6a9c-4977-b9f1-97ff89f6d726', name: 'Corning® 384-Well Clear Round Bottom Mic', format: 384 }
    ],
    
    reactions: [],
    cloudReactions: [],
    archivedReactions: [],
    
    matrices: [],
    cloudMatrices: [],
    archivedMatrices: [],
    
    reverseMatrices: [],
    cloudReverseMatrices: [],
    archivedReverseMatrices: [],
    
    wellPlates: [],
    cloudPlates: [],
    archivedPlates: [],

    journal: { entries: [], activeId: null, nextId: 1 },
    nextInvId: 100, nextReactionId: 2, nextMatrixId: 2, nextBlockId: 100,
    nextRmId: 1, nextRmCompId: 100,
    nextPlateId: 1,
    selectedWellInvRef: '',
    viewingItem: null
  }),
  
  actions: {
    // --- PERSISTENT WORKSPACE REGISTRY ---
    saveWorkspaceState() {
      // This saves a list of "Visible IDs" to the browser's storage
      const registry = {
        rxnIds: this.reactions.map(r => r.id),
        matIds: this.matrices.map(m => m.id),
        scrIds: this.reverseMatrices.map(s => s.id),
        pltIds: this.wellPlates.map(p => p.id)
      };
      localStorage.setItem('lab_workspace_registry', JSON.stringify(registry));
    },

    async loadCloudInventory() {
      if (!this.user) return;

      // Fetch the registry of what was open before the refresh
      const registryRaw = localStorage.getItem('lab_workspace_registry');
      const registry = registryRaw ? JSON.parse(registryRaw) : { rxnIds: [], matIds: [], scrIds: [], pltIds: [] };

      // 1. Load Inventory
      const { data: invData } = await db.from('inventory').select('*');
      if (invData) this.inventory = invData.map(row => row.item_data);

      // 2. Load Reactions
      const { data: rxnData } = await db.from('reactions').select('*');
      if (rxnData) {
          const allRxns = rxnData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudReactions = allRxns.filter(r => r.scope !== 'Archived');
          this.archivedReactions = allRxns.filter(r => r.scope === 'Archived');
          this.reactions = this.cloudReactions.filter(r => registry.rxnIds.includes(r.id)).map(r => JSON.parse(JSON.stringify(r)));
          const maxId = Math.max(0, ...allRxns.map(r => r.id));
          if (maxId >= this.nextReactionId) this.nextReactionId = maxId + 1;
      }

      // 3. Load Matrices
      const { data: matData } = await db.from('matrices').select('*');
      if (matData) {
          const allMats = matData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudMatrices = allMats.filter(m => m.scope !== 'Archived');
          this.archivedMatrices = allMats.filter(m => m.scope === 'Archived');
          this.matrices = this.cloudMatrices.filter(m => registry.matIds.includes(m.id)).map(m => JSON.parse(JSON.stringify(m)));
          const maxId = Math.max(0, ...allMats.map(m => m.id));
          if (maxId >= this.nextMatrixId) this.nextMatrixId = maxId + 1;
      }

      // 4. Load Screenings
      const { data: scrData } = await db.from('screenings').select('*');
      if (scrData) {
          const allScrs = scrData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudReverseMatrices = allScrs.filter(s => s.scope !== 'Archived');
          this.archivedReverseMatrices = allScrs.filter(s => s.scope === 'Archived');
          this.reverseMatrices = this.cloudReverseMatrices.filter(s => registry.scrIds.includes(s.id)).map(s => JSON.parse(JSON.stringify(s)));
          const maxId = Math.max(0, ...allScrs.map(s => s.id));
          if (maxId >= this.nextRmId) this.nextRmId = maxId + 1;
      }

      // 5. Load Plates
      const { data: pltData } = await db.from('plates').select('*');
      if (pltData) {
          const allPlts = pltData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudPlates = allPlts.filter(p => p.scope !== 'Archived');
          this.archivedPlates = allPlts.filter(p => p.scope === 'Archived');
          this.wellPlates = this.cloudPlates.filter(p => registry.pltIds.includes(p.id)).map(p => JSON.parse(JSON.stringify(p)));
          const maxId = Math.max(0, ...allPlts.map(p => p.id));
          if (maxId >= this.nextPlateId) this.nextPlateId = maxId + 1;
      }

      // Restore local workspace drafts — unsaved items and unsaved changes survive refresh
      const draftRaw = localStorage.getItem(`lab_local_drafts_${this.user.id}`);
      if (draftRaw) {
        try {
          const drafts = JSON.parse(draftRaw);
          // Sub-counters (block/component IDs) are not derivable from cloud, restore from draft
          if ((drafts.nextBlockId || 0) > this.nextBlockId) this.nextBlockId = drafts.nextBlockId;
          if ((drafts.nextRmCompId || 0) > this.nextRmCompId) this.nextRmCompId = drafts.nextRmCompId;
          // Prefer draft state for workspace — it has the latest local edits including unsaved blocks
          if (drafts.reactions?.length > 0) this.reactions = drafts.reactions;
          if (drafts.matrices?.length > 0) this.matrices = drafts.matrices;
          if (drafts.reverseMatrices?.length > 0) this.reverseMatrices = drafts.reverseMatrices;
          if (drafts.wellPlates?.length > 0) this.wellPlates = drafts.wellPlates;
        } catch (e) {
          // Corrupted draft — ignore and use cloud state
        }
      }
    },

    async saveItemToCloud(item) {
      if (!this.user) return;
      const payload = { owner_id: this.user.id, scope: item.scope || 'Global', item_data: item };
      await db.from('inventory').delete().eq('item_data->>id', item.id.toString());
      const { error } = await db.from('inventory').insert([payload]);
      if (error) alert("Error saving inventory: " + error.message);
    },

    async saveToCloud(tableName, payloadData) {
        if (!this.user) return;
        const payload = {
            owner_id: this.user.id,
            scope: payloadData.scope || 'Personal', 
            data: payloadData
        };
        await db.from(tableName).delete().eq('data->>id', payloadData.id.toString());
        const { error } = await db.from(tableName).insert([payload]);
        
        if (error) {
            alert(`Permission Denied: Only the creator can modify this protocol.`);
            return;
        }
        
        const { data } = await db.from(tableName).select('*');
        if (data) {
            const mapped = data.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
            if (tableName === 'reactions') { this.cloudReactions = mapped.filter(r => r.scope !== 'Archived'); this.archivedReactions = mapped.filter(r => r.scope === 'Archived'); }
            if (tableName === 'matrices') { this.cloudMatrices = mapped.filter(m => m.scope !== 'Archived'); this.archivedMatrices = mapped.filter(m => m.scope === 'Archived'); }
            if (tableName === 'screenings') { this.cloudReverseMatrices = mapped.filter(s => s.scope !== 'Archived'); this.archivedReverseMatrices = mapped.filter(s => s.scope === 'Archived'); }
            if (tableName === 'plates') { this.cloudPlates = mapped.filter(p => p.scope !== 'Archived'); this.archivedPlates = mapped.filter(p => p.scope === 'Archived'); }
        }

        // Ensure registry is updated after a save (especially for new items)
        this.saveWorkspaceState();
    },

    async deleteFromCloud(tableName, itemId) {
        if (!this.user) return;
        const { error } = await db.from(tableName).delete().eq('data->>id', itemId.toString());
        
        if (error) {
            alert("Permission Denied: You can only permanently delete your own protocols.");
            return;
        }
        
        const { data } = await db.from(tableName).select('*');
        if (data) {
            const mapped = data.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
            if (tableName === 'reactions') { this.cloudReactions = mapped.filter(r => r.scope !== 'Archived'); this.archivedReactions = mapped.filter(r => r.scope === 'Archived'); }
            if (tableName === 'matrices') { this.cloudMatrices = mapped.filter(m => m.scope !== 'Archived'); this.archivedMatrices = mapped.filter(m => m.scope === 'Archived'); }
            if (tableName === 'screenings') { this.cloudReverseMatrices = mapped.filter(s => s.scope !== 'Archived'); this.archivedReverseMatrices = mapped.filter(s => s.scope === 'Archived'); }
            if (tableName === 'plates') { this.cloudPlates = mapped.filter(p => p.scope !== 'Archived'); this.archivedPlates = mapped.filter(p => p.scope === 'Archived'); }
        }

        this.saveWorkspaceState();
    },

    formatNum(num) {
      if (num === null || num === undefined || isNaN(num)) return (0).toFixed(this.globalSettings.decimals);
      const factor = Math.pow(10, this.globalSettings.decimals);
      return (Math.round((Number(num) + Number.EPSILON) * factor) / factor).toFixed(this.globalSettings.decimals);
    },

    saveLocalDrafts() {
      if (!this.user?.id) return;
      // Journal entries are excluded — they are authoritative in Supabase
      // (auto-saved after 1 s) and must not be cached locally, since the
      // browser and PWA each have isolated localStorage.
      const drafts = {
        reactions: JSON.parse(JSON.stringify(this.reactions)),
        matrices: JSON.parse(JSON.stringify(this.matrices)),
        reverseMatrices: JSON.parse(JSON.stringify(this.reverseMatrices)),
        wellPlates: JSON.parse(JSON.stringify(this.wellPlates)),
        nextBlockId: this.nextBlockId,
        nextRmCompId: this.nextRmCompId
      };
      localStorage.setItem(`lab_local_drafts_${this.user.id}`, JSON.stringify(drafts));
    },

    getDefaultModuleLayout() {
      return {
        topOrder:        ['labJournal'],
        leftOrder:       ['globalSettings', 'standardStock', 'sequenceCalc', 'archiveManager', 'inventoryManager'],
        rightOrder:      ['reactionPlan', 'matrixPlanner', 'screeningPlanner', 'phasePredictor', 'wellPlateEditor'],
        minimized:       {},
        sidebarPosition: 'left',   // 'left' | 'right' | 'bottom'
        sidebarHidden:   {}        // id → true  (removed from sidebar but still in layout orders)
      };
    },

    saveModuleLayout(layout) {
      if (!this.user?.id) return;
      localStorage.setItem(`lab_module_layout_${this.user.id}`, JSON.stringify(layout));
    },

    loadModuleLayout() {
      if (!this.user?.id) return this.getDefaultModuleLayout();
      const raw = localStorage.getItem(`lab_module_layout_${this.user.id}`);
      if (!raw) return this.getDefaultModuleLayout();
      try {
        const saved = JSON.parse(raw);
        const def = this.getDefaultModuleLayout();
        // Track every id already placed anywhere in the saved layout.
        // This prevents dragged modules from being re-added to their original list.
        const allSaved = new Set([
          ...(saved.topOrder   || []),
          ...(saved.leftOrder  || []),
          ...(saved.rightOrder || [])
        ]);
        // Only append defaults for modules that don't appear in ANY saved list
        const mergeOrders = (s, d) => [...s, ...d.filter(id => !allSaved.has(id))];
        // Deduplicate within each list (cleans up any corrupted saved state)
        const seen = new Set();
        const dedup = list => list.filter(id => seen.has(id) ? false : (seen.add(id), true));
        return {
          topOrder:   dedup(mergeOrders(saved.topOrder   || [], def.topOrder)),
          leftOrder:  dedup(mergeOrders(saved.leftOrder  || [], def.leftOrder)),
          rightOrder: dedup(mergeOrders(saved.rightOrder || [], def.rightOrder)),
          minimized:       saved.minimized       || {},
          sidebarPosition: saved.sidebarPosition || 'left',
          sidebarHidden:   saved.sidebarHidden   || {}
        };
      } catch { return this.getDefaultModuleLayout(); }
    },

    // ── Cloud settings persistence ────────────────────────────────────────────

    async saveCloudSettings(what) {
      if (!this.user?.id) return;
      const row = { user_id: this.user.id, ...what };
      await db.from('user_settings').upsert(row, { onConflict: 'user_id' });
    },

    // Loads prefs + layout from Supabase and caches them in localStorage.
    // App.vue awaits this before calling loadModuleLayout() so both sources
    // see the same data regardless of whether the app runs as a browser tab
    // or a standalone PWA (which has isolated localStorage).
    async loadCloudSettings() {
      if (!this.user?.id) return;

      // Apply localStorage immediately so there's no flash of defaults
      // while the network round-trip completes.
      this.loadUserPreferences();

      const { data } = await db
        .from('user_settings')
        .select('prefs, layout')
        .eq('user_id', this.user.id)
        .maybeSingle();

      if (!data) return;   // new user — no cloud row yet, localStorage already applied

      if (data.prefs && Object.keys(data.prefs).length) {
        const p = data.prefs;
        if (p.isDarkMode     !== undefined) this.isDarkMode     = p.isDarkMode;
        if (p.uiSettings)                   this.uiSettings     = { ...this.uiSettings,     ...p.uiSettings };
        if (p.globalSettings)               this.globalSettings = { ...this.globalSettings, ...p.globalSettings };
        // Apply theme to DOM without re-triggering a cloud save
        this.applyThemeToDOM();
        // Keep localStorage in sync with cloud truth
        localStorage.setItem(`lab_user_prefs_${this.user.id}`, JSON.stringify(p));
      }

      if (data.layout && Object.keys(data.layout).length) {
        // Write cloud layout into localStorage so loadModuleLayout() picks it up
        localStorage.setItem(`lab_module_layout_${this.user.id}`, JSON.stringify(data.layout));
      }
    },

    // ── Preferences (theme color, dark mode, global calc settings) ───────────

    saveUserPreferences() {
      if (!this.user?.id) return;
      const prefs = {
        isDarkMode:     this.isDarkMode,
        uiSettings:     { ...this.uiSettings },
        globalSettings: { ...this.globalSettings },
      };
      localStorage.setItem(`lab_user_prefs_${this.user.id}`, JSON.stringify(prefs));
      this.saveCloudSettings({ prefs });
    },

    loadUserPreferences() {
      if (!this.user?.id) return;
      const raw = localStorage.getItem(`lab_user_prefs_${this.user.id}`);
      if (!raw) return;
      try {
        const prefs = JSON.parse(raw);
        if (prefs.isDarkMode     !== undefined) this.isDarkMode     = prefs.isDarkMode;
        if (prefs.uiSettings)                   this.uiSettings     = { ...this.uiSettings,     ...prefs.uiSettings };
        if (prefs.globalSettings)               this.globalSettings = { ...this.globalSettings, ...prefs.globalSettings };
      } catch { /* corrupted cache — ignore */ }
      this.applyThemeToDOM();
    },

    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
      this.updateThemeColors();
    },

    // Applies dark-mode classes and CSS variables to the DOM, then persists.
    updateThemeColors() {
      this.applyThemeToDOM();
      this.saveUserPreferences();
    },

    // DOM-only update — called during load so we don't trigger a redundant save.
    applyThemeToDOM() {
      const dark = this.isDarkMode;
      document.body.classList.toggle('dark-mode', dark);
      const wrapper = document.getElementById('body-wrapper');
      if (wrapper) wrapper.classList.toggle('dark-mode', dark);
      document.documentElement.style.setProperty('--primary', this.uiSettings.primaryColor);
      document.documentElement.style.setProperty('--radius',  this.uiSettings.borderRadius);
    },

    // ── Module layout ─────────────────────────────────────────────────────────

    saveModuleLayout(layout) {
      if (!this.user?.id) return;
      localStorage.setItem(`lab_module_layout_${this.user.id}`, JSON.stringify(layout));
      // Debounce the cloud write — layout changes on every drag event
      clearTimeout(_layoutSaveTimer);
      _layoutSaveTimer = setTimeout(() => this.saveCloudSettings({ layout }), 600);
    },
  }
})