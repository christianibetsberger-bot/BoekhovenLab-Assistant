<template>
  <div class="card">
    <!-- ── Header ── -->
    <div class="tt-header">
      <h2><i class="fas fa-clock"></i> Time Tracker</h2>
      <div v-if="activeEntry" class="tt-live-badge">
        <span class="tt-live-dot"></span>
        CHECKED IN · {{ formatDuration(currentDuration) }}
      </div>
      <div style="margin-left:auto; display:flex; gap:6px;">
        <button class="small" @click="exportXlsx" title="Export to Excel">
          <i class="fas fa-file-excel"></i> Export .xlsx
        </button>
      </div>
    </div>

    <div class="tt-layout">
      <!-- ══════════════ LEFT COLUMN ══════════════ -->
      <div class="tt-col">

        <!-- Check-in / out panel -->
        <section class="tt-section">
          <h3><i class="fas fa-toggle-on icon-muted"></i> Clock In / Out</h3>
          <div class="tt-form">
            <div class="tt-form-row">
              <div class="input-group" style="flex:1;">
                <label>Task</label>
                <div v-if="newTaskFor !== 'pending'" style="display:flex; gap:4px;">
                  <select :value="pendingTask" @change="e => onTaskChange('pending', e.target.value)" style="flex:1;">
                    <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                    <option value="__new__">+ Add new task…</option>
                  </select>
                </div>
                <div v-else style="display:flex; gap:4px;">
                  <input type="text" v-model="newTaskName" placeholder="New task name" @keyup.enter="confirmNewTask('pending')" autofocus style="flex:1;" />
                  <button class="small success" @click="confirmNewTask('pending')"><i class="fas fa-check"></i></button>
                  <button class="small" @click="cancelNewTask"><i class="fas fa-times"></i></button>
                </div>
              </div>
              <div class="input-group" style="flex:1;">
                <label>Project</label>
                <div v-if="newProjectFor !== 'pending'" style="display:flex; gap:4px;">
                  <select :value="pendingProject" @change="e => onProjectChange('pending', e.target.value)" style="flex:1;">
                    <option value="">— No project —</option>
                    <option v-for="p in settings.custom_projects" :key="p" :value="p">{{ p }}</option>
                    <option value="__new__">+ Add new project…</option>
                  </select>
                </div>
                <div v-else style="display:flex; gap:4px;">
                  <input type="text" v-model="newProjectName" placeholder="New project name" @keyup.enter="confirmNewProject('pending')" autofocus style="flex:1;" />
                  <button class="small success" @click="confirmNewProject('pending')" title="Add"><i class="fas fa-check"></i></button>
                  <button class="small" @click="cancelNewProject" title="Cancel"><i class="fas fa-times"></i></button>
                </div>
              </div>
            </div>
            <div class="input-group">
              <label>Note (optional)</label>
              <input type="text" v-model="pendingNote" placeholder="What are you working on?" />
            </div>

            <div v-if="activeEntry" class="tt-active-info">
              <i class="fas fa-circle-dot" style="color:var(--success);"></i>
              <span style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <template v-if="newTaskFor !== 'active'">
                  <select :value="activeEntry.task" @change="e => onTaskChange('active', e.target.value)" class="tt-active-select" :disabled="isSaving">
                    <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                    <option value="__new__">+ Add new task…</option>
                  </select>
                </template>
                <template v-else>
                  <input type="text" v-model="newTaskName" placeholder="New task name" @keyup.enter="confirmNewTask('active')" autofocus style="font-size:.8rem; padding:2px 6px;" />
                  <button class="small success" @click="confirmNewTask('active')"><i class="fas fa-check"></i></button>
                  <button class="small" @click="cancelNewTask"><i class="fas fa-times"></i></button>
                </template>
                <span v-if="activeEntry.project" style="opacity:.85;">· {{ activeEntry.project }}</span>
                <span style="opacity:.65; font-size:.72rem;">since {{ formatTime(activeEntry.checked_in) }}</span>
              </span>
            </div>

            <button class="tt-checkin-btn" :class="activeEntry ? 'checkout' : 'checkin'"
              @click="toggleCheckIn" :disabled="isSaving">
              <i class="fas" :class="activeEntry ? 'fa-stop-circle' : 'fa-play-circle'"></i>
              {{ activeEntry ? 'CHECK OUT' : 'CHECK IN' }}
            </button>

            <!-- Nachbuchen toggle -->
            <button class="small" style="margin-top:4px; width:100%;" @click="showNachbuchen = !showNachbuchen">
              <i class="fas fa-pencil"></i>
              {{ showNachbuchen ? 'Close Nachbuchen' : 'Nachbuchen (Add Past Entry)' }}
            </button>
          </div>
        </section>

        <!-- Nachbuchen panel -->
        <section v-if="showNachbuchen" class="tt-section tt-section-nb">
          <h3><i class="fas fa-pencil icon-muted"></i> Nachbuchen</h3>
          <p style="font-size:0.75rem; opacity:0.65; margin:0 0 8px;">
            Entry will be logged with today's timestamp to indicate it was added retroactively.
          </p>
          <div class="tt-form">
            <div class="tt-form-row">
              <div class="input-group" style="flex:1;">
                <label>Date</label>
                <input type="date" v-model="nbDate" :max="todayStr" />
              </div>
              <div class="input-group" style="flex:1;">
                <label>From</label>
                <input type="time" v-model="nbFrom" />
              </div>
              <div class="input-group" style="flex:1;">
                <label>To</label>
                <input type="time" v-model="nbTo" />
              </div>
            </div>
            <div class="tt-form-row">
              <div class="input-group" style="flex:1;">
                <label>Task</label>
                <div v-if="newTaskFor !== 'nb'" style="display:flex; gap:4px;">
                  <select :value="nbTask" @change="e => onTaskChange('nb', e.target.value)" style="flex:1;">
                    <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                    <option value="__new__">+ Add new task…</option>
                  </select>
                </div>
                <div v-else style="display:flex; gap:4px;">
                  <input type="text" v-model="newTaskName" placeholder="New task name" @keyup.enter="confirmNewTask('nb')" autofocus style="flex:1;" />
                  <button class="small success" @click="confirmNewTask('nb')"><i class="fas fa-check"></i></button>
                  <button class="small" @click="cancelNewTask"><i class="fas fa-times"></i></button>
                </div>
              </div>
              <div class="input-group" style="flex:1;">
                <label>Project</label>
                <div v-if="newProjectFor !== 'nb'" style="display:flex; gap:4px;">
                  <select :value="nbProject" @change="e => onProjectChange('nb', e.target.value)" style="flex:1;">
                    <option value="">— No project —</option>
                    <option v-for="p in settings.custom_projects" :key="p" :value="p">{{ p }}</option>
                    <option value="__new__">+ Add new project…</option>
                  </select>
                </div>
                <div v-else style="display:flex; gap:4px;">
                  <input type="text" v-model="newProjectName" placeholder="New project name" @keyup.enter="confirmNewProject('nb')" autofocus style="flex:1;" />
                  <button class="small success" @click="confirmNewProject('nb')"><i class="fas fa-check"></i></button>
                  <button class="small" @click="cancelNewProject"><i class="fas fa-times"></i></button>
                </div>
              </div>
            </div>
            <div class="input-group">
              <label>Note</label>
              <input type="text" v-model="nbNote" />
            </div>
            <button class="small success" @click="submitNachbuchen" :disabled="isSaving">
              <i class="fas fa-plus"></i> Add Entry
            </button>
          </div>
        </section>

        <!-- Sick / Vacation logging -->
        <section class="tt-section">
          <h3><i class="fas fa-calendar-xmark icon-muted"></i> Sick Days &amp; Vacation</h3>
          <div class="tt-form">
            <div class="tt-form-row">
              <div class="input-group" style="flex:1;">
                <label>Date</label>
                <input type="date" v-model="absDate" />
              </div>
              <div class="input-group" style="flex:1;">
                <label>Type</label>
                <select v-model="absType">
                  <option value="sick">Sick Day</option>
                  <option value="vacation">Vacation</option>
                </select>
              </div>
              <div class="input-group" style="flex:1;">
                <label>Duration</label>
                <select v-model="absHalf">
                  <option :value="false">Full day</option>
                  <option :value="true">Half day</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label>Note (optional)</label>
              <input type="text" v-model="absNote" placeholder="e.g. Doctor's appointment" />
            </div>
            <button class="small success" @click="addAbsence" :disabled="isSaving">
              <i class="fas fa-plus"></i> Log Absence
            </button>
          </div>

          <!-- Absence list -->
          <div v-if="absences.length" class="tt-table-wrap" style="margin-top:10px; max-height:200px;">
            <table class="tt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in absencesSorted" :key="a.id">
                  <td>{{ a.date }}</td>
                  <td>
                    <span class="tt-abs-chip" :class="a.type">
                      {{ a.type === 'sick' ? '🤒 Sick' : '🏖 Vacation' }}
                    </span>
                  </td>
                  <td>{{ a.half_day ? 'Half' : 'Full' }}</td>
                  <td class="tt-note-cell" :title="a.note">{{ a.note }}</td>
                  <td>
                    <button class="small danger" @click="deleteAbsence(a.id)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- This-week summary -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-simple icon-muted"></i> This Week</h3>
          <div class="tt-week-grid">
            <div class="tt-stat">
              <div class="tt-stat-value">{{ formatHours(thisWeekHours) }}</div>
              <div class="tt-stat-label">Logged<span v-if="thisWeekendHours > 0" class="tt-we-note"> ({{ formatHours(thisWeekendHours) }} WE)</span></div>
            </div>
            <div class="tt-stat">
              <div class="tt-stat-value">{{ formatHours(effectiveWeeklyHours) }}</div>
              <div class="tt-stat-label">Required<span v-if="thisWeekAbsenceDays > 0" class="tt-we-note"> (-{{ thisWeekAbsenceDays }}d)</span></div>
            </div>
            <div class="tt-stat" :class="overtime >= 0 ? 'positive' : 'negative'">
              <div class="tt-stat-value">{{ overtime >= 0 ? '+' : '' }}{{ formatHours(overtime) }}</div>
              <div class="tt-stat-label">{{ overtime >= 0 ? 'Overtime' : 'Deficit' }}</div>
            </div>
            <div class="tt-stat" :class="isWeekendToday ? 'positive' : ''">
              <div class="tt-stat-value">{{ todayHours }}</div>
              <div class="tt-stat-label">Today{{ isWeekendToday ? ' 🔴OT' : ' (h)' }}</div>
            </div>
          </div>
          <div class="tt-progress-bar">
            <div class="tt-progress-fill" :style="{
              width: Math.min(100, weekPercent) + '%',
              background: weekPercent >= 100 ? 'var(--success)' : 'var(--primary)'
            }"></div>
          </div>
          <div style="font-size:0.72rem; opacity:0.6; margin-top:4px; text-align:right;">
            {{ Math.round(weekPercent) }}% of weekly target
          </div>
        </section>

        <!-- History log -->
        <section class="tt-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
            <h3 style="margin:0;"><i class="fas fa-list icon-muted"></i> History</h3>
            <div style="display:flex; gap:5px; align-items:center; font-size:0.8rem;">
              <input type="date" v-model="filterFrom" style="padding:3px 6px; font-size:0.75rem;" />
              <span style="opacity:0.5;">–</span>
              <input type="date" v-model="filterTo"   style="padding:3px 6px; font-size:0.75rem;" />
              <button class="small" @click="filterFrom=''; filterTo='';" title="Clear">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div class="tt-table-wrap">
            <table class="tt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="entry in filteredEntries" :key="entry.id">
                  <tr :class="{ 'tt-row-active': entry.id === activeEntry?.id }">
                    <td>
                      {{ formatDate(entry.checked_in) }}
                      <span v-if="isNachbuchung(entry)" class="tt-nb-badge" title="Nachbuchung — added retroactively">NB</span>
                    </td>
                    <td>{{ formatTime(entry.checked_in) }}</td>
                    <td>{{ entry.checked_out ? formatTime(entry.checked_out) : '—' }}</td>
                    <td>{{ entry.checked_out ? formatDuration(new Date(entry.checked_out) - new Date(entry.checked_in)) : formatDuration(currentDuration) }}</td>
                    <td><span class="tt-task-chip">{{ entry.task }}</span></td>
                    <td class="tt-project-cell" :title="entry.project">{{ entry.project || '—' }}</td>
                    <td class="tt-note-cell"    :title="entry.note">{{ entry.note }}</td>
                    <td>
                      <div style="display:flex; gap:4px;">
                        <button class="small" @click="startEdit(entry)"><i class="fas fa-pen"></i></button>
                        <button class="small danger" @click="deleteEntry(entry.id)"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                  <!-- Inline edit -->
                  <tr v-if="editingId === entry.id" class="tt-edit-row">
                    <td colspan="8">
                      <div class="tt-edit-form">
                        <div class="input-group" style="margin:0; min-width:140px;">
                          <label>In</label>
                          <input type="datetime-local" v-model="editIn" style="font-size:0.8rem;" />
                        </div>
                        <div class="input-group" style="margin:0; min-width:140px;">
                          <label>Out</label>
                          <input type="datetime-local" v-model="editOut" style="font-size:0.8rem;" />
                        </div>
                        <div class="input-group" style="margin:0;">
                          <label>Task</label>
                          <div v-if="newTaskFor !== 'edit'" style="display:flex; gap:3px;">
                            <select :value="editTask" @change="e => onTaskChange('edit', e.target.value)" style="font-size:0.8rem; flex:1;">
                              <option v-for="t in settings.custom_tasks" :key="t" :value="t">{{ t }}</option>
                              <option value="__new__">+ Add new…</option>
                            </select>
                          </div>
                          <div v-else style="display:flex; gap:3px;">
                            <input type="text" v-model="newTaskName" placeholder="New task" @keyup.enter="confirmNewTask('edit')" autofocus style="font-size:0.8rem; flex:1;" />
                            <button class="small success" @click="confirmNewTask('edit')"><i class="fas fa-check"></i></button>
                            <button class="small" @click="cancelNewTask"><i class="fas fa-times"></i></button>
                          </div>
                        </div>
                        <div class="input-group" style="margin:0;">
                          <label>Project</label>
                          <select v-model="editProject" style="font-size:0.8rem;">
                            <option value="">— No project —</option>
                            <option v-for="p in settings.custom_projects" :key="p" :value="p">{{ p }}</option>
                          </select>
                        </div>
                        <div class="input-group" style="margin:0; flex:2;">
                          <label>Note</label>
                          <input type="text" v-model="editNote" style="font-size:0.8rem;" />
                        </div>
                        <div style="display:flex; gap:4px; align-items:flex-end;">
                          <button class="small success" @click="saveEdit(entry.id)"><i class="fas fa-check"></i></button>
                          <button class="small" @click="editingId=null"><i class="fas fa-times"></i></button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
                <tr v-if="!filteredEntries.length">
                  <td colspan="8" style="text-align:center; opacity:0.5; padding:20px;">No entries.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="filteredEntries.length" style="font-size:0.75rem; opacity:0.6; margin-top:5px; text-align:right;">
            {{ filteredEntries.length }} entries · {{ formatHours(filteredTotalHours) }} total
          </div>
        </section>
      </div>

      <!-- ══════════════ RIGHT COLUMN ══════════════ -->
      <div class="tt-col">

        <!-- Yearly overview -->
        <section class="tt-section">
          <h3><i class="fas fa-calendar icon-muted"></i> Year {{ currentYear }} Overview</h3>
          <div class="tt-year-grid">
            <div class="tt-stat">
              <div class="tt-stat-value" :class="vacationRemaining < 5 ? 'negative' : 'positive'">
                {{ vacationRemaining }}
              </div>
              <div class="tt-stat-label">Vacation left</div>
            </div>
            <div class="tt-stat">
              <div class="tt-stat-value">{{ vacationUsedThisYear }}</div>
              <div class="tt-stat-label">Vacation used</div>
            </div>
            <div class="tt-stat">
              <div class="tt-stat-value">{{ settings.vacation_days_per_year }}</div>
              <div class="tt-stat-label">Vacation total</div>
            </div>
            <div class="tt-stat" :class="sickDaysThisYear > 10 ? 'negative' : ''">
              <div class="tt-stat-value">{{ sickDaysThisYear }}</div>
              <div class="tt-stat-label">Sick days</div>
            </div>
          </div>
          <div class="tt-progress-bar" style="margin-top:8px;">
            <div class="tt-progress-fill"
              :style="{ width: Math.min(100, (vacationUsedThisYear / settings.vacation_days_per_year) * 100) + '%', background: 'var(--warning, #f59e0b)' }"></div>
          </div>
          <div style="font-size:0.72rem; opacity:0.6; margin-top:4px; text-align:right;">
            {{ vacationUsedThisYear }} / {{ settings.vacation_days_per_year }} vacation days used
          </div>
        </section>

        <!-- Daily hours chart -->
        <section class="tt-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h3 style="margin:0;"><i class="fas fa-chart-bar icon-muted"></i> Daily Hours</h3>
            <select v-model="chartPeriod" style="font-size:0.78rem; padding:3px 8px; width:auto;">
              <option value="week">This week</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="year">This year (monthly)</option>
            </select>
          </div>
          <div ref="dailyChartEl" class="tt-chart"></div>
        </section>

        <!-- Breakdown charts -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-pie icon-muted"></i> Breakdown ({{ chartPeriodLabel }})</h3>
          <div class="tt-breakdown-grid">
            <div>
              <div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px; text-align:center;">By Task</div>
              <div ref="taskChartEl" class="tt-chart-sm"></div>
            </div>
            <div>
              <div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px; text-align:center;">By Project</div>
              <div ref="projectChartEl" class="tt-chart-sm"></div>
            </div>
          </div>
        </section>

        <!-- Weekly trend -->
        <section class="tt-section">
          <h3><i class="fas fa-chart-line icon-muted"></i> Weekly Trend (last 8 weeks)</h3>
          <div ref="trendChartEl" class="tt-chart"></div>
        </section>

        <!-- Settings -->
        <section class="tt-section">
          <h3><i class="fas fa-gear icon-muted"></i> Settings</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
            <div class="input-group">
              <label>Weekly hours</label>
              <input type="number" min="1" max="80" v-model.number="settings.weekly_hours" @change="saveSettings" />
            </div>
            <div class="input-group">
              <label>Vacation days/year</label>
              <input type="number" min="0" max="60" v-model.number="settings.vacation_days_per_year" @change="saveSettings" />
            </div>
            <div class="input-group">
              <label>Timezone</label>
              <input type="text" v-model="settings.timezone" placeholder="Europe/Berlin" @change="saveSettings" />
            </div>
          </div>
          <label class="checkbox-label" style="display:flex; align-items:center; gap:6px; margin-bottom:10px; font-size:0.78rem;">
            <input type="checkbox" v-model="settings.privacy_mode" @change="saveSettings" />
            <i class="fas fa-eye-slash" style="opacity:.6;"></i>
            Privacy mode — hide live timer in the header (shows greyed-out 00:00:00)
          </label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="input-group">
              <label>Task categories (one per line)</label>
              <textarea
                :value="settings.custom_tasks.join('\n')"
                @change="e => { settings.custom_tasks = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); saveSettings() }"
                rows="7" style="font-size:0.78rem; font-family:monospace;"
              ></textarea>
            </div>
            <div class="input-group">
              <label>Projects (one per line)</label>
              <textarea
                :value="settings.custom_projects.join('\n')"
                @change="e => { settings.custom_projects = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); saveSettings() }"
                rows="7" style="font-size:0.78rem; font-family:monospace;"
                placeholder="Auto-populated when you log new project names"
              ></textarea>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import * as XLSX from 'xlsx'
import { db } from '../services/supabase'
import { useLabStore } from '../stores/labStore'
import { ttBumpCounter, bumpTT } from '../composables/timeTrackerBus'

const store = useLabStore()

// ── State ─────────────────────────────────────────────────────────────────────

const entries  = ref([])
const absences = ref([])

const settings = reactive({
  weekly_hours:           40,
  vacation_days_per_year: 30,
  timezone:               'Europe/Berlin',
  privacy_mode:           false,
  custom_tasks: [
    'Lab Work','Meeting','Data Analysis','Writing','Admin',
    'Teaching','Coding','Literature','Break',
    'Conference','Superuser Duties','Group Task','Other',
  ],
  custom_projects: [],
})

// Check-in form
const pendingTask    = ref('Lab Work')
const pendingProject = ref('')
const pendingNote    = ref('')
const isSaving       = ref(false)

// Nachbuchen form
const showNachbuchen = ref(false)
const nbDate    = ref('')
const nbFrom    = ref('09:00')
const nbTo      = ref('17:00')
const nbTask    = ref('Lab Work')
const nbProject = ref('')
const nbNote    = ref('')

// Absence form
const absDate = ref('')
const absType = ref('sick')
const absHalf = ref(false)
const absNote = ref('')

// History edit
const editingId   = ref(null)
const editIn      = ref('')
const editOut     = ref('')
const editTask    = ref('')
const editProject = ref('')
const editNote    = ref('')

// Filters & chart
const filterFrom  = ref('')
const filterTo    = ref('')
const chartPeriod = ref('week')

// Inline new-project picker state
const newProjectFor  = ref(null)   // 'pending' | 'nb' | null
const newProjectName = ref('')

function setProjectField(field, val) {
  if (field === 'pending') pendingProject.value = val
  else if (field === 'nb') nbProject.value = val
}
function onProjectChange(field, val) {
  if (val === '__new__') {
    newProjectFor.value  = field
    newProjectName.value = ''
    setProjectField(field, '')
  } else {
    setProjectField(field, val)
  }
}
async function confirmNewProject(field) {
  const name = newProjectName.value.trim()
  if (!name) { cancelNewProject(); return }
  await ensureProjectSaved(name)
  setProjectField(field, name)
  newProjectFor.value = null
  newProjectName.value = ''
}
function cancelNewProject() {
  newProjectFor.value  = null
  newProjectName.value = ''
}

// Inline new-task picker state (mirrors project picker)
const newTaskFor  = ref(null)   // 'pending' | 'nb' | 'edit' | 'active' | null
const newTaskName = ref('')

function setTaskField(field, val) {
  if (field === 'pending')      pendingTask.value = val
  else if (field === 'nb')      nbTask.value      = val
  else if (field === 'edit')    editTask.value    = val
  else if (field === 'active')  switchTask(val)
}
async function ensureTaskSaved(name) {
  const trimmed = (name || '').trim()
  if (!trimmed || settings.custom_tasks.includes(trimmed)) return
  settings.custom_tasks = [...settings.custom_tasks, trimmed]
  await saveSettings()
}
function onTaskChange(field, val) {
  if (val === '__new__') {
    newTaskFor.value  = field
    newTaskName.value = ''
  } else {
    setTaskField(field, val)
  }
}
async function confirmNewTask(field) {
  const name = newTaskName.value.trim()
  if (!name) { cancelNewTask(); return }
  await ensureTaskSaved(name)
  setTaskField(field, name)
  newTaskFor.value = null
  newTaskName.value = ''
}
function cancelNewTask() {
  newTaskFor.value  = null
  newTaskName.value = ''
}

// Live clock
const now = ref(new Date())
let clockTimer = null

// Chart refs
const dailyChartEl   = ref(null)
const taskChartEl    = ref(null)
const projectChartEl = ref(null)
const trendChartEl   = ref(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = computed(() => new Date().toISOString().split('T')[0])
const currentYear = computed(() => new Date().getFullYear())

function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  dt.setHours(0, 0, 0, 0)
  return dt
}

function entryMinutes(e) {
  if (!e.checked_out) return 0
  return (new Date(e.checked_out) - new Date(e.checked_in)) / 60000
}

function isNachbuchung(entry) {
  if (!entry.created_at || !entry.checked_in) return false
  return (new Date(entry.created_at) - new Date(entry.checked_in)) > 3600000
}

function toDatetimeLocal(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── Computed ──────────────────────────────────────────────────────────────────

const activeEntry = computed(() =>
  entries.value.find(e => !e.checked_out) || null
)

const currentDuration = computed(() =>
  activeEntry.value ? now.value - new Date(activeEntry.value.checked_in) : 0
)

const projectSuggestions = computed(() => {
  const set = new Set([
    ...settings.custom_projects,
    ...entries.value.map(e => e.project).filter(Boolean),
  ])
  return [...set].sort()
})

const thisWeekStart = computed(() => getMonday(now.value))

// Weekend hours count as immediate overtime — split weekday vs weekend.
const thisWeekdayHours = computed(() =>
  entries.value
    .filter(e => { const d = new Date(e.checked_in); return d >= thisWeekStart.value && d.getDay() !== 0 && d.getDay() !== 6 })
    .reduce((s, e) => s + entryMinutes(e), 0) / 60
)
const thisWeekendHours = computed(() =>
  entries.value
    .filter(e => { const d = new Date(e.checked_in); return d >= thisWeekStart.value && (d.getDay() === 0 || d.getDay() === 6) })
    .reduce((s, e) => s + entryMinutes(e), 0) / 60
)
const thisWeekHours = computed(() => thisWeekdayHours.value + thisWeekendHours.value)

const todayHours = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return (entries.value
    .filter(e => new Date(e.checked_in) >= today)
    .reduce((s, e) => s + entryMinutes(e), 0) / 60).toFixed(1)
})

// Vacation/sick days within the current week reduce the required hours
// proportionally (1 day = weekly_hours / 5).
const thisWeekAbsenceDays = computed(() =>
  absences.value
    .filter(a => {
      const [y, m, d] = a.date.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      return dt >= thisWeekStart.value && dt.getDay() !== 0 && dt.getDay() !== 6
    })
    .reduce((s, a) => s + (a.half_day ? 0.5 : 1), 0)
)
const effectiveWeeklyHours = computed(() =>
  Math.max(0, settings.weekly_hours - (settings.weekly_hours / 5) * thisWeekAbsenceDays.value)
)

// Overtime = weekday deficit/surplus (vs effective target) + all weekend hours
const overtime    = computed(() => (thisWeekdayHours.value - effectiveWeeklyHours.value) + thisWeekendHours.value)
// Progress bar tracks only weekday hours against the effective target
const weekPercent = computed(() =>
  effectiveWeeklyHours.value > 0 ? (thisWeekdayHours.value / effectiveWeeklyHours.value) * 100 : 0
)

const isWeekendToday = computed(() => { const d = now.value.getDay(); return d === 0 || d === 6 })

const chartPeriodLabel = computed(() => {
  if (chartPeriod.value === 'week') return 'this week'
  if (chartPeriod.value === 'year') return 'this year'
  return `last ${chartPeriod.value} days`
})

const filteredEntries = computed(() => {
  let list = [...entries.value].sort((a, b) => new Date(b.checked_in) - new Date(a.checked_in))
  if (filterFrom.value) list = list.filter(e => new Date(e.checked_in) >= new Date(filterFrom.value))
  if (filterTo.value) {
    const to = new Date(filterTo.value); to.setHours(23, 59, 59, 999)
    list = list.filter(e => new Date(e.checked_in) <= to)
  }
  return list
})

const filteredTotalHours = computed(() =>
  filteredEntries.value.reduce((s, e) => s + entryMinutes(e), 0) / 60
)

// Absences
const absencesSorted = computed(() =>
  [...absences.value].sort((a, b) => b.date.localeCompare(a.date))
)

const thisYearAbsences = computed(() => {
  const yr = currentYear.value
  return absences.value.filter(a => parseInt(a.date.split('-')[0]) === yr)
})

const sickDaysThisYear = computed(() =>
  thisYearAbsences.value
    .filter(a => a.type === 'sick')
    .reduce((s, a) => s + (a.half_day ? 0.5 : 1), 0)
)

const vacationUsedThisYear = computed(() =>
  thisYearAbsences.value
    .filter(a => a.type === 'vacation')
    .reduce((s, a) => s + (a.half_day ? 0.5 : 1), 0)
)

const vacationRemaining = computed(() =>
  settings.vacation_days_per_year - vacationUsedThisYear.value
)

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatHours(h) {
  const abs = Math.abs(h), sign = h < 0 ? '-' : ''
  const hh = Math.floor(abs), mm = Math.round((abs - hh) * 60)
  return mm > 0 ? `${sign}${hh}h ${mm}m` : `${sign}${hh}h`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function loadEntries() {
  if (!store.user) return
  const { data } = await db.from('time_entries').select('*')
    .eq('owner_id', store.user.id).order('checked_in', { ascending: false }).limit(500)
  if (data) entries.value = data
}

async function loadAbsences() {
  if (!store.user) return
  const { data } = await db.from('time_absences').select('*')
    .eq('owner_id', store.user.id).order('date', { ascending: false })
  if (data) absences.value = data
}

async function loadSettings() {
  if (!store.user) return
  const { data } = await db.from('time_settings').select('*')
    .eq('owner_id', store.user.id).single()
  if (data) {
    settings.weekly_hours           = data.weekly_hours           ?? 40
    settings.vacation_days_per_year = data.vacation_days_per_year ?? 30
    settings.timezone               = data.timezone               ?? 'Europe/Berlin'
    settings.privacy_mode           = data.privacy_mode           ?? false
    settings.custom_tasks           = data.custom_tasks           ?? settings.custom_tasks
    settings.custom_projects        = data.custom_projects        ?? []
  }
}

async function saveSettings() {
  if (!store.user) return
  await db.from('time_settings').upsert({
    owner_id:               store.user.id,
    weekly_hours:           settings.weekly_hours,
    vacation_days_per_year: settings.vacation_days_per_year,
    timezone:               settings.timezone,
    privacy_mode:           settings.privacy_mode,
    custom_tasks:           settings.custom_tasks,
    custom_projects:        settings.custom_projects,
  }, { onConflict: 'owner_id' })
  bumpTT()  // privacy toggle should immediately update the header
}

// Auto-add new project name to the user's persistent project list.
async function ensureProjectSaved(name) {
  const trimmed = (name || '').trim()
  if (!trimmed || settings.custom_projects.includes(trimmed)) return
  settings.custom_projects = [...settings.custom_projects, trimmed].sort()
  await saveSettings()
}

// Seamless task change while checked in: close current entry and open a new one
// at the same instant, preserving project and clearing note.
async function switchTask(newTask) {
  if (!store.user || !activeEntry.value || activeEntry.value.task === newTask) return
  isSaving.value = true
  const t = new Date().toISOString()
  await db.from('time_entries').update({ checked_out: t }).eq('id', activeEntry.value.id)
  await db.from('time_entries').insert({
    owner_id:   store.user.id,
    checked_in: t,
    task:       newTask,
    project:    activeEntry.value.project,
    note:       '',
  })
  await loadEntries()
  isSaving.value = false
  renderCharts()
  bumpTT()
}

async function toggleCheckIn() {
  if (!store.user) return
  isSaving.value = true
  if (activeEntry.value) {
    await db.from('time_entries').update({ checked_out: new Date().toISOString() })
      .eq('id', activeEntry.value.id)
  } else {
    await ensureProjectSaved(pendingProject.value)
    await db.from('time_entries').insert({
      owner_id:   store.user.id,
      checked_in: new Date().toISOString(),
      task:       pendingTask.value,
      project:    pendingProject.value.trim(),
      note:       pendingNote.value.trim(),
    })
    pendingNote.value = ''
  }
  await loadEntries()
  isSaving.value = false
  renderCharts()
  bumpTT()
}

async function submitNachbuchen() {
  if (!store.user || !nbDate.value || !nbFrom.value || !nbTo.value) return
  const ci = new Date(`${nbDate.value}T${nbFrom.value}`)
  const co = new Date(`${nbDate.value}T${nbTo.value}`)
  if (co <= ci) { alert('End time must be after start time.'); return }
  isSaving.value = true
  await ensureProjectSaved(nbProject.value)
  await db.from('time_entries').insert({
    owner_id:    store.user.id,
    checked_in:  ci.toISOString(),
    checked_out: co.toISOString(),
    task:        nbTask.value,
    project:     nbProject.value.trim(),
    note:        nbNote.value.trim(),
    // created_at defaults to now() — marks this as Nachbuchung
  })
  await loadEntries()
  isSaving.value = false
  nbNote.value = ''; nbProject.value = ''
  showNachbuchen.value = false
  renderCharts()
  bumpTT()
}

async function addAbsence() {
  if (!store.user || !absDate.value) return
  isSaving.value = true
  const { data } = await db.from('time_absences').insert({
    owner_id: store.user.id,
    date:     absDate.value,
    type:     absType.value,
    half_day: absHalf.value,
    note:     absNote.value.trim(),
  }).select().single()
  if (data) absences.value.unshift(data)
  absNote.value = ''; absHalf.value = false
  isSaving.value = false
  bumpTT()
}

async function deleteAbsence(id) {
  if (!confirm('Delete this absence entry?')) return
  await db.from('time_absences').delete().eq('id', id)
  absences.value = absences.value.filter(a => a.id !== id)
  bumpTT()
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return
  await db.from('time_entries').delete().eq('id', id)
  entries.value = entries.value.filter(e => e.id !== id)
  renderCharts()
  bumpTT()
}

function startEdit(entry) {
  editingId.value   = entry.id
  editIn.value      = toDatetimeLocal(entry.checked_in)
  editOut.value     = toDatetimeLocal(entry.checked_out)
  editTask.value    = entry.task
  editProject.value = entry.project
  editNote.value    = entry.note
}

async function saveEdit(id) {
  const patch = {
    checked_in:  new Date(editIn.value).toISOString(),
    checked_out: editOut.value ? new Date(editOut.value).toISOString() : null,
    task: editTask.value, project: editProject.value.trim(), note: editNote.value.trim(),
  }
  await ensureProjectSaved(editProject.value)
  await db.from('time_entries').update(patch).eq('id', id)
  const idx = entries.value.findIndex(e => e.id === id)
  if (idx >= 0) Object.assign(entries.value[idx], patch)
  editingId.value = null
  renderCharts()
  bumpTT()
}

// ── Export ────────────────────────────────────────────────────────────────────

// ── Excel Export (per-month sheets with embedded charts) ──────────────────────

async function exportXlsx() {
  isSaving.value = true
  try {
    const wb   = XLSX.utils.book_new()
    const name = store.user?.email?.split('@')[0] ?? 'user'

    // Collect all months that have entries, plus current month.
    const monthSet = new Set(
      entries.value.map(e => {
        const d = new Date(e.checked_in)
        return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`
      })
    )
    const today = new Date()
    monthSet.add(`${today.getFullYear()}-${String(today.getMonth()).padStart(2,'0')}`)

    const months = [...monthSet]
      .map(k => { const [y, m] = k.split('-'); return { year: +y, month: +m } })
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

    for (const { year, month } of months) {
      const mEntries  = entries.value.filter(e => {
        const d = new Date(e.checked_in)
        return d.getFullYear() === year && d.getMonth() === month
      })
      const mAbsences = absences.value.filter(a => {
        const [ay, am] = a.date.split('-').map(Number)
        return ay === year && (am - 1) === month
      })

      const sheetName = new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
      const ws = buildMonthSheet(year, month, mEntries, mAbsences, name)

      // Generate Plotly chart and embed as PNG
      try {
        const chartPng = await renderMonthChart(year, month, mEntries)
        if (chartPng) {
          const dataRow = (ws['!lastrow'] ?? 0) + 3
          if (!ws['!images']) ws['!images'] = []
          ws['!images'].push({
            '!data': chartPng,
            '!ext': '.png',
            '!pos': { r: dataRow, c: 0, x: 0, y: 0, w: 7315200, h: 3200400 },
          })
          // Reserve rows so the chart area is visible
          ws['!rows'] = ws['!rows'] || []
          for (let r = dataRow; r < dataRow + 22; r++) ws['!rows'][r] = { hpt: 18 }
        }
      } catch (_) { /* chart embed failed — sheet still has data */ }

      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    // Final sheet: Year summary
    XLSX.utils.book_append_sheet(wb, buildYearSummarySheet(), `Year ${currentYear.value}`)

    XLSX.writeFile(wb, `WorkProtocol_${name}_${currentYear.value}.xlsx`, { bookImages: true })
  } finally {
    isSaving.value = false
  }
}

function buildMonthSheet(year, month, mEntries, mAbsences, ownerName) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const dInMonth   = new Date(year, month + 1, 0).getDate()
  const totalH     = mEntries.reduce((s, e) => s + entryMinutes(e), 0) / 60
  const reqH       = settings.weekly_hours * (dInMonth / 7)
  const ot         = totalH - reqH
  const daysWorked = new Set(mEntries.filter(e => e.checked_out).map(e =>
    new Date(e.checked_in).toISOString().split('T')[0]
  )).size
  const mSick    = mAbsences.filter(a => a.type === 'sick').reduce((s, a) => s + (a.half_day ? .5 : 1), 0)
  const mVac     = mAbsences.filter(a => a.type === 'vacation').reduce((s, a) => s + (a.half_day ? .5 : 1), 0)

  const DAYS_DE = ['So','Mo','Di','Mi','Do','Fr','Sa']
  const rows    = []

  // ── Header block ──────────────────────────────────────────────────────────
  rows.push(['ARBEITSZEITPROTOKOLL / WORK TIME PROTOCOL'])
  rows.push([])
  rows.push(['Name / Email:', ownerName])
  rows.push(['Monat / Month:', monthLabel])
  rows.push(['Wochenstunden / Weekly target:', `${settings.weekly_hours} h`])
  rows.push([])

  // ── Monthly summary ────────────────────────────────────────────────────────
  rows.push(['─── MONATSÜBERSICHT / MONTHLY SUMMARY ───'])
  rows.push([
    'Geleistete Stunden', 'Soll-Stunden', 'Überstunden', 'Arbeitstage', 'Kranktage', 'Urlaubstage',
  ])
  rows.push([
    +totalH.toFixed(2),
    +reqH.toFixed(2),
    +ot.toFixed(2),
    daysWorked,
    mSick,
    mVac,
  ])
  rows.push([])

  // ── Daily entries table ────────────────────────────────────────────────────
  rows.push(['─── TAGESEINTRÄGE / DAILY ENTRIES ───'])
  rows.push(['Datum','Tag','Check-In','Check-Out','Std.','Aufgabe','Projekt','Notiz','NB'])

  let currentWeek = null
  let weekH = 0
  const sortedEntries = [...mEntries].sort((a, b) => new Date(a.checked_in) - new Date(b.checked_in))

  for (const e of sortedEntries) {
    const d    = new Date(e.checked_in)
    const week = getMonday(d).toISOString().split('T')[0]

    if (currentWeek !== null && week !== currentWeek) {
      // Week subtotal separator
      rows.push(['', '', '', 'KW-Summe →', +weekH.toFixed(2), '', '', '', ''])
      rows.push([])
      weekH = 0
    }
    currentWeek = week

    const h = entryMinutes(e) / 60
    weekH += h
    rows.push([
      d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' }),
      DAYS_DE[d.getDay()],
      formatTime(e.checked_in),
      e.checked_out ? formatTime(e.checked_out) : '(laufend)',
      e.checked_out ? +h.toFixed(2) : '',
      e.task,
      e.project || '',
      e.note   || '',
      isNachbuchung(e) ? 'NB' : '',
    ])
  }
  if (currentWeek !== null) {
    rows.push(['', '', '', 'KW-Summe →', +weekH.toFixed(2), '', '', '', ''])
  }
  rows.push([])
  rows.push(['', '', '', 'MONATSSUMME →', +totalH.toFixed(2), '', '', '', ''])
  rows.push([])

  // ── Absences ───────────────────────────────────────────────────────────────
  if (mAbsences.length) {
    rows.push(['─── ABWESENHEITEN / ABSENCES ───'])
    rows.push(['Datum','Art','Dauer','Notiz'])
    for (const a of mAbsences.sort((x, y) => x.date.localeCompare(y.date))) {
      rows.push([
        a.date,
        a.type === 'sick' ? 'Krank / Sick' : 'Urlaub / Vacation',
        a.half_day ? 'Halbtag' : 'Ganztag',
        a.note || '',
      ])
    }
    rows.push([])
  }

  // ── Chart placeholder label ────────────────────────────────────────────────
  rows.push(['─── STUNDENDIAGRAMM / HOURS CHART ───'])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!lastrow'] = rows.length

  ws['!cols'] = [
    { wch: 12 }, { wch: 5 }, { wch: 9 }, { wch: 9 }, { wch: 7 },
    { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 4 },
  ]

  // Merge title cell across columns A–I
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]

  return ws
}

async function renderMonthChart(year, month, mEntries) {
  const dInMonth = new Date(year, month + 1, 0).getDate()
  const days     = Array.from({ length: dInMonth }, (_, i) => i + 1)
  const hours    = days.map(d => {
    const start = new Date(year, month, d)
    const end   = new Date(year, month, d + 1)
    return mEntries
      .filter(e => e.checked_out && new Date(e.checked_in) >= start && new Date(e.checked_in) < end)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
  })
  const labels   = days.map(d => `${String(d).padStart(2,'0')}.${String(month+1).padStart(2,'0')}`)
  const dailyReq = settings.weekly_hours / 5

  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:350px;'
  document.body.appendChild(div)

  try {
    await Plotly.react(div, [
      {
        type: 'bar', x: labels, y: hours.map(h => +h.toFixed(2)), name: 'Hours',
        marker: { color: hours.map(h => h >= dailyReq ? '#10b981' : h > 0 ? '#3b82f6' : '#e5e7eb') },
        hoverinfo: 'none',
      },
      {
        type: 'scatter', mode: 'lines', x: labels, y: Array(dInMonth).fill(dailyReq),
        line: { color: '#ef4444', width: 1.5, dash: 'dot' }, name: 'Target', hoverinfo: 'none',
      },
    ], {
      paper_bgcolor: '#ffffff', plot_bgcolor: '#f9fafb',
      font: { color: '#1f2937', size: 11, family: 'Arial' },
      margin: { l: 55, r: 20, b: 60, t: 30 },
      xaxis: { title: { text: 'Day', font: { size: 11 } }, tickangle: -45, gridcolor: '#e5e7eb' },
      yaxis: { title: { text: 'Hours', font: { size: 11 } }, gridcolor: '#e5e7eb', rangemode: 'tozero' },
      showlegend: true,
      legend: { orientation: 'h', y: 1.1, x: 0 },
      title: {
        text: `Work Hours — ${new Date(year, month, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
        font: { size: 13 },
      },
    }, { staticPlot: true })

    const dataUrl = await Plotly.toImage(div, { format: 'png', width: 800, height: 350, scale: 2 })
    return dataUrl.replace(/^data:image\/png;base64,/, '')
  } finally {
    Plotly.purge(div)
    document.body.removeChild(div)
  }
}

function buildYearSummarySheet() {
  const yr     = currentYear.value
  const monday = getMonday(new Date())
  const rows   = []

  rows.push([`JAHRESÜBERSICHT / YEAR SUMMARY ${yr}`])
  rows.push([])
  rows.push(['URLAUBSKONTO / VACATION BALANCE'])
  rows.push(['Anspruch / Total',        settings.vacation_days_per_year])
  rows.push(['Genommen / Used',         vacationUsedThisYear.value])
  rows.push(['Verbleibend / Remaining', vacationRemaining.value])
  rows.push([])
  rows.push(['Kranktage / Sick days (YTD)', sickDaysThisYear.value])
  rows.push([])
  rows.push(['─── WOCHENÜBERSICHT / WEEKLY OVERVIEW ───'])
  rows.push(['Woche / Week','Std. geleistet','Soll','Überstunden'])

  for (let w = 25; w >= 0; w--) {
    const wStart = new Date(monday); wStart.setDate(wStart.getDate() - w * 7)
    const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7)
    const h = entries.value
      .filter(e => e.checked_out && new Date(e.checked_in) >= wStart && new Date(e.checked_in) < wEnd)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
    const label = wStart.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
    rows.push([label, +h.toFixed(2), settings.weekly_hours, +(h - settings.weekly_hours).toFixed(2)])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 14 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  return ws
}

// ── Charts ────────────────────────────────────────────────────────────────────

function plotLayout() {
  const dark = store.isDarkMode
  return {
    paper_bgcolor: dark ? '#111827' : '#ffffff',
    plot_bgcolor:  dark ? '#111827' : '#ffffff',
    font:          { color: dark ? '#f3f4f6' : '#1f2937', size: 11 },
    margin:        { l: 40, r: 10, b: 40, t: 10 },
    xaxis:         { gridcolor: dark ? '#374151' : '#e5e7eb' },
    yaxis:         { gridcolor: dark ? '#374151' : '#e5e7eb' },
    showlegend:    false,
  }
}

function getPeriodCutoff() {
  if (chartPeriod.value === 'week')  return new Date(thisWeekStart.value)
  if (chartPeriod.value === 'year') { const d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0); return d }
  const d = new Date(); d.setDate(d.getDate() - parseInt(chartPeriod.value)); d.setHours(0,0,0,0)
  return d
}
function getPeriodEntries() {
  const cutoff = getPeriodCutoff()
  return entries.value.filter(e => e.checked_out && new Date(e.checked_in) >= cutoff)
}

function renderCharts() {
  nextTick(() => {
    renderDailyChart()
    renderBreakdownCharts()
    renderTrendChart()
    // Force Plotly to recompute against the (possibly aspect-ratio-driven) container size
    ;[dailyChartEl, taskChartEl, projectChartEl, trendChartEl].forEach(el => {
      if (el.value) try { Plotly.Plots.resize(el.value) } catch(_) {}
    })
  })
}

function renderDailyChart() {
  if (!dailyChartEl.value) return
  const pEntries = getPeriodEntries()

  // ── Year mode: aggregate hours per month ────────────────────────────────────
  if (chartPeriod.value === 'year') {
    const yr = new Date().getFullYear()
    const monthHours = Array(12).fill(0)
    for (const e of pEntries) {
      const d = new Date(e.checked_in)
      if (d.getFullYear() === yr) monthHours[d.getMonth()] += entryMinutes(e) / 60
    }
    if (activeEntry.value) {
      const d = new Date(activeEntry.value.checked_in)
      if (d.getFullYear() === yr) {
        monthHours[d.getMonth()] += (now.value - d) / 3600000
      }
    }
    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthlyTarget = settings.weekly_hours * 4.33   // ~weeks per month
    const layout = plotLayout()
    layout.yaxis.title = { text: 'h', font: { size: 10 } }
    layout.shapes = [{ type:'line', x0:monthLabels[0], x1:monthLabels[11], y0:monthlyTarget, y1:monthlyTarget,
      line:{ color:'rgba(239,68,68,.6)', width:1.5, dash:'dot' } }]
    Plotly.react(dailyChartEl.value, [{
      type:'bar', x: monthLabels, y: monthHours.map(h => +h.toFixed(1)),
      marker:{ color: monthHours.map(h => h >= monthlyTarget ? 'rgba(16,185,129,.7)' : h > 0 ? 'rgba(99,102,241,.55)' : '#e5e7eb') },
      hovertemplate:'%{x}: %{y:.1f}h<extra></extra>',
    }], layout, { responsive:true, displayModeBar:false })
    return
  }

  const days     = chartPeriod.value === 'week' ? 7 : parseInt(chartPeriod.value)
  const dayMap   = new Map()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    dayMap.set(d.toISOString().split('T')[0], 0)
  }
  for (const e of pEntries) {
    const k = new Date(e.checked_in).toISOString().split('T')[0]
    if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) || 0) + entryMinutes(e) / 60)
  }
  // Add live duration of an active session to today's bar
  if (activeEntry.value) {
    const k = new Date(activeEntry.value.checked_in).toISOString().split('T')[0]
    if (dayMap.has(k)) {
      dayMap.set(k, (dayMap.get(k) || 0) + (now.value - new Date(activeEntry.value.checked_in)) / 3600000)
    }
  }
  const xDays  = [...dayMap.keys()]
  const yHours = [...dayMap.values()].map(h => +h.toFixed(2))
  const reqLine = settings.weekly_hours / 5
  const layout = plotLayout()
  layout.yaxis.title = { text: 'h', font: { size: 10 } }
  layout.shapes = [{ type:'line', x0:xDays[0], x1:xDays[xDays.length-1], y0:reqLine, y1:reqLine,
    line: { color:'rgba(239,68,68,.6)', width:1.5, dash:'dot' } }]
  Plotly.react(dailyChartEl.value, [{
    type:'bar', x:xDays, y:yHours,
    marker:{ color: yHours.map(h => h >= reqLine ? 'rgba(16,185,129,.7)' : 'rgba(99,102,241,.55)') },
    hovertemplate:'%{x|%a %d.%m}<br>%{y:.1f}h<extra></extra>',
  }], layout, { responsive:true, displayModeBar:false })
}

function renderBreakdownCharts() {
  if (!taskChartEl.value || !projectChartEl.value) return
  const pEntries = getPeriodEntries()
  const taskMap = {}, projMap = {}
  for (const e of pEntries) {
    const h = entryMinutes(e) / 60
    taskMap[e.task] = (taskMap[e.task] || 0) + h
    if (e.project) projMap[e.project] = (projMap[e.project] || 0) + h
  }
  // Include the live active session so breakdown reflects current task in real time
  if (activeEntry.value) {
    const ai = new Date(activeEntry.value.checked_in)
    if (ai >= getPeriodCutoff()) {
      const liveH = (now.value - ai) / 3600000
      taskMap[activeEntry.value.task] = (taskMap[activeEntry.value.task] || 0) + liveH
      if (activeEntry.value.project)
        projMap[activeEntry.value.project] = (projMap[activeEntry.value.project] || 0) + liveH
    }
  }
  const pieLayout = { ...plotLayout(), margin:{ l:5,r:5,t:5,b:5 }, showlegend:true,
    legend:{ orientation:'h', y:-0.2, font:{ size:9 } } }
  Plotly.react(taskChartEl.value, [{
    type:'pie', labels:Object.keys(taskMap), values:Object.values(taskMap).map(h => +h.toFixed(2)),
    hovertemplate:'%{label}: %{value:.1f}h<extra></extra>', textinfo:'percent', hole:0.4,
  }], pieLayout, { responsive:true, displayModeBar:false })
  const pLabels = Object.keys(projMap)
  Plotly.react(projectChartEl.value, [{
    type:'pie',
    labels: pLabels.length ? pLabels : ['(no project)'],
    values: pLabels.length ? Object.values(projMap).map(h=>+h.toFixed(2)) : [0.01],
    hovertemplate:'%{label}: %{value:.1f}h<extra></extra>', textinfo:'percent', hole:0.4,
  }], pieLayout, { responsive:true, displayModeBar:false })
}

function renderTrendChart() {
  if (!trendChartEl.value) return
  const monday = getMonday(new Date())
  const labels = [], hours = []
  for (let w = 7; w >= 0; w--) {
    const wStart = new Date(monday); wStart.setDate(wStart.getDate() - w * 7)
    const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7)
    let h = entries.value
      .filter(e => e.checked_out && new Date(e.checked_in) >= wStart && new Date(e.checked_in) < wEnd)
      .reduce((s, e) => s + entryMinutes(e), 0) / 60
    if (activeEntry.value) {
      const ai = new Date(activeEntry.value.checked_in)
      if (ai >= wStart && ai < wEnd) h += (now.value - ai) / 3600000
    }
    const d = wStart
    labels.push(`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`)
    hours.push(+h.toFixed(2))
  }
  const layout = plotLayout()
  layout.yaxis.title = { text: 'h', font: { size: 10 } }
  layout.shapes = [{ type:'line', x0:labels[0], x1:labels[labels.length-1],
    y0:settings.weekly_hours, y1:settings.weekly_hours,
    line:{ color:'rgba(239,68,68,.6)', width:1.5, dash:'dot' } }]
  Plotly.react(trendChartEl.value, [
    { type:'bar', x:labels, y:hours, name:'h',
      marker:{ color: hours.map(h => h >= settings.weekly_hours ? 'rgba(16,185,129,.65)' : 'rgba(99,102,241,.55)') },
      hovertemplate:'Week of %{x}: %{y:.1f}h<extra></extra>' },
    { type:'scatter', mode:'lines+markers', x:labels, y:hours,
      line:{ color:'var(--primary)', width:2 }, marker:{ size:5 }, hoverinfo:'skip' },
  ], layout, { responsive:true, displayModeBar:false })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => store.isDarkMode, renderCharts)
watch(chartPeriod, renderCharts)
watch(entries, () => nextTick(renderCharts), { deep: true })
watch(absences, () => nextTick(renderCharts), { deep: true })
watch(() => settings.weekly_hours, renderCharts)
// Live: re-render all charts on every clock tick during an active session
watch(currentDuration, () => { if (activeEntry.value) renderCharts() })

// React to mutations from the TopBarClock (header check-in/out/switch)
watch(ttBumpCounter, async () => {
  await loadEntries()
  await loadAbsences()
  renderCharts()
})

onMounted(async () => {
  nbDate.value  = todayStr.value
  absDate.value = todayStr.value
  await loadSettings()
  await loadEntries()
  await loadAbsences()
  renderCharts()
  clockTimer = setInterval(() => { now.value = new Date() }, 10000)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  ;[dailyChartEl, taskChartEl, projectChartEl, trendChartEl]
    .forEach(el => { if (el.value) Plotly.purge(el.value) })
})
</script>

<style scoped>
.tt-header {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 15px;
}
.tt-header h2 { margin: 0; border: none; padding: 0; display: flex; align-items: center; gap: 10px; }

.tt-live-badge {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  border: 1px solid var(--success); font-size: 0.78rem; font-weight: 700;
  color: var(--success); letter-spacing: 0.4px;
}
.tt-live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--success);
  animation: tt-pulse 1.6s ease-in-out infinite;
}
@keyframes tt-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

.tt-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width:1100px) { .tt-layout { grid-template-columns: 1fr; } }
.tt-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

.tt-section {
  background: var(--panel-bg); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 6px 8px;
}
.tt-section-nb { border-color: var(--primary); border-style: dashed; }
.tt-section h3 {
  font-size: 0.78rem; color: var(--primary); margin: 0 0 5px;
  display: flex; align-items: center; gap: 5px;
  border-bottom: 1px solid var(--border); padding-bottom: 3px;
}

.tt-active-select {
  padding: 2px 6px; font-size: .8rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--input-bg);
}

.tt-form { display: flex; flex-direction: column; gap: 6px; }
.tt-form-row { display: flex; gap: 6px; flex-wrap: wrap; }
.tt-form-row .input-group { flex: 1; min-width: 70px; }

.tt-active-info {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  font-size: 0.8rem;
}

.tt-checkin-btn {
  width: 100%; padding: 12px; border: none; border-radius: var(--radius);
  font-size: 1rem; font-weight: 700; letter-spacing: 1px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  transition: filter .15s;
}
.tt-checkin-btn:hover:not(:disabled) { filter: brightness(.9); }
.tt-checkin-btn:disabled { opacity: .55; cursor: not-allowed; }
.tt-checkin-btn.checkin  { background: var(--success); color: #fff; }
.tt-checkin-btn.checkout { background: #ef4444; color: #fff; }

.tt-week-grid, .tt-year-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 5px; margin-bottom: 7px;
}
.tt-stat {
  text-align: center; padding: 5px 3px; border-radius: var(--radius);
  background: var(--input-bg); border: 1px solid var(--border);
}
.tt-stat-value { font-size: 0.95rem; font-weight: 700; }
.tt-stat-label { font-size: .62rem; opacity: .65; text-transform: uppercase; letter-spacing: .3px; margin-top: 1px; }
.tt-we-note { font-weight: 400; color: #ef4444; font-size: .6rem; }
.tt-stat.positive .tt-stat-value { color: var(--success); }
.tt-stat.negative .tt-stat-value { color: #ef4444; }

.tt-progress-bar {
  height: 8px; border-radius: 4px;
  background: var(--input-bg); border: 1px solid var(--border); overflow: hidden;
}
.tt-progress-fill { height: 100%; border-radius: 4px; transition: width .4s; }

.tt-table-wrap { max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.tt-table { width: 100%; border-collapse: collapse; font-size: .75rem; }
.tt-table th {
  position: sticky; top: 0; background: var(--input-bg); z-index: 1;
  padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border);
  font-size: .7rem; text-transform: uppercase; letter-spacing: .4px; opacity: .8;
}
.tt-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.tt-row-active td { background: color-mix(in srgb, var(--success) 8%, transparent); }
.tt-edit-row td { background: var(--summary-bg, #f8fafc); }

.tt-task-chip {
  display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: .7rem; white-space: nowrap;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
}
.tt-nb-badge {
  display: inline-block; padding: 0 5px; border-radius: 3px; font-size: .65rem; font-weight: 700;
  background: color-mix(in srgb, #f59e0b 20%, transparent); border: 1px solid #f59e0b; color: #b45309;
  margin-left: 4px; vertical-align: middle;
}
.tt-abs-chip {
  display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: .7rem; white-space: nowrap;
  border: 1px solid;
}
.tt-abs-chip.sick     { background: color-mix(in srgb,#ef4444 12%,transparent); border-color:#ef4444; color:#b91c1c; }
.tt-abs-chip.vacation { background: color-mix(in srgb,#3b82f6 12%,transparent); border-color:#3b82f6; color:#1d4ed8; }

.tt-project-cell { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85; }
.tt-note-cell    { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .7; }

.tt-edit-form { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-end; padding: 8px 0; }
.tt-edit-form .input-group { min-width: 120px; }

/* All charts share roughly the same aspect ratio for a tidy, quadratic look. */
.tt-chart    { width: 100%; aspect-ratio: 4 / 3; min-height: 240px; }
.tt-chart-sm { width: 100%; aspect-ratio: 1 / 1; min-height: 220px; }
.tt-breakdown-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tt-table-wrap { max-height: 220px !important; }

.icon-muted { opacity: .65; }
</style>
