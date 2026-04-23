import { defineStore } from 'pinia'
import { db } from '../services/supabase'

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
          this.cloudReactions = rxnData.map(row => {
              const obj = row.data;
              obj.owner_id = row.owner_id;
              return obj;
          });
          // Restore items only if their ID is in the registry
          this.reactions = this.cloudReactions.filter(r => registry.rxnIds.includes(r.id)).map(r => JSON.parse(JSON.stringify(r)));
          
          // Ensure counter is always higher than highest cloud ID
          const maxId = Math.max(0, ...this.cloudReactions.map(r => r.id));
          if (maxId >= this.nextReactionId) this.nextReactionId = maxId + 1;
      }

      // 3. Load Matrices
      const { data: matData } = await db.from('matrices').select('*');
      if (matData) {
          this.cloudMatrices = matData.map(row => {
              const obj = row.data;
              obj.owner_id = row.owner_id;
              return obj;
          });
          this.matrices = this.cloudMatrices.filter(m => registry.matIds.includes(m.id)).map(m => JSON.parse(JSON.stringify(m)));
          
          const maxId = Math.max(0, ...this.cloudMatrices.map(m => m.id));
          if (maxId >= this.nextMatrixId) this.nextMatrixId = maxId + 1;
      }

      // 4. Load Screenings
      const { data: scrData } = await db.from('screenings').select('*');
      if (scrData) {
          this.cloudReverseMatrices = scrData.map(row => {
              const obj = row.data;
              obj.owner_id = row.owner_id;
              return obj;
          });
          this.reverseMatrices = this.cloudReverseMatrices.filter(s => registry.scrIds.includes(s.id)).map(s => JSON.parse(JSON.stringify(s)));
          
          const maxId = Math.max(0, ...this.cloudReverseMatrices.map(s => s.id));
          if (maxId >= this.nextRmId) this.nextRmId = maxId + 1;
      }

      // 5. Load Plates
      const { data: pltData } = await db.from('plates').select('*');
      if (pltData) {
          this.cloudPlates = pltData.map(row => {
              const obj = row.data;
              obj.owner_id = row.owner_id;
              return obj;
          });
          this.wellPlates = this.cloudPlates.filter(p => registry.pltIds.includes(p.id)).map(p => JSON.parse(JSON.stringify(p)));
          
          const maxId = Math.max(0, ...this.cloudPlates.map(p => p.id));
          if (maxId >= this.nextPlateId) this.nextPlateId = maxId + 1;
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
            const mapped = data.map(row => {
                const obj = row.data;
                obj.owner_id = row.owner_id;
                return obj;
            });
            if (tableName === 'reactions') this.cloudReactions = mapped;
            if (tableName === 'matrices') this.cloudMatrices = mapped;
            if (tableName === 'screenings') this.cloudReverseMatrices = mapped;
            if (tableName === 'plates') this.cloudPlates = mapped;
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
            const mapped = data.map(row => {
                const obj = row.data;
                obj.owner_id = row.owner_id;
                return obj;
            });
            if (tableName === 'reactions') this.cloudReactions = mapped;
            if (tableName === 'matrices') this.cloudMatrices = mapped;
            if (tableName === 'screenings') this.cloudReverseMatrices = mapped;
            if (tableName === 'plates') this.cloudPlates = mapped;
        }
        
        this.saveWorkspaceState();
    },

    formatNum(num) {
      if (num === null || num === undefined || isNaN(num)) return (0).toFixed(this.globalSettings.decimals);
      const factor = Math.pow(10, this.globalSettings.decimals);
      return (Math.round((Number(num) + Number.EPSILON) * factor) / factor).toFixed(this.globalSettings.decimals);
    },

    saveUserPreferences() {
      if (!this.user?.id) return;
      const prefs = {
        isDarkMode: this.isDarkMode,
        uiSettings: { ...this.uiSettings }
      };
      localStorage.setItem(`lab_user_prefs_${this.user.id}`, JSON.stringify(prefs));
    },

    loadUserPreferences() {
      if (!this.user?.id) return;
      const raw = localStorage.getItem(`lab_user_prefs_${this.user.id}`);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.isDarkMode !== undefined) this.isDarkMode = prefs.isDarkMode;
      if (prefs.uiSettings) this.uiSettings = { ...this.uiSettings, ...prefs.uiSettings };
      this.updateThemeColors();
    },

    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
      this.updateThemeColors();
    },

    updateThemeColors() {
      const wrapper = document.getElementById('body-wrapper');
      if (wrapper) {
        if (this.isDarkMode) wrapper.classList.add('dark-mode');
        else wrapper.classList.remove('dark-mode');
      }
      document.documentElement.style.setProperty('--primary', this.uiSettings.primaryColor);
      document.documentElement.style.setProperty('--radius', this.uiSettings.borderRadius);
      this.saveUserPreferences();
    }
  }
})