<script setup>
// Collapsible usage-history tree for one inventory item (collapsed by default).
// Groups every recorded use by year → experiment, showing date, source, status
// and who ran it — so a stock stays fully traceable, including after the item is
// archived. Only finished experiments are logged (see utils/usageTracker.js).
import { ref, computed, watch, onMounted } from 'vue'
import { fetchUsageHistory } from '../utils/usageTracker'

const props = defineProps({
  itemId: { type: [String, Number], default: null },
  defaultOpen: { type: Boolean, default: false },   // archive rows open straight to the history
})

const open = ref(props.defaultOpen)
const loading = ref(false)
const loaded = ref(false)
const missing = ref(false)
const rows = ref([])
const openYears = ref({})

const SOURCE_META = {
  journal: { icon: 'fa-book', label: 'Journal' },
  matrix: { icon: 'fa-table-cells', label: 'Matrix' },
  reaction: { icon: 'fa-flask', label: 'Reaction' },
  screening: { icon: 'fa-magnifying-glass-chart', label: 'Screening' },
  plate: { icon: 'fa-border-all', label: 'Plate' },
  kinetics: { icon: 'fa-chart-line', label: 'Kinetics' },
}
const STATUS_META = {
  success: { label: 'Success', color: '#009E73' },
  failure: { label: 'Failure', color: '#D55E00' },
  repeat: { label: 'To be repeated', color: '#0072B2' },
}
const srcMeta = (t) => SOURCE_META[t] || { icon: 'fa-vial', label: t || 'Use' }
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString() }

// year -> uses (newest first)
const tree = computed(() => {
  const by = new Map()
  for (const r of rows.value) {
    const y = r.used_at ? String(new Date(r.used_at).getFullYear()) : 'Undated'
    if (!by.has(y)) by.set(y, [])
    by.get(y).push(r)
  }
  return [...by.entries()].sort((a, b) => (b[0] === 'Undated' ? -1 : a[0] === 'Undated' ? 1 : b[0].localeCompare(a[0])))
})

async function load() {
  if (!props.itemId) return
  loading.value = true
  const res = await fetchUsageHistory(props.itemId)
  rows.value = res.rows; missing.value = res.missing
  loading.value = false; loaded.value = true
  // newest year expanded by default, the rest collapsed (tree recomputes off rows)
  openYears.value = {}
  const first = tree.value[0]?.[0]
  if (first) openYears.value[first] = true
}
function toggle() {
  open.value = !open.value
  if (open.value && !loaded.value) load()
}
onMounted(() => { if (open.value) load() })
watch(() => props.itemId, () => {
  loaded.value = false; rows.value = []; open.value = props.defaultOpen
  if (open.value) load()
})
</script>

<template>
  <div class="uh">
    <button class="uh-head" @click="toggle">
      <i class="fas" :class="open ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
      <i class="fas fa-clock-rotate-left"></i>
      <span>Usage history</span>
      <span v-if="loaded && rows.length" class="uh-count">{{ rows.length }}</span>
    </button>

    <div v-if="open" class="uh-body">
      <div v-if="loading" class="uh-empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>
      <div v-else-if="missing" class="uh-empty">Run <code>supabase/inventory_usage.sql</code> to start tracking usage.</div>
      <div v-else-if="!rows.length" class="uh-empty">No recorded uses yet. A compound is logged when an experiment that references it is saved with a status other than “In progress”.</div>

      <div v-else class="uh-tree">
        <div v-for="[year, uses] in tree" :key="year" class="uh-year">
          <button class="uh-year-head" @click="openYears[year] = !openYears[year]">
            <i class="fas" :class="openYears[year] ? 'fa-caret-down' : 'fa-caret-right'"></i>
            <strong>{{ year }}</strong><span class="uh-count">{{ uses.length }}</span>
          </button>
          <ul v-if="openYears[year]" class="uh-list">
            <li v-for="u in uses" :key="u.id" class="uh-item">
              <i class="fas uh-ico" :class="srcMeta(u.source_type).icon" :title="srcMeta(u.source_type).label"></i>
              <div class="uh-main">
                <div class="uh-title">{{ u.source_label || srcMeta(u.source_type).label }}</div>
                <div class="uh-meta">
                  <span>{{ fmtDate(u.used_at) }}</span>
                  <span>· {{ srcMeta(u.source_type).label }}</span>
                  <span v-if="u.user_email">· {{ u.user_email }}</span>
                  <span v-if="STATUS_META[u.status]" :style="{ color: STATUS_META[u.status].color, fontWeight: 600 }">· {{ STATUS_META[u.status].label }}</span>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uh { margin-top: 14px; border: 1px solid var(--ln, #e2e8f0); border-radius: 10px; overflow: hidden; }
.uh-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: var(--fl, #f8fafc); border: none; box-shadow: none; color: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; text-align: left; }
.uh-count { margin-left: 6px; font-size: 0.7rem; font-weight: 700; background: var(--primary, #2563eb); color: #fff; border-radius: 999px; padding: 1px 7px; }
.uh-body { padding: 10px 12px; }
.uh-empty { font-size: 0.76rem; color: var(--tx2, #64748b); line-height: 1.5; }
.uh-year + .uh-year { margin-top: 6px; }
.uh-year-head { display: flex; align-items: center; gap: 6px; width: 100%; background: transparent; border: none; box-shadow: none; color: inherit; font-size: 0.78rem; padding: 4px 2px; cursor: pointer; text-align: left; }
.uh-list { list-style: none; margin: 2px 0 0; padding: 0 0 0 14px; border-left: 1px dashed var(--ln2, #cbd5e1); }
.uh-item { display: flex; gap: 9px; align-items: flex-start; padding: 6px 0 6px 8px; }
.uh-ico { margin-top: 2px; color: var(--primary, #2563eb); font-size: 0.78rem; width: 14px; text-align: center; }
.uh-main { min-width: 0; }
.uh-title { font-size: 0.79rem; font-weight: 600; word-break: break-word; }
.uh-meta { font-size: 0.7rem; color: var(--tx2, #64748b); display: flex; flex-wrap: wrap; gap: 4px; margin-top: 1px; }
</style>
