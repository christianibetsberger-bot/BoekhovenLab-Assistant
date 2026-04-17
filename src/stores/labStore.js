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
        { uuid: '202504221136', name: '96-Well Plate, 2.0mL, U-Bottom', format: 96 },
        { uuid: '202412091405', name: 'MicroAmp™ Fast Optical 96-Well 0.1 mL Re', format: 96 },
        { uuid: '202104140959', name: 'MicroAmp™ EnduraPlate™ 0.3 mL optical 96', format: 96 },
        { uuid: '202208051511', name: 'MicroAmp™ 0.3 mL optical 96-well semi-sk', format: 96 },
        { uuid: '201909201031', name: 'MicroAmp™ 0.2 mL Fast Optical 96-well se', format: 96 },
        { uuid: '201901101700', name: 'Greiner, 384-well PS F-bottom clear micr', format: 384 },
        { uuid: '202502101238', name: 'Eppendorf 384-Well 140uL V-Bottom Microp', format: 384 },
        { uuid: '4c72a888-6a9c-4977-b9f1-97ff89f6d726', name: 'Corning® 384-Well Clear Round Bottom Mic', format: 384 }
    ],
    
    reactions: [],
    cloudReactions: [],
    archivedReactions: [],
    matrices: [],
    archivedMatrices: [],
    reverseMatrices: [],
    archivedReverseMatrices: [],
    
    journal: {
        entries: [],
        activeId: null, 
        nextId: 1
    },

    nextInvId: 100, nextReactionId: 2, nextMatrixId: 2, nextBlockId: 100,
    nextRmId: 1, nextRmCompId: 100,
    
    wellPlates: [],
    archivedPlates: [],
    nextPlateId: 1,
    selectedWellInvRef: '',
    viewingItem: null
  }),
  
  actions: {
    // --- THE MASTER CLOUD LOADER ---
    async loadCloudInventory() {
      if (!this.user) return;

      // 1. Load Inventory
      const { data: invData } = await db.from('inventory').select('*');
      if (invData) this.inventory = invData.map(row => row.item_data);

      // 2. Load Reactions into the BACKGROUND library
      const { data: rxnData } = await db.from('reactions').select('*');
      if (rxnData) {
          this.cloudReactions = rxnData.map(row => row.data);
          // Auto-load personal drafts only if workspace is completely empty
          if (this.reactions.length === 0) {
              this.reactions = this.cloudReactions.filter(r => r.scope === 'Personal').map(r => JSON.parse(JSON.stringify(r)));
          }
      }

      // 3. Load Matrices
      const { data: matData } = await db.from('matrices').select('*');
      if (matData) this.matrices = matData.map(row => row.data);

      // 4. Load Screenings
      const { data: scrData } = await db.from('screenings').select('*');
      if (scrData) this.reverseMatrices = scrData.map(row => row.data);

      // 5. Load Plates
      const { data: pltData } = await db.from('plates').select('*');
      if (pltData) this.wellPlates = pltData.map(row => row.data);

      // 6. Load Journal Entries
      const { data: jrnData } = await db.from('journals').select('*');
      if (jrnData && jrnData.length > 0) {
          this.journal.entries = jrnData.map(row => row.data);
          this.journal.entries.sort((a, b) => new Date(b.date) - new Date(a.date));
          if (!this.journal.activeId) this.journal.activeId = this.journal.entries[0].id;
      }
    },

    // --- THE MASTER CLOUD SAVERS ---
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
        if (error) alert(`Error saving to ${tableName}: ` + error.message);
        
        // Refresh the background library so the browser modal is up to date!
        if (tableName === 'reactions') {
            const { data } = await db.from('reactions').select('*');
            if (data) this.cloudReactions = data.map(row => row.data);
        }
    },

    async deleteFromCloud(tableName, itemId) {
        if (!this.user) return;
        await db.from(tableName).delete().eq('data->>id', itemId.toString());
    },

    // --- UTILITIES ---
    formatNum(num) {
      if (num === null || num === undefined || isNaN(num)) return (0).toFixed(this.globalSettings.decimals);
      const factor = Math.pow(10, this.globalSettings.decimals);
      return (Math.round((Number(num) + Number.EPSILON) * factor) / factor).toFixed(this.globalSettings.decimals);
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
    }
  }
})