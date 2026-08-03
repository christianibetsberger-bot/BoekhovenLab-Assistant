<script setup>
// The "Cloud Library" picker shared by the plan modules (reaction plans, matrices,
// screenings, well plates). Each of those had its own ~33-line copy of this modal,
// identical apart from the noun and which store array it listed.
//
// Lists lab-published plans and the user's own drafts, and emits the chosen one.
// Deleting is owner-only for shared plans (matching the RLS rule) but always
// allowed for your own drafts.
import { computed } from 'vue'
import { useLabStore } from '../stores/labStore'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: 'Library' },
  noun: { type: String, default: 'plans' },      // used in the empty states
  items: { type: Array, default: () => [] },     // the cloud array (e.g. store.cloudMatrices)
  table: { type: String, required: true },       // Supabase table, for delete
})
const emit = defineEmits(['close', 'open'])
const store = useLabStore()

const shared = computed(() => props.items.filter(i => i.scope === 'Global'))
const drafts = computed(() => props.items.filter(i => i.scope === 'Personal'))
const canDelete = (item) => item.owner_id === store.user?.id
</script>

<template>
  <div v-if="show" @click.self="emit('close')"
       style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000;">
    <div style="background: var(--surface); padding: 25px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div class="flex-between" style="border-bottom: 1px solid var(--ln); padding-bottom: 10px; margin-bottom: 15px;">
        <h3 style="margin: 0; color: var(--primary);"><i class="fas fa-cloud"></i> {{ title }}</h3>
        <button class="danger small" @click="emit('close')"><i class="fas fa-times"></i></button>
      </div>

      <h4 style="margin-bottom: 10px;"><span class="scope-badge lab" style="margin-right:6px;">Lab</span> Shared {{ noun }}</h4>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">
        <div v-for="it in shared" :key="'cl_g_' + it.id"
             style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
          <strong style="font-size: 1.05rem;">{{ it.name }}</strong>
          <div style="display: flex; gap: 5px;">
            <button class="small" @click="emit('open', it)"><i class="fas fa-download"></i> Open</button>
            <button v-if="canDelete(it)" class="danger small" @click="store.deleteFromCloud(table, it.id)"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div v-if="!shared.length" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No {{ noun }} published to the lab yet.</div>
      </div>

      <h4 style="margin-bottom: 10px;"><span class="scope-badge private" style="margin-right:6px;">Private</span> My drafts</h4>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div v-for="it in drafts" :key="'cl_p_' + it.id"
             style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
          <strong style="font-size: 1.05rem;">{{ it.name }}</strong>
          <div style="display: flex; gap: 5px;">
            <button class="small secondary" @click="emit('open', it)"><i class="fas fa-folder-open"></i> Open</button>
            <button class="danger small" @click="store.deleteFromCloud(table, it.id)"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div v-if="!drafts.length" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No personal drafts saved.</div>
      </div>
    </div>
  </div>
</template>
