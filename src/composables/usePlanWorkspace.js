// Shared workspace behaviour for the plan-style modules (reaction plans, matrices,
// screenings, well plates).
//
// Each of those components had its own copy of load-from-cloud / close / archive /
// duplicate, and the four copies were identical apart from the store array they
// mutate and the table they save to. Same logic, four places to fix a bug in.
//
// A module supplies where its plans live and what they're called; the behaviour
// lives here once.
//
//   const ws = usePlanWorkspace({
//     store, table: 'matrices', open: 'matrices',
//     archived: 'archivedMatrices', noun: 'matrix', showLibrary,
//   })
//
// `open`/`archived` are store property NAMES (not the arrays) so the store stays
// the reactive owner of the data — the composable never holds a stale reference.

export function usePlanWorkspace({ store, table, open, archived, noun = 'plan', showLibrary = null }) {
  const list = () => store[open]
  const archiveList = () => store[archived]

  /** Open a cloud plan in the workspace (no-op if it's already open). */
  const loadFromCloud = (plan) => {
    if (!list().some(p => p.id === plan.id)) {
      list().unshift(JSON.parse(JSON.stringify(plan)))
    }
    if (showLibrary) showLibrary.value = false
    store.saveWorkspaceState()
  }

  /** Remove from the workspace view — the cloud copy is untouched. */
  const closeInWorkspace = (index) => {
    list().splice(index, 1)
    store.saveWorkspaceState()
  }

  /** Move out of the workspace into the archive (kept in the cloud, scope='Archived'). */
  const archivePlan = async (index) => {
    if (!confirm(`Archive this ${noun}?`)) return false
    const item = list().splice(index, 1)[0]
    item.scope = 'Archived'
    archiveList().push(item)
    await store.saveToCloud(table, item)
    store.saveWorkspaceState()
    return true
  }

  /** Copy as a new private plan directly below the original. */
  const duplicatePlan = (index) => {
    const copy = JSON.parse(JSON.stringify(list()[index]))
    copy.id = crypto.randomUUID()
    copy.name = (copy.name || noun) + ' (Copy)'
    copy.scope = 'Personal'
    copy.owner_id = store.user?.id
    copy.status = 'in_progress'      // a fresh copy hasn't been run yet
    list().splice(index + 1, 0, copy)
    store.saveWorkspaceState()
    return copy
  }

  /** Set + persist the experiment status, reverting if the save is rejected. */
  const setStatus = async (plan, value) => {
    const prev = plan.status || 'in_progress'
    plan.status = value
    if (await store.saveToCloud(table, plan)) store.toast('Status updated')
    else plan.status = prev
  }

  return { loadFromCloud, closeInWorkspace, archivePlan, duplicatePlan, setStatus }
}
