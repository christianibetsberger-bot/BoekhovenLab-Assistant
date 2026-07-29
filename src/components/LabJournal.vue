<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase' // Using your Supabase client
import { esc, sanitize } from '../utils/htmlSafe'
import { persistJournalEntry, isBlankJournalContent } from '../utils/journalPersist'
import { createVersion, listVersions, signCurrent, JournalVersionsTableMissing } from '../utils/journalVersions'
import { diffLines } from '../utils/textDiff'
import * as XLSX from 'xlsx'
import html2pdf from 'html2pdf.js'
import Protocols from './Protocols.vue'
import { molDescriptors } from '../utils/rdkit'
import { buildEln, parseEln } from '../utils/eln'
// React + Ketcher are heavy — load them only when the editor is opened.
const KetcherField = defineAsyncComponent(() => import('./KetcherField.vue'))

const store = useLabStore()
const journalEditor = ref(null)

// Journal ↔ Protocols submodule
const journalView = ref('journal') // 'journal' | 'protocols'
const openProtocolId = ref('')
function openLinkedProtocol(id) { openProtocolId.value = id; journalView.value = 'protocols' }

// --- Computed Properties ---
const activeJournalEntry = computed(() => store.journal.entries.find(e => e.id === store.journal.activeId))
const sortedJournalEntries = computed(() => [...store.journal.entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

// Entry search — matches Exp ID, date, category or the entry's text content,
// with optional status/category filters.
const journalSearch = ref('')
const statusFilter = ref('')    // '' = all
const categoryFilter = ref('')  // '' = all
function _plainText(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').toLowerCase() }
const filteredJournalEntries = computed(() => {
  const q = journalSearch.value.trim().toLowerCase()
  return sortedJournalEntries.value.filter(e => {
    if (statusFilter.value && (e.status || 'in_progress') !== statusFilter.value) return false
    if (categoryFilter.value && (e.category || '') !== categoryFilter.value) return false
    if (!q) return true
    return (e.expId || '').toLowerCase().includes(q) ||
      (e.date || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      _plainText(e.content).includes(q)
  })
})

function unlinkProtocol(id) {
    if (!activeJournalEntry.value) return
    activeJournalEntry.value.linkedProtocols = (activeJournalEntry.value.linkedProtocols || []).filter(x => x.id !== id)
    store.journalNeedsSync++
}

// --- Auto-Save Logic (Debounced to prevent spamming DB) ---
let saveTimeout;
let lastLocalEditAt = 0;   // used to avoid clobbering while co-editing
// Persistence lives in ../utils/journalPersist so the store's cross-module "Log
// to Journal" writes use the exact same row shape as this component's autosave.
const persistEntry = (e) => persistJournalEntry(e, store.user?.email)
const saveToDb = () => {
    clearTimeout(saveTimeout)
    const e = activeJournalEntry.value
    saveTimeout = setTimeout(() => persistEntry(e), 1000) // Saves 1 second after you stop typing
}
// Persist any pending debounced edit right now — on module switch or tab close —
// so the last second of typing isn't dropped.
const flushPendingSave = () => {
    clearTimeout(saveTimeout)
    const e = activeJournalEntry.value
    if (e) persistEntry(e)
}

// ═══ ELN: version history + Part 11-style electronic signatures ═════════════
const showHistory = ref(false)
const versions = ref([])
const versionsBusy = ref(false)
const versionsErr = ref('')          // '' | 'setup' | error message
const previewVersion = ref(null)     // a past version shown read-only
const diffView = ref(null)           // { version, ops } — a version compared to now
const historyFilter = ref('all')     // 'all' | 'signed' — timeline filter
const shownVersions = computed(() => historyFilter.value === 'signed' ? versions.value.filter(v => v.signed) : versions.value)
const signedCount = computed(() => versions.value.filter(v => v.signed).length)
const signDialog = ref(null)         // { meaning, password, msg, busy }
const entrySignature = ref(null)     // latest signature on the active entry (header badge)
let elnUnavailable = false           // set once if the journal_versions table is absent

const fmtStamp = (x) => x ? new Date(x).toLocaleString() : ''

// True only while the current content still matches the signed snapshot — once you
// edit after signing, the signature no longer covers what's on screen.
const signatureIsCurrent = computed(() =>
    entrySignature.value ? (activeJournalEntry.value?.content || '') === (entrySignature.value.content || '') : false)
// There are edits not yet captured as a version (drives the "current draft" row).
const hasUnsavedDraft = computed(() => {
    if (!showHistory.value || !activeJournalEntry.value) return false
    const latest = versions.value[0]
    const cur = activeJournalEntry.value.content || ''
    return latest ? latest.content !== cur : !isBlankJournalContent(cur)
})

// Snapshot the entry's current content (skips when unchanged). Best-effort — never
// blocks editing; only flips the "not set up" flag if the table is missing.
async function captureVersion(entry, summary = '') {
    if (!entry || elnUnavailable) return
    try { await createVersion(entry, store.user, { changeSummary: summary }) }
    catch (e) { if (e instanceof JournalVersionsTableMissing) elnUnavailable = true }
}
async function refreshSignatureBadge() {
    entrySignature.value = null
    const e = activeJournalEntry.value
    if (!e || elnUnavailable) return
    try {
        const { data, error } = await db.from('journal_versions')
            .select('version_no, signed_by_email, signed_at, signature_meaning, content, content_hash')
            .eq('entry_id', e.id).eq('signed', true)
            .order('version_no', { ascending: false }).limit(1).maybeSingle()
        if (error) { if (/journal_versions|does not exist|schema cache|42P01/i.test(error.message || '')) elnUnavailable = true; return }
        entrySignature.value = data || null
    } catch { /* ignore */ }
}
async function loadVersions() {
    const e = activeJournalEntry.value
    if (!e) return
    versionsBusy.value = true; versionsErr.value = ''
    try { versions.value = await listVersions(e.id) }
    catch (err) { versionsErr.value = err instanceof JournalVersionsTableMissing ? 'setup' : (err.message || String(err)) }
    finally { versionsBusy.value = false }
}
async function openHistory() {
    // Opening history is a read — it must not create a version. Any unsaved edits
    // show up as the "current draft" row instead, savable on demand.
    previewVersion.value = null; diffView.value = null; showHistory.value = true
    await loadVersions()
}
function closeHistory() { showHistory.value = false; previewVersion.value = null; diffView.value = null }
function viewVersion(v) { previewVersion.value = v; diffView.value = null }
// Preview the live, not-yet-saved content as a pseudo "draft" version.
function viewDraft() {
    previewVersion.value = { __draft: true, version_no: 'draft', content: activeJournalEntry.value?.content || '' }
    diffView.value = null
}
// Explicit checkpoint (dedups on no-change). This is the deliberate way to record
// a version; auto-checkpoints only happen when you finish/leave an entry.
async function saveVersionNow() {
    if (!activeJournalEntry.value) return
    const note = (prompt('Optional label for this version (e.g. “before adding NMR”):', '') || '').trim()
    try {
        const res = await createVersion(activeJournalEntry.value, store.user, { changeSummary: note || 'Manual checkpoint' })
        if (res.skipped) { store.toast('No changes since the last version'); return }
        if (res.error) { store.toast('Could not save version'); return }
        previewVersion.value = null
        await loadVersions()
        store.toast('Version saved')
    } catch (e) {
        if (e instanceof JournalVersionsTableMissing) { elnUnavailable = true; versionsErr.value = 'setup' }
    }
}
function compareToNow(v) { diffView.value = { version: v, ops: diffLines(v.content, activeJournalEntry.value?.content || '') }; previewVersion.value = null }
async function restoreVersion(v) {
    if (!confirm(`Restore version ${v.version_no}? It becomes the current content as a NEW version — no history is deleted.`)) return
    activeJournalEntry.value.content = v.content
    lastLocalEditAt = Date.now()
    syncEditor()
    await persistEntry(activeJournalEntry.value)
    await captureVersion(activeJournalEntry.value, `Restored v${v.version_no}`)
    await loadVersions()
    store.toast(`Restored version ${v.version_no}`)
}
function openSign() { signDialog.value = { meaning: '', password: '', msg: '', busy: false } }
function closeSign() { signDialog.value = null }
async function doSign() {
    const d = signDialog.value
    if (!d.meaning.trim()) { d.msg = 'State the meaning of your signature.'; return }
    if (!d.password) { d.msg = 'Enter your password.'; return }
    d.busy = true; d.msg = 'Signing…'
    const res = await signCurrent(activeJournalEntry.value, store.user, { password: d.password, meaning: d.meaning })
    d.busy = false
    if (res.error) { d.msg = res.error; return }
    signDialog.value = null
    store.toast('Entry signed')
    await refreshSignatureBadge()
    if (showHistory.value) await loadVersions()
}

// When you switch entries, snapshot the one you're leaving (if it changed) and
// refresh the signature badge for the one you land on.
watch(() => store.journal.activeId, (newId, oldId) => {
    if (oldId && oldId !== newId) {
        const prev = store.journal.entries.find(e => e.id === oldId)
        if (prev) captureVersion(prev, 'Auto-checkpoint')
    }
    refreshSignatureBadge()
})

// Map a `journals` row into the in-memory entry shape (shared by fetch + realtime).
function mapRow(row) {
    return {
        id: row.id,
        expId: row.data?.expId || 'Untitled',
        date: row.data?.date || '',
        content: row.data?.content || '',
        linkedProtocols: row.data?.linkedProtocols || [],
        status: row.data?.status || 'in_progress',
        category: row.data?.category || '',
        scope: row.scope || 'Personal',
        sharedWith: row.shared_with || [],
        owner_id: row.owner_id,
        owner_email: row.data?.ownerEmail || '',
        created_at: row.created_at,
    }
}
function isVisibleRow(row) {
    return row.owner_id === store.user?.id || row.scope === 'Lab' || (row.shared_with || []).includes(store.user?.email)
}

// Watchers for Title and Date changes
const updateHeaderAndSave = () => {
    saveToDb();
}

// --- Methods ---
const formatDoc = (cmd, value = null) => {
    if (journalEditor.value) journalEditor.value.focus();
    document.execCommand(cmd, false, value);
    updateRtfContent();
}

const updateRtfContent = () => {
    if (activeJournalEntry.value && journalEditor.value) {
        activeJournalEntry.value.content = sanitize(journalEditor.value.innerHTML);
        lastLocalEditAt = Date.now();
        saveToDb(); // Trigger auto-save
    }
}

const syncEditor = () => {
    if (journalEditor.value && activeJournalEntry.value) {
        journalEditor.value.innerHTML = sanitize(activeJournalEntry.value.content || '');
    }
}

watch(() => store.journalNeedsSync, () => {
    nextTick(() => syncEditor())
    saveToDb()
})

// ═══ Experiment status labels ═══════════════════════════════════════════════
const STATUSES = [
    { id: 'in_progress', label: 'In progress', icon: 'fa-spinner', color: '#C77700' },
    { id: 'success', label: 'Success', icon: 'fa-circle-check', color: '#009E73' },
    { id: 'failure', label: 'Failure', icon: 'fa-circle-xmark', color: '#D55E00' },
    { id: 'repeat', label: 'To be repeated', icon: 'fa-rotate-right', color: '#0072B2' },
]
const statusMeta = (id) => STATUSES.find(s => s.id === id) || STATUSES[0]
const statusMenuId = ref(null)
function setStatus(entry, id) { if (!entry) return; entry.status = id; statusMenuId.value = null; persistEntry(entry) }

// ═══ Lab-wide categories ════════════════════════════════════════════════════
const categories = ref([])
async function loadCategories() {
    try { const { data } = await db.from('journal_categories').select('*').order('name'); if (data) categories.value = data }
    catch { /* table may not exist yet */ }
}
async function addCategory() {
    const name = (prompt('New lab-wide category name:') || '').trim()
    if (!name) return ''
    if (categories.value.some(c => (c.name || '').toLowerCase() === name.toLowerCase())) { store.toast('Category already exists'); return name }
    const { data, error } = await db.from('journal_categories').insert({ name, owner_id: store.user?.id }).select()
    if (error) { store.toast('Could not add category — ' + error.message); return '' }
    if (data?.[0]) categories.value.push(data[0])
    return name
}
async function addCategoryAndAssign(entry) {
    const name = await addCategory()
    if (name && entry) { entry.category = name; persistEntry(entry) }
}

// ═══ Sharing with specific users ════════════════════════════════════════════
const isEntryOwner = (e) => !e?.owner_id || e.owner_id === store.user?.id
const shareDialog = ref(null)   // { entry, scope, sharedWith:[], input:'' }
const knownJournalEmails = computed(() => [...new Set(
    store.journal.entries.flatMap(e => [e.owner_email, ...(e.sharedWith || [])]).filter(Boolean)
)].sort())
function openShare(entry) {
    shareDialog.value = { entry, scope: entry.scope || 'Personal', sharedWith: [...(entry.sharedWith || [])], input: '' }
}
function addShareEmail() {
    const e = (shareDialog.value.input || '').trim().toLowerCase()
    if (e && e !== store.user?.email && !shareDialog.value.sharedWith.includes(e)) shareDialog.value.sharedWith.push(e)
    shareDialog.value.input = ''
}
function removeShareEmail(em) { shareDialog.value.sharedWith = shareDialog.value.sharedWith.filter(x => x !== em) }
async function saveShare() {
    const d = shareDialog.value, entry = d.entry
    entry.scope = d.scope
    entry.sharedWith = d.scope === 'Lab' ? [] : d.sharedWith
    await persistEntry(entry)
    shareDialog.value = null
    store.toast('Sharing updated')
}
function shareSummary(e) {
    if (e.scope === 'Lab') return 'Lab-wide'
    if ((e.sharedWith || []).length) return `Shared · ${e.sharedWith.length}`
    return 'Private'
}

// ═══ Live collaboration (Supabase Realtime) ═════════════════════════════════
let realtimeChannel = null
const coEditNotice = ref(null)   // { id, by } — someone else edited the entry you have open
function subscribeRealtime() {
    try {
        realtimeChannel = db.channel('journals-collab')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'journals' }, onRemoteJournalChange)
            .subscribe()
    } catch { /* realtime not enabled */ }
}
function onRemoteJournalChange(payload) {
    const eventType = payload.eventType || payload.type
    if (eventType === 'DELETE') {
        const id = payload.old?.id
        store.journal.entries = store.journal.entries.filter(e => e.id !== id)
        return
    }
    const row = payload.new
    if (!row || !isVisibleRow(row)) return
    const mapped = mapRow(row)
    const idx = store.journal.entries.findIndex(e => e.id === row.id)
    if (idx === -1) { store.journal.entries.unshift(mapped); return }
    const local = store.journal.entries[idx]
    const remoteEditor = row.data?.lastEditor
    const iAmEditing = store.journal.activeId === row.id && (Date.now() - lastLocalEditAt) < 4000

    // Take the metadata columns from a remote row without touching the editor body.
    const syncMetaOnly = () => {
        local.status = mapped.status; local.category = mapped.category
        local.scope = mapped.scope; local.sharedWith = mapped.sharedWith
    }

    // If I'm actively editing this entry, my editor holds the freshest content — never
    // let a realtime row replace it, whether it's a co-editor's write or my own save
    // echoing back (the latter used to revert the last keystrokes). Banner only when
    // the writer is someone else.
    if (iAmEditing) {
        if (remoteEditor && remoteEditor !== store.user?.email) coEditNotice.value = { id: row.id, by: remoteEditor }
        syncMetaOnly()
        return
    }

    // Don't let a blank remote row wipe content we still hold (e.g. a stale tab that
    // saved empty). Keep our body; take the rest.
    if (isBlankJournalContent(mapped.content) && !isBlankJournalContent(local.content)) {
        syncMetaOnly()
        return
    }

    Object.assign(local, mapped)
    if (store.journal.activeId === row.id) nextTick(() => syncEditor())
}
function reloadCoEdited() {
    coEditNotice.value = null
    nextTick(() => syncEditor())
}
onUnmounted(() => {
    captureVersion(activeJournalEntry.value, 'Auto-checkpoint')
    flushPendingSave()
    window.removeEventListener('beforeunload', flushPendingSave)
    if (realtimeChannel) { try { db.removeChannel(realtimeChannel) } catch { /* noop */ } }
})

// ═══ Chemical structure drawing (Ketcher) + RDKit descriptors ═══════════════
const showKetcher = ref(false)
let ketcherInstance = null            // the live Ketcher API, from the ready event
const ketcherReady = ref(false)
const ketcherBusy = ref(false)
const ketcherEditKet = ref('')        // preload when re-editing an existing drawing
const molName = ref('')
const molIncludeStoich = ref(false)
const molInfo = ref({ smiles: '', ket: '', formula: '', mw: null, isReaction: false, count: 0 })
const molComponents = ref([])         // reaction/mixture components: [{ role, smiles, formula, mw, amount }]
let savedRange = null
let editingStructEl = null            // the .chem-struct being edited, if any

// Split a Ketcher SMILES into components with roles. Reaction SMILES uses
// reactants>agents>products; a plain multi-fragment SMILES is dot-separated.
function splitComponents(smiles) {
    const s = (smiles || '').trim()
    if (!s) return { list: [], isReaction: false }
    const frag = (str) => (str ? str.split('.').map(x => x.trim()).filter(Boolean) : [])
    if (s.includes('>')) {
        const [r, a, p] = s.split('>')
        return {
            isReaction: true,
            list: [
                ...frag(r).map(x => ({ role: 'Reactant', smiles: x })),
                ...frag(a).map(x => ({ role: 'Reagent', smiles: x })),
                ...frag(p).map(x => ({ role: 'Product', smiles: x })),
            ],
        }
    }
    const list = frag(s)
    return { isReaction: false, list: list.map(x => ({ role: list.length > 1 ? 'Component' : 'Compound', smiles: x })) }
}

// mg / (g·mol⁻¹) = mmol; equivalents are relative to the smallest mmol present.
const stoichRows = computed(() => {
    const rows = molComponents.value.map(c => {
        const amt = Number(c.amount)
        const mmol = (c.mw && amt) ? amt / c.mw : null
        return { role: c.role, smiles: c.smiles, formula: c.formula, mw: c.mw, amount: c.amount, mmol }
    })
    const mmols = rows.map(r => r.mmol).filter(v => v != null && v > 0)
    const base = mmols.length ? Math.min(...mmols) : null
    return rows.map(r => ({ ...r, equiv: (r.mmol != null && base) ? r.mmol / base : null }))
})

function openKetcher(initialKet = '', structEl = null) {
    const sel = window.getSelection()
    savedRange = (sel && sel.rangeCount && journalEditor.value?.contains(sel.anchorNode))
        ? sel.getRangeAt(0).cloneRange() : null
    editingStructEl = structEl
    ketcherEditKet.value = initialKet || ''
    molName.value = ''; molIncludeStoich.value = false; molComponents.value = []
    molInfo.value = { smiles: '', ket: initialKet || '', formula: '', mw: null, isReaction: false, count: 0 }
    ketcherReady.value = false
    showKetcher.value = true
}
function onKetcherReady(k) { ketcherInstance = k; ketcherReady.value = true; readStructure() }
watch(showKetcher, (open) => { if (!open) { ketcherInstance = null; editingStructEl = null } })

const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob)
})

// Pull the current drawing out of Ketcher and compute per-component formula +
// MW via RDKit (works for a single molecule, a mixture, or a reaction scheme).
async function readStructure() {
    const k = ketcherInstance
    if (!k) return
    ketcherBusy.value = true
    try {
        const ket = await k.getKet()
        let smiles = ''; try { smiles = await k.getSmiles() } catch { /* empty canvas */ }
        const { list, isReaction } = splitComponents(smiles)
        for (const c of list) {
            const d = await molDescriptors(c.smiles)
            c.formula = d?.formula || ''
            c.mw = d?.mw ?? null
            c.amount = null
        }
        molComponents.value = list
        const single = list.length === 1 ? list[0] : null
        molInfo.value = { smiles, ket, formula: single?.formula || '', mw: single?.mw ?? null, isReaction, count: list.length }
    } catch { /* ignore */ } finally { ketcherBusy.value = false }
}

async function structurePng(k, ket) {
    try { const blob = await k.generateImage(ket, { outputFormat: 'png', backgroundColor: 'FFFFFF' }); return await blobToDataURL(blob) }
    catch { /* fall back to SVG */ }
    try {
        const svg = await k.generateImage(ket, { outputFormat: 'svg' })
        const txt = typeof svg.text === 'function' ? await svg.text() : String(svg)
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt)
    } catch { return '' }
}

// The drawing is embedded as a self-contained block: PNG for display/export,
// the full KET in data-ket for re-editing, a caption, and (optionally) a
// per-component stoichiometry table driven by the RDKit descriptors.
function buildStructHtml({ png, ket, smiles }) {
    const encKet = encodeURIComponent(ket || '')
    const info = molInfo.value
    const capBits = []
    if (molName.value.trim()) capBits.push(esc(molName.value.trim()))
    if (info.count === 1 && info.formula) capBits.push(`<b>${esc(info.formula)}</b>`)
    if (info.count === 1 && info.mw != null) capBits.push(`${esc((+info.mw).toFixed(2))} g/mol`)
    if (info.count > 1) capBits.push(esc(info.isReaction ? 'Reaction scheme' : info.count + ' components'))
    const cap = capBits.length ? `<div class="chem-cap" style="font-size:.72rem;color:#556;margin-top:2px;">${capBits.join(' · ')}</div>` : ''
    let stoich = ''
    if (molIncludeStoich.value && stoichRows.value.length) {
        const th = (h) => `<th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">${h}</th>`
        const td = (v) => `<td style="padding:3px 8px;border:1px solid var(--border);">${v}</td>`
        const showRole = stoichRows.value.some(r => r.role !== 'Compound')
        const cols = (showRole ? ['Role'] : []).concat(['Compound', 'Formula', 'MW (g/mol)', 'Amount', 'mmol', 'equiv'])
        let body = ''
        for (const r of stoichRows.value) {
            body += '<tr>' +
                (showRole ? td(esc(r.role)) : '') +
                td('') +   // compound name — left blank for the user to fill in
                td(esc(r.formula || '—')) +
                td(r.mw != null ? esc((+r.mw).toFixed(2)) : '—') +
                td(r.amount != null && r.amount !== '' ? esc(r.amount + ' mg') : '—') +
                td(r.mmol != null ? esc(r.mmol.toFixed(3)) : '—') +
                td(r.equiv != null ? esc(r.equiv.toFixed(2)) : '—') +
                '</tr>'
        }
        stoich = `<table style="border-collapse:collapse;font-size:.78rem;margin:6px 0 0;"><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>${body}</tbody></table>`
    }
    return `<div class="chem-struct" contenteditable="false" data-ket="${encKet}" data-smiles="${esc(smiles || '')}" style="display:inline-block;vertical-align:top;margin:6px 8px 6px 0;padding:6px;border:1px solid var(--border);border-radius:8px;background:#fff;">` +
        `<img src="${png}" alt="${esc(smiles || 'structure')}" style="max-width:360px;max-height:240px;display:block;cursor:pointer;">` +
        cap + stoich + `</div>&nbsp;`
}

async function insertStructure() {
    const k = ketcherInstance
    if (!k) return
    ketcherBusy.value = true
    try {
        await readStructure()
        const { ket, smiles } = molInfo.value
        if (!smiles || !smiles.trim()) { alert('Draw a structure first.'); return }
        const png = await structurePng(k, ket)
        const html = buildStructHtml({ png, ket, smiles })
        if (editingStructEl) {
            editingStructEl.outerHTML = html
            updateRtfContent()
        } else {
            journalEditor.value?.focus()
            if (savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange) }
            document.execCommand('insertHTML', false, html)
            updateRtfContent()
        }
        showKetcher.value = false
    } finally { ketcherBusy.value = false }
}

const addJournalEntry = async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        alert("Authentication error: Please log in to save entries.");
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newExpId = 'EXP-' + String(store.journal.entries.length + 1).padStart(3, '0');

    // Insert into your specific 'journals' table structure
    const { data, error } = await db.from('journals').insert([{
        owner_id: user.id,
        scope: 'Personal', // journal entries are private by default
        data: {
            expId: newExpId,
            date: today,
            content: '',
            linkedProtocols: [],
            status: 'in_progress',
            category: '',
            ownerEmail: user.email || '',
        }
    }]).select();

    if (!error && data && data[0]) {
        store.journal.entries.unshift(mapRow(data[0]));
        store.journal.activeId = data[0].id;
        nextTick(() => syncEditor());
    } else {
        console.error("Error creating entry:", error);
    }
}

const deleteJournalEntry = async (id) => {
    if(confirm("Are you sure you want to delete this journal entry?")) {
        // Cancel any pending saves so they don't block the delete
        clearTimeout(saveTimeout); 
        
        // If the ID is a string, it's a Supabase UUID. If not, it's old local storage data.
        if (typeof id === 'string') {
            // Delete from Supabase AND return the deleted row to confirm it worked
            const { data, error } = await db.from('journals').delete().eq('id', id).select();
            
            if (error) {
                console.error("Server delete failed:", error);
                alert("Failed to delete from database. See console for details.");
                return;
            }

            // If Supabase returns empty data, the RLS policy blocked the deletion
            if (!data || data.length === 0) {
                alert("Database blocked the deletion! You need to add the DELETE policy in the Supabase SQL Editor.");
                return;
            }
        }
        
        // Unconditionally remove from local state so the UI updates instantly
        const idx = store.journal.entries.findIndex(e => e.id === id);
        if (idx !== -1) {
            store.journal.entries.splice(idx, 1);
            store.journal.activeId = store.journal.entries.length > 0 ? store.journal.entries[0].id : null;
            nextTick(() => syncEditor());
        }
    }
}

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || 
         (item.name && item.name.toLowerCase().includes(term)) || 
         (item.code && item.code.toLowerCase().includes(term)) ||
         (item.cas && item.cas.toLowerCase().includes(term)))
    );
}

const insertInventoryRef = () => {
    if (!store.selectedInvRef) return;
    const item = store.inventory.find(i => i.id === store.selectedInvRef);
    if (item) {
        if (journalEditor.value) journalEditor.value.focus();
        const html = `&nbsp;<span class="inv-ref" contenteditable="false"><i class="fas fa-tag"></i>&nbsp;[${esc(item.code)}] ${esc(item.name)} (${esc(store.formatNum(item.stock))} ${esc(item.stockUnit || 'µM')})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>&nbsp;`;
        document.execCommand('insertHTML', false, html);
        updateRtfContent();
    }
    store.selectedInvRef = '';
}

const insertDateHeader = () => {
    const dateStr = new Date().toLocaleDateString();
    const html = `<br><h3><i class="far fa-calendar-alt"></i> ${dateStr}</h3><br>`;
    formatDoc('insertHTML', html);
}

const insertTable = () => {
    const rowsInput = prompt("Enter number of rows:", "3");
    const colsInput = prompt("Enter number of columns:", "3");
    if (!rowsInput || !colsInput) return;
    const rows = parseInt(rowsInput) || 3;
    const cols = parseInt(colsInput) || 3;
    let html = `<br><table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid var(--border);"><thead><tr>`;
    for(let c=0; c<cols; c++) html += `<th style="border: 1px solid var(--border); padding: 8px; background-color: var(--input-bg);">Header ${c+1}</th>`;
    html += `</tr></thead><tbody>`;
    for(let r=0; r<rows; r++) {
        html += `<tr>`;
        for(let c=0; c<cols; c++) html += `<td style="border: 1px solid var(--border); padding: 8px;">Data</td>`;
        html += `</tr>`;
    }
    html += `</tbody></table><br>`;
    formatDoc('insertHTML', html);
}

const exportJournal = (type) => {
    if (!activeJournalEntry.value || !activeJournalEntry.value.content) {
        alert("Journal entry is empty.");
        return;
    }
    const filename = `Lab_Journal_${activeJournalEntry.value.expId || 'Export'}`;
    
    if (type === 'word') {
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
        const footer = "</body></html>";
        const html = header + journalEditor.value.innerHTML + footer;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename + '.doc';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else if (type === 'pdf') {
        const opt = {
            margin:       10,
            filename:     filename + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(journalEditor.value).save();
    } else if (type === 'excel') {
        const tables = journalEditor.value.querySelectorAll('table');
        let wb = XLSX.utils.book_new();
        if (tables.length > 0) {
            tables.forEach((tbl, idx) => {
                const ws = XLSX.utils.table_to_sheet(tbl);
                XLSX.utils.book_append_sheet(wb, ws, `Table_${idx+1}`);
            });
        } else {
            const ws = XLSX.utils.aoa_to_sheet([[journalEditor.value.innerText]]);
            XLSX.utils.book_append_sheet(wb, ws, 'JournalText');
        }
        XLSX.writeFile(wb, filename + '.xlsx');
    }
}

// ── .eln (eLabFTW / ELN Consortium) import & export ──
const elnInput = ref(null)
function triggerElnImport() { elnInput.value?.click() }

function exportEln() {
    const entries = store.journal.entries
    if (!entries.length) { alert('No journal entries to export.'); return }
    const bytes = buildEln(entries, { email: store.user?.email, name: store.user?.name || store.user?.email })
    const blob = new Blob([bytes], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `boekhoven-journal-${new Date().toISOString().slice(0, 10)}.eln`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    store.toast(`Exported ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to .eln`)
}

async function importEln(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''   // let the same file be picked again later
    if (!file) return
    let items
    try {
        items = parseEln(new Uint8Array(await file.arrayBuffer()))
    } catch (e) { alert('Import failed: ' + (e?.message || e)); return }
    if (!items.length) { alert('No experiments found in that .eln file.'); return }
    const { data: { user } } = await db.auth.getUser()
    if (!user) { alert('Please log in to import entries.'); return }
    let imported = 0
    for (const it of items) {
        const content = sanitize(it.html || '')
        const expId = (it.name || `Imported ${imported + 1}`).slice(0, 120)
        const date = it.date || new Date().toISOString().slice(0, 10)
        const { data, error } = await db.from('journals').insert([{
            owner_id: user.id, scope: 'Personal',
            data: { expId, date, content, linkedProtocols: [], status: 'in_progress', category: '', ownerEmail: user.email || '' },
        }]).select()
        if (!error && data?.[0]) {
            store.journal.entries.unshift(mapRow(data[0]))
            imported++
        } else if (error) { console.error('ELN import row failed:', error) }
    }
    if (imported) { store.journal.activeId = store.journal.entries[0].id; nextTick(() => syncEditor()) }
    store.toast(`Imported ${imported} experiment${imported === 1 ? '' : 's'} from .eln`)
}

// ── Embed images / files into the entry (button, paste, drag-drop) ──
const fileInput = ref(null)
const MAX_EMBED = 12 * 1024 * 1024   // 12 MB per file
const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
function triggerFilePick() { fileInput.value?.click() }
async function onFilePick(ev) { const files = Array.from(ev.target.files || []); ev.target.value = ''; await embedFiles(files) }
function fileChipHtml(name, type, b64) {
    return `<span class="file-attach" contenteditable="false" data-file="${b64}" data-type="${esc(type)}" data-name="${esc(name)}"><i class="fas fa-paperclip"></i> ${esc(name)}</span>&nbsp;`
}
async function embedFiles(files) {
    if (!files.length) return
    if (!activeJournalEntry.value) { alert('Open a journal entry first.'); return }
    journalEditor.value?.focus()
    for (const f of files) {
        if (f.size > MAX_EMBED) { alert(`"${f.name}" is ${(f.size / 1048576).toFixed(1)} MB — too large to embed (max 12 MB).`); continue }
        const dataUrl = await readDataUrl(f)
        const html = (f.type || '').startsWith('image/')
            ? `<img src="${dataUrl}" alt="${esc(f.name)}" style="max-width:100%;height:auto;border-radius:6px;">&nbsp;`
            : fileChipHtml(f.name, f.type || 'application/octet-stream', String(dataUrl).split(',')[1] || '')
        document.execCommand('insertHTML', false, html)
    }
    updateRtfContent()
}
function onEditorPaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const imgs = []
    for (const it of items) { if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) imgs.push(f) } }
    if (imgs.length) { e.preventDefault(); embedFiles(imgs) }
}
function onEditorDrop(e) {
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) { e.preventDefault(); embedFiles(files) }
}
function downloadAttachment(el) {
    try {
        const b64 = el.getAttribute('data-file') || ''
        const bin = atob(b64); const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: el.getAttribute('data-type') || 'application/octet-stream' }))
        const a = document.createElement('a'); a.href = url; a.download = el.getAttribute('data-name') || 'file'
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { store.toast('Could not open attachment') }
}

// Delegated handler: clicking the × on any inv-ref chip removes it.
// Replaces the inline onclick="..." baked into chip HTML — that pattern
// allowed XSS via stored content and is now stripped by sanitize().
const onEditorClick = (e) => {
    const target = e.target
    if (target?.classList?.contains('inv-ref-remove')) {
        target.closest('.inv-ref')?.remove()
        updateRtfContent()
        return
    }
    // Click an attached (non-image) file to download it.
    const fa = target?.closest?.('.file-attach')
    if (fa && journalEditor.value?.contains(fa)) { e.preventDefault(); downloadAttachment(fa); return }
    // Click a previously drawn structure to re-open and edit it.
    const box = target?.closest?.('.chem-struct')
    if (box && journalEditor.value?.contains(box)) {
        const ket = decodeURIComponent(box.getAttribute('data-ket') || '')
        if (ket) { e.preventDefault(); openKetcher(ket, box) }
    }
}

// --- Fetch from Supabase on Mount ---
onMounted(async () => {
    if (journalEditor.value) journalEditor.value.addEventListener('click', onEditorClick)
    window.addEventListener('beforeunload', flushPendingSave)
    const { data: { user } } = await db.auth.getUser();

    if (user) {
        loadCategories();
        // Load my own entries plus lab-wide and ones shared with me. RLS is the
        // real gate; the .or() keeps it correct even before RLS is updated, and
        // falls back to owner-only if the sharing column isn't there yet.
        let { data, error } = await db.from('journals')
            .select('*')
            .or(`owner_id.eq.${user.id},scope.eq.Lab,shared_with.cs.{${user.email}}`)
            .order('created_at', { ascending: false });
        if (error) {
            ({ data, error } = await db.from('journals')
                .select('*').eq('owner_id', user.id).order('created_at', { ascending: false }));
        }
        if (error) {
            console.error("Failed to load journal entries from server:", error);
            return;
        }

        // Supabase is the authoritative source for journal entries — auto-saved
        // there after 1 s of inactivity (saveToDb).
        store.journal.entries = (data || []).map(mapRow);

        if (store.journal.entries.length > 0) {
            store.journal.activeId = store.journal.entries[0].id;
            nextTick(() => syncEditor());
            refreshSignatureBadge();
        }
        subscribeRealtime();
    }
});
</script>

<template>
  <div class="card full-width-header">
    <div class="flex-between" style="border-bottom: 1px solid var(--ln); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="10" height="12" rx="1.5"/><line x1="5.5" y1="5.5" x2="10.5" y2="5.5"/><line x1="5.5" y1="8" x2="10.5" y2="8"/></svg> Lab Journal</h2>
        <div style="display: flex; align-items: center; gap: 12px;">
            <div class="scope-chips">
                <button class="scope-chip" :class="{ active: journalView === 'journal' }" @click="journalView = 'journal'">Journal</button>
                <button class="scope-chip" :class="{ active: journalView === 'protocols' }" @click="journalView = 'protocols'">Protocols</button>
            </div>
            <template v-if="journalView === 'journal'">
                <button @click="triggerElnImport" class="secondary small" title="Import an .eln file (e.g. from eLabFTW)"><i class="fas fa-file-import"></i> Import .eln</button>
                <button @click="exportEln" class="secondary small" title="Export all entries as an .eln file (opens in eLabFTW)"><i class="fas fa-file-export"></i> Export .eln</button>
                <input ref="elnInput" type="file" accept=".eln,application/zip" style="display:none" @change="importEln">
                <button @click="addJournalEntry" class="small"><i class="fas fa-file-circle-plus"></i> New Entry</button>
            </template>
        </div>
    </div>

    <template v-if="journalView === 'journal'">
    <div class="journal-container" v-if="store.journal.entries.length > 0">
        <div class="journal-sidebar">
            <div style="padding: 12px 12px 10px; border-bottom: 1px solid var(--border);">
                <div style="font-weight: bold; opacity: 0.75; font-size: 0.85rem; margin-bottom: 8px;">Logged Experiments</div>
                <div class="search-box" style="margin: 0;">
                    <i class="fas fa-search"></i>
                    <input type="text" v-model="journalSearch" placeholder="Search entries…" style="padding: 7px 8px 7px 32px; font-size: 0.85rem;">
                </div>
                <div class="jf-filters">
                    <button class="jf-chip" :class="{ active: !statusFilter }" @click="statusFilter = ''">All</button>
                    <button v-for="s in STATUSES" :key="s.id" class="jf-chip" :class="{ active: statusFilter === s.id }" :style="statusFilter === s.id ? { background: s.color, borderColor: s.color, color: '#fff' } : {}" @click="statusFilter = statusFilter === s.id ? '' : s.id" :title="s.label">
                        <i class="fas" :class="s.icon"></i>
                    </button>
                </div>
                <select v-if="categories.length" v-model="categoryFilter" class="jf-cat-select">
                    <option value="">All categories</option>
                    <option v-for="c in categories" :key="c.id" :value="c.name">{{ c.name }}</option>
                </select>
            </div>
            <div class="journal-list">
                <div v-for="entry in filteredJournalEntries" :key="entry.id"
                     :class="['journal-item', { active: store.journal.activeId === entry.id }]"
                     @click="store.journal.activeId = entry.id; syncEditor()">
                    <div class="journal-item-title">
                        <span class="ji-dot" :style="{ background: statusMeta(entry.status).color }" :title="statusMeta(entry.status).label"></span>
                        {{ entry.expId || 'Untitled Exp' }}
                        <i v-if="!isEntryOwner(entry)" class="fas fa-user-group ji-shared" title="Shared with you"></i>
                        <i v-else-if="entry.scope === 'Lab'" class="fas fa-globe ji-shared" title="Lab-wide"></i>
                        <i v-else-if="(entry.sharedWith || []).length" class="fas fa-user-group ji-shared" :title="'Shared · ' + entry.sharedWith.length"></i>
                    </div>
                    <div class="journal-item-date">
                        <i class="far fa-calendar-alt"></i> {{ entry.date }}
                        <span v-if="entry.category" class="ji-cat">{{ entry.category }}</span>
                    </div>
                </div>
                <div v-if="!filteredJournalEntries.length" style="padding: 14px; text-align: center; opacity: 0.5; font-size: 0.82rem;">No matching entries.</div>
            </div>
        </div>

        <div class="journal-editor" v-if="activeJournalEntry">
            <div class="journal-editor-header">
                <div style="flex-grow: 1; min-width: 150px;">
                    <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: none;">Running No. / Exp ID</label>
                    <input type="text" v-model="activeJournalEntry.expId" @input="updateHeaderAndSave" placeholder="CTI-114" style="font-size: 1.1rem; font-weight: bold; color: var(--primary); border: none; border-bottom: 2px solid var(--primary); border-radius: 0; background: transparent; padding-left: 0;">
                </div>
                <div style="width: 150px;">
                    <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: none;">Date</label>
                    <input type="date" v-model="activeJournalEntry.date" @change="updateHeaderAndSave">
                </div>
                <div style="display: flex; align-items: flex-end; gap: 8px;">
                    <button class="small" @click="openHistory" title="Version history &amp; changes"><i class="fas fa-clock-rotate-left"></i></button>
                    <button class="small" @click="openSign" title="Sign this entry (electronic signature)"><i class="fas fa-signature"></i></button>
                    <button class="small" @click="exportJournal('pdf')" title="Export to PDF"><i class="fas fa-file-pdf"></i></button>
                    <button class="small" @click="exportJournal('word')" title="Export to Word"><i class="fas fa-file-word"></i></button>
                    <button class="small" @click="exportJournal('excel')" title="Export to Excel"><i class="fas fa-file-excel"></i></button>
                    <button class="danger small" @click="deleteJournalEntry(activeJournalEntry.id)"><i class="fas fa-trash"></i></button>
                </div>
            </div>

            <!-- Status · Category · Sharing -->
            <div class="je-meta">
                <div class="je-status-wrap">
                    <button class="je-status" :style="{ borderColor: statusMeta(activeJournalEntry.status).color, color: statusMeta(activeJournalEntry.status).color }" @click="statusMenuId = statusMenuId === activeJournalEntry.id ? null : activeJournalEntry.id">
                        <i class="fas" :class="statusMeta(activeJournalEntry.status).icon"></i> {{ statusMeta(activeJournalEntry.status).label }}
                        <i class="fas fa-chevron-down" style="font-size: 0.7em; opacity: 0.6;"></i>
                    </button>
                    <div v-if="statusMenuId === activeJournalEntry.id" class="je-status-menu">
                        <button v-for="s in STATUSES" :key="s.id" :style="{ color: s.color }" @click="setStatus(activeJournalEntry, s.id)"><i class="fas" :class="s.icon"></i> {{ s.label }}</button>
                    </div>
                </div>

                <div class="je-cat">
                    <i class="fas fa-folder" style="opacity: 0.5;"></i>
                    <select v-model="activeJournalEntry.category" @change="persistEntry(activeJournalEntry)">
                        <option value="">— category —</option>
                        <option v-for="c in categories" :key="c.id" :value="c.name">{{ c.name }}</option>
                        <option v-if="activeJournalEntry.category && !categories.some(c => c.name === activeJournalEntry.category)" :value="activeJournalEntry.category">{{ activeJournalEntry.category }}</option>
                    </select>
                    <button class="secondary small" title="New lab-wide category" @click="addCategoryAndAssign(activeJournalEntry)"><i class="fas fa-plus"></i></button>
                </div>

                <span v-if="entrySignature" class="je-signed" :class="{ stale: !signatureIsCurrent }"
                      :title="signatureIsCurrent
                        ? `Signed by ${entrySignature.signed_by_email} · ${fmtStamp(entrySignature.signed_at)} · ${entrySignature.signature_meaning}`
                        : `Edited since it was signed by ${entrySignature.signed_by_email} on ${fmtStamp(entrySignature.signed_at)}. The signed version v${entrySignature.version_no} is kept in history; re-sign to cover the current content.`">
                    <i class="fas" :class="signatureIsCurrent ? 'fa-lock' : 'fa-lock-open'"></i>
                    {{ signatureIsCurrent ? 'Signed v' + entrySignature.version_no : 'Signed · edited since' }}
                </span>

                <button class="secondary small" style="margin-left: auto;" :disabled="!isEntryOwner(activeJournalEntry)" :title="isEntryOwner(activeJournalEntry) ? 'Share this entry with specific users' : 'Only the owner can change sharing'" @click="openShare(activeJournalEntry)">
                    <i class="fas fa-user-plus"></i> {{ shareSummary(activeJournalEntry) }}
                </button>
                <span v-if="!isEntryOwner(activeJournalEntry) && activeJournalEntry.owner_email" class="je-owner"><i class="fas fa-user"></i> {{ activeJournalEntry.owner_email.split('@')[0] }}</span>
            </div>

            <div v-if="coEditNotice && coEditNotice.id === activeJournalEntry.id" class="je-coedit">
                <i class="fas fa-user-pen"></i> <b>{{ coEditNotice.by.split('@')[0] }}</b> just edited this entry.
                <button class="small" @click="reloadCoEdited">Load their version</button>
                <button class="secondary small" @click="coEditNotice = null">Keep mine</button>
            </div>

            <div v-if="activeJournalEntry.linkedProtocols && activeJournalEntry.linkedProtocols.length" class="linked-protocols">
                <span class="lp-label">Linked protocols:</span>
                <span v-for="lp in activeJournalEntry.linkedProtocols" :key="lp.id" class="lp-chip" @click="openLinkedProtocol(lp.id)" :title="'Open ' + lp.name">
                    <i class="fas fa-vial-circle-check"></i> {{ lp.name }} <em>{{ lp.type }}</em>
                    <button @click.stop="unlinkProtocol(lp.id)" title="Unlink">×</button>
                </span>
            </div>

            <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: none; margin-bottom: 5px;">Documentation Log</label>
            
            <div style="display: flex; flex-direction: column; flex-grow: 1; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--input-bg);">
                <div class="rtf-toolbar">
                    <button class="rtf-btn" @click.prevent="formatDoc('bold')" title="Bold"><i class="fas fa-bold"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('italic')" title="Italic"><i class="fas fa-italic"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('underline')" title="Underline"><i class="fas fa-underline"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('strikeThrough')" title="Strikethrough"><i class="fas fa-strikethrough"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="insertDateHeader" title="Insert Date Header"><i class="fas fa-calendar-day"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="formatDoc('insertUnorderedList')" title="Bullet List"><i class="fas fa-list-ul"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('insertOrderedList')" title="Numbered List"><i class="fas fa-list-ol"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyLeft')" title="Align Left"><i class="fas fa-align-left"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyCenter')" title="Align Center"><i class="fas fa-align-center"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyRight')" title="Align Right"><i class="fas fa-align-right"></i></button>
                    
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="insertTable" title="Insert Table"><i class="fas fa-table"></i></button>
                    <button class="rtf-btn" @click.prevent="triggerFilePick" title="Insert image or file"><i class="fas fa-image"></i></button>
                    <input ref="fileInput" type="file" multiple style="display:none" @change="onFilePick">
                    <button class="rtf-btn" @click.prevent="openKetcher()" title="Draw chemical structure"><i class="fas fa-atom"></i></button>

                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    
                    <div style="position: relative; margin-left: auto;" @click.stop>
                        <div @click="store.activeDropdown = store.activeDropdown === 'journal_ref' ? null : 'journal_ref'" style="padding: 4px 8px; font-size: 0.85rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; height: 32px; display: flex; align-items: center; gap: 6px;">
                            <span>+ Reference Stock</span>
                            <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                        </div>
                        <div v-if="store.activeDropdown === 'journal_ref'" style="position: absolute; top: 100%; right: 0; z-index: 100; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); min-width: 250px; display: flex; flex-direction: column;">
                            <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="store.journalRefSearchScope"> Global</label>
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="store.journalRefSearchScope"> Personal</label>
                            </div>
                            <input type="text" v-model="store.rtfSearchQuery" placeholder="Search inventory..." style="margin: 5px; width: calc(100% - 10px); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                            <div style="overflow-y: auto; max-height: 200px;">
                                <div v-for="inv in filterBlockInventory(store.rtfSearchQuery, store.journalRefSearchScope)" :key="inv.id" @mousedown.prevent="store.selectedInvRef = inv.id; insertInventoryRef(); store.activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                    [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="journal-textarea rtf-editor"
                     contenteditable="true"
                     placeholder="Document your procedure here. Click 'Log to Journal' on any planner to append data tables instantly..."
                     style="border: none; border-radius: 0; outline: none; overflow-y: auto; white-space: pre-wrap;"
                     @input="updateRtfContent"
                     @blur="updateRtfContent"
                     @paste="onEditorPaste"
                     @drop="onEditorDrop"
                     @dragover.prevent
                     ref="journalEditor">
                </div>
            </div>
        </div>
    </div>
    <div v-else style="text-align: center; padding: 40px; opacity: 0.5; background: var(--input-bg); border-radius: var(--radius);">
        <i class="fas fa-book-open fa-3x" style="margin-bottom: 15px;"></i><br>
        Your lab journal is empty. Create a new entry to start documenting.
    </div>
    </template>

    <!-- Protocols submodule -->
    <Protocols v-else :open-id="openProtocolId" />

    <!-- ═══ Share entry ═══ -->
    <!-- ═══ ELN version history ═══ -->
    <!-- Modals teleported to <body> so a transformed ancestor can't push them off-centre; dark-mode class carried since they render outside #body-wrapper -->
    <Teleport to="body">
    <div v-if="showHistory" class="ket-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="closeHistory">
      <div class="sh-dialog eln-dialog">
        <div class="ket-head">
          <span><i class="fas fa-clock-rotate-left"></i> Version history — {{ activeJournalEntry?.expId }}</span>
          <button class="ket-x" @click="closeHistory">✕</button>
        </div>
        <div class="eln-body">
          <div v-if="versionsBusy" class="eln-state"><i class="fas fa-spinner fa-spin"></i> Loading…</div>
          <div v-else-if="versionsErr === 'setup'" class="eln-setup"><i class="fas fa-triangle-exclamation"></i> Version history isn’t set up yet. Run <code>supabase/journal_eln.sql</code> in the Supabase SQL editor to enable it.</div>
          <div v-else-if="versionsErr" class="eln-setup"><i class="fas fa-triangle-exclamation"></i> {{ versionsErr }}</div>
          <template v-else>
          <div class="eln-bar">
            <div class="eln-filter">
              <button class="scope-chip" :class="{ active: historyFilter === 'all' }" @click="historyFilter = 'all'">All versions</button>
              <button class="scope-chip" :class="{ active: historyFilter === 'signed' }" @click="historyFilter = 'signed'"><i class="fas fa-lock"></i> Signed{{ signedCount ? ' (' + signedCount + ')' : '' }}</button>
            </div>
            <button class="small" @click="saveVersionNow" :disabled="versionsBusy"><i class="fas fa-floppy-disk"></i> Save version</button>
          </div>
          <div class="eln-hint"><i class="fas fa-circle-info"></i> Versions are recorded when you finish an entry or click Save version — not on every keystroke.</div>
          <div class="eln-cols">
            <div class="eln-list">
              <button v-if="hasUnsavedDraft && historyFilter === 'all'" class="eln-vrow draft" :class="{ active: previewVersion && previewVersion.__draft }" @click="viewDraft">
                <span class="eln-vno">now</span>
                <span class="eln-vmeta"><span class="eln-vwho">Current draft</span><span class="eln-vtime">unsaved</span></span>
                <span class="eln-vsum">Not yet a version — click Save version to keep it</span>
              </button>
              <div v-if="!shownVersions.length && !(hasUnsavedDraft && historyFilter === 'all')" class="eln-empty">{{ historyFilter === 'signed' ? 'No signed versions yet — use the ✍ Sign button to sign this entry.' : 'No versions yet.' }}</div>
              <button v-for="v in shownVersions" :key="v.id" class="eln-vrow"
                      :class="{ active: (previewVersion && previewVersion.id === v.id) || (diffView && diffView.version.id === v.id), signed: v.signed }"
                      @click="viewVersion(v)">
                <span class="eln-vno">v{{ v.version_no }}</span>
                <span class="eln-vmeta">
                  <span class="eln-vwho">{{ (v.author_email || '').split('@')[0] || '—' }}</span>
                  <span class="eln-vtime">{{ fmtStamp(v.created_at) }}</span>
                </span>
                <span v-if="v.change_summary && !v.signed" class="eln-vsum">{{ v.change_summary }}</span>
                <span v-if="v.signed" class="eln-vsigline">
                  <i class="fas fa-lock"></i> Signed by {{ (v.signed_by_email || '').split('@')[0] }} · {{ fmtStamp(v.signed_at) }}<template v-if="v.signature_meaning"> · {{ v.signature_meaning }}</template>
                </span>
              </button>
            </div>
            <div class="eln-detail">
              <template v-if="diffView">
                <div class="eln-detail-head">
                  <span><i class="fas fa-code-compare"></i> Changes: v{{ diffView.version.version_no }} → current</span>
                  <button class="secondary small" @click="viewVersion(diffView.version)">View full</button>
                </div>
                <div class="eln-diff">
                  <div v-for="(op, i) in diffView.ops" :key="i" class="eln-diff-line" :class="op.type">
                    <span class="eln-diff-sign">{{ op.type === 'add' ? '+' : op.type === 'del' ? '−' : '' }}</span>{{ op.text || ' ' }}
                  </div>
                  <div v-if="!diffView.ops.some(o => o.type !== 'ctx')" class="eln-empty">No textual changes since this version.</div>
                </div>
              </template>
              <template v-else-if="previewVersion">
                <div class="eln-detail-head">
                  <span v-if="previewVersion.__draft"><i class="fas fa-pen"></i> Current draft (unsaved)</span>
                  <span v-else>v{{ previewVersion.version_no }} · {{ fmtStamp(previewVersion.created_at) }}</span>
                  <span v-if="previewVersion.signed" class="eln-signed-tag"><i class="fas fa-lock"></i> {{ previewVersion.signature_meaning }} — {{ (previewVersion.signed_by_email || '').split('@')[0] }}</span>
                </div>
                <div v-if="!previewVersion.__draft" class="eln-hash" :title="previewVersion.content_hash">SHA-256 {{ (previewVersion.content_hash || '').slice(0, 20) }}…</div>
                <div class="eln-preview" v-html="sanitize(previewVersion.content || '<em style=&quot;opacity:.6&quot;>empty</em>')"></div>
                <div class="eln-detail-actions">
                  <template v-if="previewVersion.__draft">
                    <button class="small" @click="saveVersionNow"><i class="fas fa-floppy-disk"></i> Save version</button>
                  </template>
                  <template v-else>
                    <button class="secondary small" @click="compareToNow(previewVersion)"><i class="fas fa-code-compare"></i> Compare to current</button>
                    <button class="small" @click="restoreVersion(previewVersion)"><i class="fas fa-rotate-left"></i> Restore</button>
                  </template>
                </div>
              </template>
              <div v-else class="eln-detail-empty">Select a version to view it or its changes.</div>
            </div>
          </div>
          </template>
        </div>
        <div class="sh-actions">
          <span class="eln-foot-note"><i class="fas fa-shield-halved"></i> Append-only — restoring adds a new version and never deletes history.</span>
          <button class="secondary small" style="margin-left: auto;" @click="closeHistory">Close</button>
        </div>
      </div>
    </div>

    <!-- ═══ Electronic signature ═══ -->
    <div v-if="signDialog" class="ket-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="closeSign">
      <div class="sh-dialog">
        <div class="ket-head"><span><i class="fas fa-signature"></i> Sign “{{ activeJournalEntry?.expId }}”</span><button class="ket-x" @click="closeSign">✕</button></div>
        <div class="sh-body">
          <p class="eln-sign-intro">Your electronic signature records who you are, the exact time, and your stated intent, and binds them to a SHA-256 hash of the current content. It writes a locked, signed version — nothing existing is changed.</p>
          <label class="sh-label">Meaning of signature</label>
          <select v-model="signDialog.meaning">
            <option value="">— choose, or type below —</option>
            <option>Reviewed and approved</option>
            <option>Authored — record complete</option>
            <option>Witnessed</option>
          </select>
          <input v-model="signDialog.meaning" placeholder="…or type a custom meaning">
          <label class="sh-label">Confirm your password</label>
          <input type="password" v-model="signDialog.password" placeholder="Your account password" @keydown.enter.prevent="doSign">
          <p v-if="signDialog.msg" class="eln-sign-msg">{{ signDialog.msg }}</p>
        </div>
        <div class="sh-actions">
          <span class="eln-foot-note">Signing as <b>{{ store.user?.email }}</b></span>
          <button class="secondary small" style="margin-left: auto;" @click="closeSign" :disabled="signDialog.busy">Cancel</button>
          <button class="small" @click="doSign" :disabled="signDialog.busy"><i class="fas fa-lock"></i> Sign</button>
        </div>
      </div>
    </div>

    <div v-if="shareDialog" class="ket-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="shareDialog = null">
      <div class="sh-dialog">
        <div class="ket-head">
          <span><i class="fas fa-user-plus"></i> Share “{{ shareDialog.entry.expId }}”</span>
          <button class="ket-x" @click="shareDialog = null">✕</button>
        </div>
        <div class="sh-body">
          <div class="scope-chips">
            <button class="scope-chip" :class="{ active: shareDialog.scope === 'Personal' }" @click="shareDialog.scope = 'Personal'">Specific users</button>
            <button class="scope-chip" :class="{ active: shareDialog.scope === 'Lab' }" @click="shareDialog.scope = 'Lab'">Lab-wide</button>
          </div>
          <div v-if="shareDialog.scope !== 'Lab'" class="sh-invite">
            <label class="sh-label">Share with (emails) — they can view and co-edit</label>
            <div v-if="shareDialog.sharedWith.length" class="sh-chips">
              <span v-for="em in shareDialog.sharedWith" :key="em" class="sh-chip">{{ em }}<button @click="removeShareEmail(em)">×</button></span>
            </div>
            <div style="display: flex; gap: 6px;">
              <input v-model="shareDialog.input" list="jr-share-emails" placeholder="name@example.com" @keydown.enter.prevent="addShareEmail" style="flex: 1;">
              <button class="secondary small" @click="addShareEmail">Add</button>
            </div>
            <datalist id="jr-share-emails"><option v-for="em in knownJournalEmails" :key="em" :value="em"></option></datalist>
          </div>
          <p class="sh-note">{{ shareDialog.scope === 'Lab' ? 'Everyone in the lab can view and edit this entry.' : (shareDialog.sharedWith.length ? 'These users can view and edit this entry in real time.' : 'Only you can see this entry.') }}</p>
        </div>
        <div class="sh-actions">
          <button class="secondary small" style="margin-left: auto;" @click="shareDialog = null">Cancel</button>
          <button class="small" @click="saveShare"><i class="fas fa-check"></i> Save sharing</button>
        </div>
      </div>
    </div>

    <!-- ═══ Ketcher structure editor ═══ -->
    <div v-if="showKetcher" class="ket-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="showKetcher = false">
      <div class="ket-dialog">
        <div class="ket-head">
          <span><i class="fas fa-atom"></i> {{ editingStructEl ? 'Edit structure' : 'Draw chemical structure' }}</span>
          <button class="ket-x" @click="showKetcher = false">✕</button>
        </div>
        <div class="ket-body">
          <div v-if="!ketcherReady" class="ket-loading"><i class="fas fa-spinner fa-spin"></i> Loading structure editor…</div>
          <KetcherField :initial-ket="ketcherEditKet" @ready="onKetcherReady" />
        </div>
        <div class="ket-props">
          <label class="ket-f"><span>{{ molInfo.isReaction ? 'Reaction name' : 'Compound name' }}</span><input v-model="molName" placeholder="(optional)"></label>
          <div class="ket-info">
            <template v-if="molInfo.count === 1">
              <span><b>Formula:</b> {{ molInfo.formula || '—' }}</span>
              <span><b>MW:</b> {{ molInfo.mw != null ? (+molInfo.mw).toFixed(2) + ' g/mol' : '—' }}</span>
            </template>
            <span v-else-if="molInfo.count > 1"><b>{{ molInfo.isReaction ? 'Reaction' : 'Mixture' }}:</b> {{ molInfo.count }} components</span>
            <span v-else style="color:var(--tx3);">Draw a molecule or reaction scheme</span>
            <button class="secondary small" @click="readStructure" :disabled="ketcherBusy"><i class="fas fa-rotate"></i> Recalculate</button>
          </div>
          <label class="ket-check"><input type="checkbox" v-model="molIncludeStoich"> Add stoichiometry table</label>
        </div>
        <div v-if="molIncludeStoich && molComponents.length" class="ket-stoich">
          <table class="ket-stoich-tbl">
            <thead><tr><th>Role</th><th>Formula</th><th>MW</th><th>Amount (mg)</th><th>mmol</th><th>equiv</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in stoichRows" :key="i">
                <td>{{ r.role }}</td>
                <td>{{ r.formula || '—' }}</td>
                <td>{{ r.mw != null ? (+r.mw).toFixed(2) : '—' }}</td>
                <td><input type="number" step="any" v-model.number="molComponents[i].amount" placeholder="mg"></td>
                <td>{{ r.mmol != null ? r.mmol.toFixed(3) : '—' }}</td>
                <td :class="{ 'ket-eq': r.equiv != null }">{{ r.equiv != null ? r.equiv.toFixed(2) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ket-actions">
          <span v-if="ketcherBusy" class="ket-busy"><i class="fas fa-spinner fa-spin"></i> Working…</span>
          <span v-else class="ket-hint">Structure is stored as KET (fully editable) and embedded as a PNG for export.</span>
          <button class="secondary small" style="margin-left:auto;" @click="showKetcher = false">Cancel</button>
          <button class="small" @click="insertStructure" :disabled="ketcherBusy"><i class="fas fa-plus"></i> {{ editingStructEl ? 'Update' : 'Insert into entry' }}</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Linked protocol chips */
.linked-protocols { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 2px 0 10px; }
.lp-label { font-size: 0.72rem; color: var(--tx2); font-weight: 600; }
.lp-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 5px 3px 9px; border-radius: 999px; background: var(--acs); color: var(--acc); font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.lp-chip em { font-style: normal; opacity: 0.6; font-size: 0.68rem; }

/* Sidebar status/category filters */
.jf-filters { display: flex; align-items: center; gap: 5px; margin-top: 8px; }
.jf-chip { flex: 1; padding: 5px 6px; border-radius: 8px; border: 1px solid var(--ln2); background: var(--fl); color: var(--tx2); font-size: 0.78rem; cursor: pointer; box-shadow: none; }
.jf-chip:hover { filter: none; color: var(--tx); }
.jf-chip.active { background: var(--acc); border-color: transparent; color: #fff; }
.jf-cat-select { margin-top: 8px; width: 100%; padding: 6px 8px; font-size: 0.82rem; }

/* List item status dot / sharing / category */
.ji-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; flex: none; }
.ji-shared { font-size: 0.72rem; opacity: 0.55; margin-left: 4px; }
.ji-cat { margin-left: 8px; font-size: 0.68rem; font-weight: 600; color: var(--acc); background: var(--acs); border-radius: 999px; padding: 1px 7px; }

/* Entry meta bar */
.je-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 4px 0 10px; }
.je-status-wrap { position: relative; }
.je-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1.5px solid; background: transparent; font-size: 0.8rem; font-weight: 700; cursor: pointer; box-shadow: none; }
.je-status:hover { filter: none; }
.je-status-menu { position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 40; background: var(--modal); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--cdl); border-radius: var(--rc); box-shadow: var(--sh); padding: 4px; min-width: 190px; display: flex; flex-direction: column; }
.je-status-menu button { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: none; border: none; box-shadow: none; text-align: left; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 8px; }
.je-status-menu button:hover { background: var(--fl); filter: none; }
.je-cat { display: inline-flex; align-items: center; gap: 6px; }
.je-cat select { padding: 5px 8px; font-size: 0.82rem; max-width: 200px; }
.je-owner { font-size: 0.76rem; color: var(--tx2); display: inline-flex; align-items: center; gap: 5px; }

/* Co-edit notice */
.je-coedit { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 10px; border-radius: var(--rc); background: rgba(0,114,178,0.10); border: 1px solid #0072B2; color: var(--tx); font-size: 0.82rem; }

/* Share dialog */
.sh-dialog { background: var(--modal); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: var(--sh); width: 100%; max-width: 460px; display: flex; flex-direction: column; overflow: hidden; }
.sh-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.sh-label { font-size: 0.72rem; font-weight: 600; color: var(--tx2); }
.sh-invite { display: flex; flex-direction: column; gap: 6px; }
.sh-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.sh-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 9px; border-radius: 999px; background: var(--acs); color: var(--acc); font-size: 0.74rem; font-weight: 600; }
.sh-chip button { background: none; border: none; box-shadow: none; color: inherit; cursor: pointer; font-size: 0.95rem; line-height: 1; padding: 0 2px; }
.sh-note { font-size: 0.76rem; color: var(--tx2); margin: 0; }
.sh-actions { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--ln); }

/* Embedded file attachment chip */
:deep(.file-attach) { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; margin: 2px; border-radius: 999px; background: var(--acs); color: var(--acc); font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid var(--acc); user-select: none; }
:deep(.file-attach:hover) { filter: brightness(0.97); }

/* Ketcher structure editor modal */
.ket-modal { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
.ket-dialog { background: var(--modal); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border: 1px solid var(--cdl); border-radius: var(--r); box-shadow: var(--sh); width: min(1100px, 96vw); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; }
.ket-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; font-weight: 600; color: var(--tx); border-bottom: 1px solid var(--ln); }
.ket-x { width: 28px; height: 28px; border-radius: 50%; background: var(--fl); color: var(--tx2); border: none; box-shadow: none; cursor: pointer; font-size: 13px; }
.ket-body { flex: 1 1 auto; min-height: 440px; background: #fff; overflow: hidden; position: relative; }
.ket-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: #667; font-size: 0.85rem; pointer-events: none; }
.ket-props { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; padding: 10px 16px; border-top: 1px solid var(--ln); }
.ket-f { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; font-weight: 600; color: var(--tx2); }
.ket-f input { padding: 5px 8px; }
.ket-info { display: flex; gap: 14px; align-items: center; font-size: 0.82rem; color: var(--tx); }
.ket-check { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--tx); }
.ket-mmol { color: var(--acc); font-weight: 700; }
.ket-stoich { padding: 0 16px 10px; max-height: 26vh; overflow: auto; }
.ket-stoich-tbl { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.ket-stoich-tbl th { text-align: left; font-size: 0.66rem; text-transform: uppercase; letter-spacing: .03em; color: var(--tx2); padding: 4px 8px; position: sticky; top: 0; background: var(--modal); }
.ket-stoich-tbl td { padding: 3px 8px; border-top: 1px solid var(--ln); color: var(--tx); }
.ket-stoich-tbl input { width: 84px; padding: 4px 6px; }
.ket-stoich-tbl .ket-eq { color: var(--acc); font-weight: 600; }
.ket-actions { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--ln); }
.ket-busy, .ket-hint { font-size: 0.76rem; color: var(--tx2); }
.lp-chip button { background: none; border: none; box-shadow: none; color: inherit; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0 2px; }

/* Make the card fill the full module height so the journal container can grow with it */
.card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
}

/* Let the journal container grow to fill remaining card space instead of being fixed at 500px */
.journal-container {
  flex: 1;
}

/* ── ELN: signature badge, version history, diff ── */
.je-signed { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; font-weight: 700; color: var(--ok); background: rgba(0,158,115,.12); border-radius: 999px; padding: 3px 10px; }
.je-signed.stale { color: #C77700; background: rgba(199,119,0,.12); }
.eln-dialog { max-width: 780px; }
.eln-body { padding: 14px 16px; }
.eln-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.eln-filter { display: inline-flex; }
.eln-filter .scope-chip { display: inline-flex; align-items: center; gap: 5px; }
.eln-hint { font-size: 0.74rem; color: var(--tx2); display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.eln-note { font-size: 0.74rem; color: var(--tx2); display: inline-flex; align-items: center; gap: 6px; flex: 1; }
.eln-vrow.draft { border-style: dashed; border-left: 3px solid #C77700; }
.eln-vrow.draft .eln-vno { color: #C77700; }
.eln-vrow.signed { background: rgba(0,158,115,.07); }
.eln-vsigline { grid-column: 1 / -1; display: inline-flex; align-items: baseline; gap: 5px; font-size: 0.7rem; font-weight: 600; color: var(--ok); margin-top: 2px; }
.eln-vsigline i { font-size: 0.66rem; }
.eln-state, .eln-empty, .eln-detail-empty { font-size: 0.85rem; color: var(--tx2); padding: 10px 0; }
.eln-setup { font-size: 0.85rem; color: var(--wr); padding: 10px 0; display: flex; gap: 8px; align-items: baseline; }
.eln-setup code { font-family: ui-monospace, monospace; }
.eln-cols { display: flex; gap: 14px; min-height: 320px; }
.eln-list { width: 250px; flex: none; display: flex; flex-direction: column; gap: 4px; max-height: 60vh; overflow-y: auto; border-right: 1px solid var(--ln); padding-right: 10px; }
.eln-vrow { display: grid; grid-template-columns: auto 1fr auto; gap: 2px 8px; align-items: center; text-align: left; padding: 7px 9px; border: 1px solid var(--ln2); border-radius: var(--rc); background: var(--fl); cursor: pointer; box-shadow: none; color: var(--tx); }
.eln-vrow:hover { border-color: var(--acc); filter: none; }
.eln-vrow.active { border-color: var(--acc); background: var(--acs); }
.eln-vrow.signed { border-left: 3px solid var(--ok); }
.eln-vno { font-weight: 700; font-size: 0.8rem; color: var(--acc); }
.eln-vmeta { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.eln-vwho { font-size: 0.8rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eln-vtime { font-size: 0.68rem; color: var(--tx3); }
.eln-vsig { color: var(--ok); }
.eln-vsum { grid-column: 1 / -1; font-size: 0.7rem; color: var(--tx2); }
.eln-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.eln-detail-head { font-size: 0.82rem; font-weight: 600; color: var(--tx); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.eln-signed-tag { font-size: 0.72rem; color: var(--ok); font-weight: 600; }
.eln-hash { font-family: ui-monospace, monospace; font-size: 0.68rem; color: var(--tx3); }
.eln-preview { border: 1px solid var(--ln2); border-radius: var(--rc); padding: 10px; max-height: 42vh; overflow: auto; font-size: 0.85rem; background: var(--surface-solid); color: var(--tx); }
.eln-detail-actions { display: flex; gap: 8px; }
.eln-diff { border: 1px solid var(--ln2); border-radius: var(--rc); overflow: auto; max-height: 50vh; font-family: ui-monospace, monospace; font-size: 0.78rem; }
.eln-diff-line { display: flex; gap: 6px; padding: 1px 8px; white-space: pre-wrap; color: var(--tx); }
.eln-diff-line .eln-diff-sign { width: 10px; flex: none; opacity: .6; }
.eln-diff-line.add { background: rgba(0,158,115,.14); }
.eln-diff-line.del { background: rgba(213,94,0,.14); text-decoration: line-through; opacity: .8; }
.eln-foot-note { font-size: 0.72rem; color: var(--tx2); }
.eln-sign-intro { font-size: 0.82rem; color: var(--tx2); line-height: 1.5; margin: 0; }
.eln-sign-msg { font-size: 0.8rem; color: var(--wr); margin: 0; }
</style>