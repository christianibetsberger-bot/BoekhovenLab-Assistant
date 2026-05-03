// Tiny shared reactive bus so the TopBarClock and the TimeTracker module
// stay in sync. When either component mutates a time entry, it calls
// bumpTT(); the other component watches the counter and reloads its state.
import { ref } from 'vue'

export const ttBumpCounter = ref(0)
export function bumpTT() { ttBumpCounter.value = Date.now() }

// Bumped whenever the TimeTracker module is opened/visible. The TopBarClock
// watches this counter and disables auto-privacy + resets its idle timer.
export const ttModuleActive = ref(0)
export function signalModuleActive() { ttModuleActive.value = Date.now() }
