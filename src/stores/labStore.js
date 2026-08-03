import { defineStore } from 'pinia'
import { db } from '../services/supabase'
import { persistJournalEntry } from '../utils/journalPersist'
import { reconcileUsage, deleteUsageForSource, extractPlanRefs, PLAN_SOURCE_TYPES } from '../utils/usageTracker'

// Debounce timer for layout cloud saves (layout changes on every drag event)
let _layoutSaveTimer = null

export const useLabStore = defineStore('lab', {
  state: () => ({
    user: null,
    inventoryMode: 'Global',
    importTargetMode: 'Global',
    // Set from a scanned label deep link (?qr=CODE) before login/data load;
    // InventoryManager resolves it once inventoryLoaded flips true.
    pendingQrCode: null,
    inventoryLoaded: false,
    isDarkMode: false,
    // primaryColor = accent (Soft Glass --acc-user). radiusName = Sharp|Soft|Round.
    // borderRadius (legacy px) is retained only to migrate old saved prefs.
    // showAlpha: reveal alpha-stage modules (per user; off by default).
    uiSettings: { primaryColor: '#0E396E', radiusName: 'Soft', borderRadius: '14px', showAlpha: false },
    // Curated accent swatches offered in Settings (dark mode lightens each 38%).
    accentOptions: ['#0E396E', '#0065BD', '#00786B', '#5E5CE6'],
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
    stdCalc: { type: 'solid', mw: null, mass: null, massUnit: 0.001, density: null, vol: null, volUnit: 0.001, conc: null, concUnit: 0.000001, saveCode: '', saveCas: '', saveName: '', saveClass: 'Chemical', diluent: 'water', bufferItemId: '', bufferStockConc: null, bufferStockUnit: 'mM', bufferTargetConc: null, bufferTargetUnit: 'mM', pH: null, phAdjusted: false, naohConc: null, naohConcUnit: 'M', naohVol: null, naohVolUnit: 0.000001, hclConc: null, hclConcUnit: 'M', hclVol: null, hclVolUnit: 0.000001 },
    dnaCalc: { a260: null, sequence: '', manualMw: null, saveCode: '', saveName: '', saveClass: 'DNA', type: 'DNA', pathLength: 0.05 },
    
    inventory: [],
    profiles: [],   // lab user directory {email, display_name} — for sharing pickers
    archivedItemIds: [],   // inventory items in the archive — never shown in the live list
    // Predefined storage locations. Global ones are shared with everyone; Personal ones
    // are only visible to their creator. Each: { id, name, scope, owner_id }.
    locations: [],
    // Saved buffers for the Phase Predictor's Na⁺ media. Each: { id, name, naMM, pH }.
    // Personal to the user, persisted in prefs.
    buffers: [],
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

    cloudKinetics: [],
    archivedKinetics: [],

    journal: { entries: [], activeId: null, nextId: 1 },
    journalNeedsSync: 0,
    selectedWellInvRef: '',
    viewingItem: null,

    // Transient bottom-center toasts (redesign feedback pattern).
    toasts: [],
  }),

  actions: {
    // Push a bottom-center toast that auto-dismisses (~2.6 s).
    toast(message) {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message });
      setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 2600);
    },

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

      // 1. Load Inventory. Archived items must NEVER appear in the live inventory —
      // filter by the archive so a stale `inventory` row (e.g. a delete that failed
      // in another session) can't resurrect a compound that was archived.
      const { data: invData } = await db.from('inventory').select('*');
      let archivedIds = [];
      try {
        const { data: arch } = await db.from('inventory_archive').select('item_id');
        archivedIds = (arch || []).map(r => String(r.item_id));
      } catch { /* archive table may not exist yet */ }
      this.archivedItemIds = archivedIds;
      if (invData) {
        const gone = new Set(archivedIds);
        this.inventory = invData.map(row => row.item_data).filter(it => it && !gone.has(String(it.id)));
      }
      this.inventoryLoaded = true;

      // 2. Load Reactions
      const { data: rxnData } = await db.from('reactions').select('*');
      if (rxnData) {
          const allRxns = rxnData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudReactions = allRxns.filter(r => r.scope !== 'Archived');
          this.archivedReactions = allRxns.filter(r => r.scope === 'Archived');
          this.reactions = this.cloudReactions.filter(r => registry.rxnIds.includes(r.id)).map(r => JSON.parse(JSON.stringify(r)));
      }

      // 3. Load Matrices
      const { data: matData } = await db.from('matrices').select('*');
      if (matData) {
          const allMats = matData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudMatrices = allMats.filter(m => m.scope !== 'Archived');
          this.archivedMatrices = allMats.filter(m => m.scope === 'Archived');
          this.matrices = this.cloudMatrices.filter(m => registry.matIds.includes(m.id)).map(m => JSON.parse(JSON.stringify(m)));
      }

      // 4. Load Screenings
      const { data: scrData } = await db.from('screenings').select('*');
      if (scrData) {
          const allScrs = scrData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudReverseMatrices = allScrs.filter(s => s.scope !== 'Archived');
          this.archivedReverseMatrices = allScrs.filter(s => s.scope === 'Archived');
          this.reverseMatrices = this.cloudReverseMatrices.filter(s => registry.scrIds.includes(s.id)).map(s => JSON.parse(JSON.stringify(s)));
      }

      // 5. Load Plates
      const { data: pltData } = await db.from('plates').select('*');
      if (pltData) {
          const allPlts = pltData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudPlates = allPlts.filter(p => p.scope !== 'Archived');
          this.archivedPlates = allPlts.filter(p => p.scope === 'Archived');
          this.wellPlates = this.cloudPlates.filter(p => registry.pltIds.includes(p.id)).map(p => JSON.parse(JSON.stringify(p)));
      }

      // 6. Load Kinetics
      const { data: kinData } = await db.from('kinetics_data').select('*');
      if (kinData) {
          const allKin = kinData.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
          this.cloudKinetics = allKin.filter(k => k.scope !== 'Archived');
          this.archivedKinetics = allKin.filter(k => k.scope === 'Archived');
      }

      // 7. Load predefined storage locations (global + own personal)
      await this.loadCloudLocations();

      // Restore local workspace drafts — unsaved items and unsaved changes survive refresh
      const draftRaw = localStorage.getItem(`lab_local_drafts_${this.user.id}`);
      if (draftRaw) {
        try {
          const drafts = JSON.parse(draftRaw);
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
      // JSON round-trip strips the Vue reactive proxy so Supabase receives a
      // plain object snapshot with the current field values.
      const plain = JSON.parse(JSON.stringify(item));
      const payload = { item_id: String(plain.id), owner_id: this.user.id, scope: plain.scope || 'Global', item_data: plain };
      const { error } = await db.from('inventory').upsert(payload, { onConflict: 'item_id' });
      if (error) { alert("Error saving inventory: " + error.message); return false; }
      return true;
    },

    // Deleting never destroys: the item is moved to `inventory_archive` (full data
    // + who/when), so its usage history stays readable years later. `item` is the
    // full object when available; falls back to a DB fetch by id.
    // Archiving is a PRECONDITION for deletion: if the item cannot be safely
    // copied into inventory_archive we refuse to delete it, so "deleted" can
    // never mean "destroyed". Returns true only when the item is archived AND
    // removed from the active inventory.
    async deleteItemFromCloud(itemId, item = null) {
      if (!this.user) return false;
      const id = String(itemId);
      let plain = item ? JSON.parse(JSON.stringify(item)) : null;
      if (!plain) {
        const { data, error } = await db.from('inventory').select('item_data').eq('item_id', id).maybeSingle();
        if (error) { this.toast('Could not read the item — nothing deleted'); return false; }
        plain = data?.item_data || null;
      }
      if (!plain) { this.toast('Could not find the item to archive — nothing deleted'); return false; }

      const { error: archErr } = await db.from('inventory_archive').upsert({
        item_id: id, item_data: plain,
        owner_id: this.user.id, owner_email: this.user.email || '',
        scope: plain.scope || 'Global', deleted_by: this.user.email || '',
        deleted_at: new Date().toISOString(),
      }, { onConflict: 'item_id' });
      if (archErr) {
        this.toast(/relation|does not exist|schema cache/i.test(archErr.message || '')
          ? 'Item NOT deleted — run supabase/inventory_usage.sql to enable the archive'
          : 'Item NOT deleted — could not archive it: ' + archErr.message);
        return false;
      }

      const { error: delErr } = await db.from('inventory').delete().eq('item_id', id);
      if (delErr) {
        // Archived but still live — roll the archive copy back so the two stores agree.
        await db.from('inventory_archive').delete().eq('item_id', id);
        this.toast('Delete failed: ' + delErr.message);
        return false;
      }
      if (!this.archivedItemIds.includes(id)) this.archivedItemIds.push(id);
      return true;
    },

    // Bring an archived item back into the live inventory.
    async restoreArchivedItem(archRow) {
      if (!this.user || !archRow?.item_data) return false;
      const item = archRow.item_data;
      const ok = await this.saveItemToCloud(item);
      if (ok === false) { this.toast('Restore failed — the item stays in the archive'); return false; }
      await db.from('inventory_archive').delete().eq('item_id', String(archRow.item_id));
      this.archivedItemIds = this.archivedItemIds.filter(x => x !== String(archRow.item_id));
      if (!this.inventory.some(i => String(i.id) === String(item.id))) this.inventory.unshift(item);
      this.toast(`Restored "${item.name || item.code}"`);
      return true;
    },

    // --- STORAGE LOCATIONS ---
    // Locations the current user may pick: every Global one plus their own Personal ones.
    visibleLocations() {
      return this.locations
        .filter(l => (l.scope || 'Global') === 'Global' || l.owner_id === this.user?.id)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    async loadCloudLocations() {
      if (!this.user) return;
      const { data } = await db.from('locations').select('*');
      if (data) this.locations = data.map(row => { const o = row.item_data; o.owner_id = row.owner_id; return o; });
    },

    async saveLocationToCloud(loc) {
      if (!this.user) return false;
      const plain = JSON.parse(JSON.stringify(loc));
      const payload = { item_id: String(plain.id), owner_id: this.user.id, scope: plain.scope || 'Global', item_data: plain };
      const { error } = await db.from('locations').upsert(payload, { onConflict: 'item_id' });
      if (error) { alert('Error saving location: ' + error.message); return false; }
      return true;
    },

    async addLocation(name, scope = 'Global') {
      name = (name || '').trim();
      if (!name || !this.user) return;
      // Avoid duplicates among the locations this user can already see.
      if (this.visibleLocations().some(l => (l.name || '').toLowerCase() === name.toLowerCase())) return;
      const loc = { id: 'loc_' + crypto.randomUUID(), name, scope, owner_id: this.user.id };
      this.locations.push(loc);
      await this.saveLocationToCloud(loc);
    },

    async deleteLocation(id) {
      if (!this.user) return;
      const { error } = await db.from('locations').delete().eq('item_id', String(id));
      if (error) { alert('Permission denied: you can only delete your own locations.'); return; }
      this.locations = this.locations.filter(l => l.id !== id);
    },

    // When a stock is promoted to Global, its Personal location (if the user owns it) is
    // promoted to Global too, so the stock's location stays visible to everyone.
    async promoteLocationToGlobal(name) {
      if (!this.user || !name) return;
      const loc = this.locations.find(l =>
        l.name === name && (l.scope || 'Global') === 'Personal' && l.owner_id === this.user.id);
      if (loc) { loc.scope = 'Global'; await this.saveLocationToCloud(loc); }
    },

    async saveToCloud(tableName, payloadData) {
        if (!this.user) return;
        const payload = {
            item_id: String(payloadData.id),
            owner_id: this.user.id,
            scope: payloadData.scope || 'Personal',
            data: payloadData
        };
        const { error } = await db.from(tableName).upsert(payload, { onConflict: 'item_id' });
        
        if (error) {
            alert(`Permission Denied: Only the creator can modify this protocol.`);
            return false;
        }

        const { data } = await db.from(tableName).select('*');
        if (data) {
            const mapped = data.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
            if (tableName === 'reactions') { this.cloudReactions = mapped.filter(r => r.scope !== 'Archived'); this.archivedReactions = mapped.filter(r => r.scope === 'Archived'); }
            if (tableName === 'matrices') { this.cloudMatrices = mapped.filter(m => m.scope !== 'Archived'); this.archivedMatrices = mapped.filter(m => m.scope === 'Archived'); }
            if (tableName === 'screenings') { this.cloudReverseMatrices = mapped.filter(s => s.scope !== 'Archived'); this.archivedReverseMatrices = mapped.filter(s => s.scope === 'Archived'); }
            if (tableName === 'plates') { this.cloudPlates = mapped.filter(p => p.scope !== 'Archived'); this.archivedPlates = mapped.filter(p => p.scope === 'Archived'); }
            if (tableName === 'kinetics_data') { this.cloudKinetics = mapped.filter(k => k.scope !== 'Archived'); this.archivedKinetics = mapped.filter(k => k.scope === 'Archived'); }
        }

        // Ensure registry is updated after a save (especially for new items)
        this.saveWorkspaceState();

        // Usage traceability: a plan saved with a status other than 'in_progress'
        // logs its referenced compounds; reverting or removing them un-logs.
        // Fire-and-forget so saves stay snappy.
        this.reconcilePlanUsage(tableName, payloadData);
        return true;
    },

    async reconcilePlanUsage(tableName, plan) {
      const sourceType = PLAN_SOURCE_TYPES[tableName];
      if (!sourceType || !plan?.id) return;
      try {
        const plain = JSON.parse(JSON.stringify(plan));
        const { items, unresolved } = await extractPlanRefs(tableName, plain, this.inventory);
        await reconcileUsage({
          sourceType,
          sourceId: plain.id,
          sourceLabel: plain.name || sourceType,
          status: plain.status || 'in_progress',
          userEmail: this.user?.email || '',
          usedAt: null,
          items,
          unresolved,
        });
      } catch (e) { console.warn('plan usage reconcile skipped:', e?.message || e); }
    },

    async deleteFromCloud(tableName, itemId) {
        if (!this.user) return;
        const { error } = await db.from(tableName).delete().eq('item_id', String(itemId));

        if (error) {
            alert("Permission Denied: You can only permanently delete your own protocols.");
            return;
        }
        // The plan is gone — clear the usage rows it contributed.
        if (PLAN_SOURCE_TYPES[tableName]) deleteUsageForSource(PLAN_SOURCE_TYPES[tableName], itemId);

        const { data } = await db.from(tableName).select('*');
        if (data) {
            const mapped = data.map(row => { const obj = row.data; obj.owner_id = row.owner_id; return obj; });
            if (tableName === 'reactions') { this.cloudReactions = mapped.filter(r => r.scope !== 'Archived'); this.archivedReactions = mapped.filter(r => r.scope === 'Archived'); }
            if (tableName === 'matrices') { this.cloudMatrices = mapped.filter(m => m.scope !== 'Archived'); this.archivedMatrices = mapped.filter(m => m.scope === 'Archived'); }
            if (tableName === 'screenings') { this.cloudReverseMatrices = mapped.filter(s => s.scope !== 'Archived'); this.archivedReverseMatrices = mapped.filter(s => s.scope === 'Archived'); }
            if (tableName === 'plates') { this.cloudPlates = mapped.filter(p => p.scope !== 'Archived'); this.archivedPlates = mapped.filter(p => p.scope === 'Archived'); }
            if (tableName === 'kinetics_data') { this.cloudKinetics = mapped.filter(k => k.scope !== 'Archived'); this.archivedKinetics = mapped.filter(k => k.scope === 'Archived'); }
        }

        this.saveWorkspaceState();
    },

    appendToActiveJournal(html) {
      const entry = this.journal.entries.find(e => e.id === this.journal.activeId)
      if (!entry) return false
      entry.content = (entry.content || '') + html
      this.journalNeedsSync++
      // Persist right away. The Log buttons live in other modules, so LabJournal
      // (whose watcher normally saves) is unmounted — without this the append is
      // lost when LabJournal next mounts and re-fetches from Supabase.
      // Fire-and-forget so callers keep their synchronous boolean result.
      persistJournalEntry(entry, this.user?.email)
      return true
    },

    formatSeqTriplets(rawSeq) {
      if (!rawSeq) return ''
      const clean = String(rawSeq).replace(/\s+/g, '')
      // Preserve 5'/3' notation if present
      let prefix = '', suffix = '', inner = clean
      const fp = inner.match(/^5'-?/i)
      if (fp) { prefix = fp[0]; inner = inner.slice(prefix.length) }
      const sp = inner.match(/-?3'$/i)
      if (sp) { suffix = sp[0]; inner = inner.slice(0, inner.length - suffix.length) }
      // Walk character by character; modifications [X] count as one token, not toward triplet count
      let result = '', baseCount = 0, i = 0
      while (i < inner.length) {
        if (inner[i] === '[') {
          const end = inner.indexOf(']', i)
          if (end !== -1) { result += inner.substring(i, end + 1); i = end + 1; continue }
        }
        if (baseCount > 0 && baseCount % 3 === 0) result += ' '
        result += inner[i]; baseCount++; i++
      }
      return prefix + result + suffix
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
      };
      localStorage.setItem(`lab_local_drafts_${this.user.id}`, JSON.stringify(drafts));
    },

    getDefaultModuleLayout() {
      return {
        topOrder:        ['labJournal'],
        leftOrder:       ['globalSettings', 'standardStock', 'sequenceCalc', 'archiveManager', 'inventoryManager', 'timeTracker'],
        rightOrder:      ['reactionPlan', 'matrixPlanner', 'screeningPlanner', 'phasePredictor', 'lidaKinetics', 'dataFigures', 'wellPlateEditor'],
        minimized:       {},
        sidebarPosition: 'left',   // 'left' | 'right' | 'bottom'
        sidebarHidden:   {}        // id → true  (removed from sidebar but still in layout orders)
      };
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
        if (Array.isArray(p.buffers))       this.buffers        = p.buffers;
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

    // ── Lab user directory (populates the sharing pickers) ───────────────────
    // Each user upserts their own row on login; everyone can read the directory.
    // Degrades quietly if the `profiles` table hasn't been created yet.
    async syncProfile() {
      if (!this.user?.id) return;
      try {
        await db.from('profiles').upsert({
          id: this.user.id,
          email: (this.user.email || '').toLowerCase(),
          display_name: this.user.user_metadata?.full_name || this.user.user_metadata?.name || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (e) { /* table missing — ignore */ }
    },
    async loadProfiles() {
      try {
        const { data } = await db.from('profiles').select('email, display_name');
        if (Array.isArray(data)) this.profiles = data.filter(p => p.email);
      } catch (e) { /* table missing — leave empty */ }
    },

    // ── Preferences (theme color, dark mode, global calc settings) ───────────

    saveUserPreferences() {
      if (!this.user?.id) return;
      const prefs = {
        isDarkMode:     this.isDarkMode,
        uiSettings:     { ...this.uiSettings },
        globalSettings: { ...this.globalSettings },
        buffers:        [...this.buffers],
      };
      localStorage.setItem(`lab_user_prefs_${this.user.id}`, JSON.stringify(prefs));
      this.saveCloudSettings({ prefs });
    },

    // ── Phase Predictor buffer library (personal, stored in prefs) ───────────
    addBuffer(buf) {
      const b = { id: 'buf_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), name: (buf.name || '').trim(), naMM: Number(buf.naMM) || 0, pH: buf.pH == null ? 7.0 : Number(buf.pH) };
      this.buffers.push(b);
      this.saveUserPreferences();
      return b;
    },
    updateBuffer(id, patch) {
      const b = this.buffers.find(x => x.id === id);
      if (!b) return;
      if (patch.name != null) b.name = String(patch.name).trim();
      if (patch.naMM != null) b.naMM = Number(patch.naMM) || 0;
      if (patch.pH != null) b.pH = Number(patch.pH);
      this.saveUserPreferences();
    },
    removeBuffer(id) {
      this.buffers = this.buffers.filter(b => b.id !== id);
      this.saveUserPreferences();
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
        if (Array.isArray(prefs.buffers))       this.buffers        = prefs.buffers;
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

    // Sharp | Soft | Round — prefer the explicit name, else migrate an old px value.
    resolveRadiusName() {
      const n = this.uiSettings.radiusName;
      if (n === 'Sharp' || n === 'Soft' || n === 'Round') return n;
      const px = parseFloat(this.uiSettings.borderRadius);
      if (!isNaN(px)) {
        if (px <= 4) return 'Sharp';
        if (px >= 16) return 'Round';
        return 'Soft';
      }
      return 'Soft';
    },

    // DOM-only update — called during load so we don't trigger a redundant save.
    // Sets ONLY --acc-user and data-radius; the stylesheet derives --acc/--acs/
    // --acsh (with the dark 38% lift), the radius trio, and every legacy alias
    // (--primary, --radius, …). Setting --primary inline here would override the
    // dark-lifted accent, so we deliberately don't.
    applyThemeToDOM() {
      const dark = this.isDarkMode;
      const root = document.documentElement;
      // CRUCIAL: the legacy aliases (--surface: var(--cd), --text: var(--tx), …)
      // live on :root (<html>) and are resolved THERE. If the dark class is only
      // on <body>, those aliases resolve against <html>'s light tokens and inherit
      // light everywhere. Putting the dark class on <html> makes them resolve dark.
      root.classList.toggle('dark-mode', dark);
      document.body.classList.toggle('dark-mode', dark);
      const wrapper = document.getElementById('body-wrapper');
      if (wrapper) wrapper.classList.toggle('dark-mode', dark);
      root.style.setProperty('--acc-user', this.uiSettings.primaryColor);
      root.setAttribute('data-radius', this.resolveRadiusName());
      // Force native controls (select popups, spinners, date pickers, scrollbars)
      // to match the theme document-wide — otherwise they render light in dark mode.
      root.style.colorScheme = dark ? 'dark' : 'light';
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