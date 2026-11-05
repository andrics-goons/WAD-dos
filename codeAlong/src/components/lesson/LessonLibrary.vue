<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LessonStatus, Role, SessionStatus } from '@shared/constants.js'
import { useCourseStore } from '@/stores/course'
import { useLessonsStore } from '@/stores/lessons'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Lessons tab of the course page. Lessons sit in one folder per week ("Week 6"), and opening a
// folder shows its code files ("ICE", "Extra exercises"), each with the classes run from it.
// Each file has its own Start new session, which starts a class from that file's code.
// A course I've archived is read-only for me: its lessons and replays stay open, but nothing
// is added, started, changed or joined until I restore it.
// Owner: Ray Yien (started by Ying Qi as a working first version).
const props = defineProps({ course: { type: Object, required: true } })

const store = useCourseStore()
const lessonsStore = useLessonsStore()
const sessionStore = useSessionStore()
const toast = useToastStore()
const router = useRouter()

const isStaff = computed(() => [Role.PROF, Role.TA].includes(props.course.myRole))
const isProf = computed(() => props.course.myRole === Role.PROF)

const lessons = ref([])
const sessions = ref([])
const opened = ref({}) // week → is its folder open?
const loading = ref(true)
const loadError = ref('')
onMounted(async () => {
  try {
    ;[lessons.value, sessions.value] = await Promise.all([
      store.lessons(props.course.id),
      store.sessions(props.course.id),
    ])
    // start with live classes showing, so nobody has to hunt for the way in
    for (const s of sessions.value) {
      const lesson = lessons.value.find((l) => l.id === s.lesson_id)
      if (s.status === SessionStatus.LIVE && lesson) opened.value[lesson.week] = true
    }
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// archived lessons are out of use: hidden unless asked for. Students can ask too, since their
// past classes from those lessons (and the Replay links) are listed under them
const showArchived = ref(false)
const archivedCount = computed(
  () => lessons.value.filter((l) => l.status === LessonStatus.ARCHIVED).length,
)
const search = ref('')
const shownLessons = computed(() =>
  lessons.value.filter(
    (l) =>
      (showArchived.value || l.status !== LessonStatus.ARCHIVED) &&
      l.title.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
// one folder per week, in week order; lessons with no week go last
const folders = computed(() => {
  const byWeek = new Map()
  for (const l of shownLessons.value) {
    if (!byWeek.has(l.week)) byWeek.set(l.week, [])
    byWeek.get(l.week).push(l)
  }
  return [...byWeek]
    .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity)) // a moved folder lands in its place
    .map(([week, files]) => ({
      week,
      name: week ? `Week ${week}` : 'No week',
      files,
    }))
})

// the ✎ on a folder: give every file in it another week number, or a first one for "No week"
// (the week is just a number on each lesson, so this changes that number). Each folder keeps
// its own week: a week some other lesson already uses is refused, archived ones included
const editing = ref(null) // the name of the folder whose ✎ is open ("Week 2", "No week")
let editingFrom = null // that folder's week (null for "No week")
const newWeek = ref(null) // typed in, like the Week box on the New lesson page
const weekError = ref('')
const movingWeek = ref(false)
function editWeek(folder) {
  editing.value = folder.name
  editingFrom = folder.week
  newWeek.value = folder.week // empty for "No week"
  weekError.value = ''
}
async function moveWeek() {
  const from = editingFrom
  const to = newWeek.value
  // the same rule as the lessons table: a whole week from 1 to 13
  if (!Number.isInteger(to) || to < 1 || to > 13) {
    weekError.value = 'Enter a week from 1 to 13'
    return
  }
  if (to === from) {
    editing.value = null
    return
  }
  if (lessons.value.some((l) => l.week === to)) {
    weekError.value = `Week ${to} already has lessons. Pick a week that isn't used yet`
    return
  }
  movingWeek.value = true
  // every file in the week, including archived ones and any a search is hiding
  const moving = lessons.value.filter((l) => l.week === from)
  try {
    await Promise.all(moving.map((l) => lessonsStore.update(l.id, { week: to })))
    lessons.value = lessons.value.map((l) => (l.week === from ? { ...l, week: to } : l))
    opened.value[to] = opened.value[from]
    editing.value = null
    toast.show(`Moved to Week ${to}`, 'success')
  } catch (error) {
    // some may have moved: show what the database has now
    lessons.value = await store.lessons(props.course.id)
    toast.show(error.message, 'danger', { title: "Couldn't change the week" })
  } finally {
    movingWeek.value = false
  }
}
// the folder already says the week, so "Week 6 · Mini Cart" shows as "Mini Cart"
const fileName = (l) => l.title.replace(/^Week \d+\s*[·:-]\s*/i, '')
const classesOf = (lesson) => sessions.value.filter((s) => s.lesson_id === lesson.id)
const hasLiveClass = (lesson) => classesOf(lesson).some((s) => s.status === SessionStatus.LIVE)

const STATUS = {
  draft: { label: 'Draft', css: 'text-bg-warning' },
  ready: { label: 'Ready', css: 'text-bg-success' },
  archived: { label: 'Archived', css: 'text-bg-secondary' },
}
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// "Week 6 · Mini Cart" → "week-6-mini-cart", for the lesson-row / lesson-start test ids
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// the ⋯ menu on each lesson: one open at a time, closed by a click anywhere else
const menuFor = ref(null) // the lesson id whose menu is open
const whyNoDelete = ref(false) // the ? on a taught lesson's greyed-out Delete is open
function toggleMenu(lesson) {
  menuFor.value = menuFor.value === lesson.id ? null : lesson.id
  whyNoDelete.value = false
}
function closeMenu() {
  menuFor.value = null
  whyNoDelete.value = false
}
// a taught lesson can't be deleted: the replays and reports point at it
const noDeleteReason = (lesson) =>
  lesson.status === LessonStatus.ARCHIVED
    ? "It's been taught, so it can't be deleted."
    : "It's been taught, so it can't be deleted. Archive it instead."
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

// ready: students can see it and the prof can start a class. Hidden = draft. Archived:
// students still see its past classes, but no new class starts from it. Same as the switch on
// the lesson edit page, which also takes an archived lesson back to ready.
async function setStatus(lesson, status) {
  await lessonsStore.update(lesson.id, { status })
  lessons.value = lessons.value.map((l) => (l.id === lesson.id ? { ...l, status } : l))
}
// the Visibility switch (on = students can see it): saves the moment it's flipped, and the menu stays open
const savingVisible = ref(null) // the lesson whose switch is saving
async function setVisible(lesson, input) {
  savingVisible.value = lesson.id
  try {
    await setStatus(lesson, input.checked ? LessonStatus.READY : LessonStatus.DRAFT)
    toast.show(input.checked ? 'Students can see this lesson' : 'Hidden from students', 'success')
  } catch (error) {
    input.checked = !input.checked // put the switch back
    toast.show(error.message, 'danger', { title: "Couldn't change who can see the lesson" })
  } finally {
    savingVisible.value = null
  }
}

async function unarchive(lesson) {
  closeMenu()
  try {
    await setStatus(lesson, LessonStatus.READY)
    toast.show('Lesson unarchived', 'success')
  } catch (error) {
    toast.show(error.message, 'danger', { title: "Couldn't unarchive the lesson" })
  }
}

const archiving = ref(null) // the lesson waiting for "Archive lesson?"
const archiveBusy = ref(false)
function askArchive(lesson) {
  closeMenu()
  archiving.value = lesson
}
async function archive() {
  archiveBusy.value = true
  try {
    await setStatus(archiving.value, LessonStatus.ARCHIVED)
    archiving.value = null
    toast.show('Lesson archived', 'success')
  } catch (error) {
    toast.show(error.message, 'danger', { title: "Couldn't archive the lesson" })
  } finally {
    archiveBusy.value = false
  }
}

// Delete: only a lesson no class has run from (the replays and reports point at it otherwise,
// and the database refuses too); a taught one is archived instead
const deleting = ref(null) // the lesson waiting for "Delete this lesson?"
const deleteBusy = ref(false)
function askDelete(lesson) {
  closeMenu()
  deleting.value = lesson
}
async function removeLesson() {
  deleteBusy.value = true
  try {
    await lessonsStore.remove(deleting.value.id)
    lessons.value = lessons.value.filter((l) => l.id !== deleting.value.id)
    deleting.value = null
    toast.show('Lesson deleted', 'success')
  } catch (error) {
    deleting.value = null
    // taught since this page loaded
    const message =
      error.code === 'CONFLICT' ? 'It has been taught, so archive it instead' : error.message
    toast.show(message, 'danger', { title: "Couldn't delete the lesson" })
  } finally {
    deleteBusy.value = false
  }
}

const starting = ref(null)
// Only a ready lesson can start a class, so starting from a draft publishes it first: students
// see it from now on, which they would once class starts anyway
async function startClass(lesson) {
  starting.value = lesson.id
  try {
    if (lesson.status === LessonStatus.DRAFT) {
      await lessonsStore.update(lesson.id, { status: LessonStatus.READY })
      lesson.status = LessonStatus.READY
    }
    const session = await sessionStore.start(lesson.id)
    router.push({ name: 'teach', params: { id: session.id } })
  } catch (error) {
    toast.show(error.message, 'danger')
    starting.value = null
  }
}
</script>

<template>
  <section>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <label class="visually-hidden" for="lesson-search">Search lessons</label>
      <input
        id="lesson-search"
        v-model="search"
        class="ca-input w-auto flex-grow-1"
        placeholder="Search lessons"
      />
      <RouterLink
        v-if="isProf && !course.archived"
        :to="{ name: 'lesson-new', params: { id: course.id } }"
        class="ca-btn ca-btn--primary"
      >
        <i class="bi bi-plus-lg" />New lesson
      </RouterLink>
    </div>
    <div v-if="archivedCount" class="form-check mb-3">
      <input id="show-archived" v-model="showArchived" class="form-check-input" type="checkbox" />
      <label class="form-check-label small" for="show-archived">
        Show archived lessons ({{ archivedCount }})
      </label>
    </div>

    <div v-if="loading" class="d-flex justify-content-center py-4">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading lessons…</span>
      </span>
    </div>
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Couldn't load the lessons" compact>
        {{ loadError }}
      </EmptyState>
    </div>
    <div v-else-if="!shownLessons.length" class="ca-surface">
      <EmptyState
        icon="bi-journal-code"
        :title="
          search
            ? 'No matching lessons'
            : archivedCount
              ? 'Every lesson is archived'
              : 'No lessons yet'
        "
        compact
      >
        <template v-if="archivedCount && !showArchived">
          Tick "Show archived lessons" to see the {{ archivedCount }} archived.
        </template>
        <template v-else-if="!search && isProf && !course.archived"
          >Create a lesson from your starter code.</template
        >
      </EmptyState>
    </div>
    <ul v-else class="list-group">
      <li v-for="f in folders" :key="f.name" class="list-group-item">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            class="ca-btn ca-btn--secondary ca-btn--sm lesson-toggle"
            @click="opened[f.week] = !opened[f.week]"
          >
            <i class="bi" :class="opened[f.week] ? 'bi-chevron-up' : 'bi-chevron-down'" />
            {{ f.files.length }} {{ f.files.length === 1 ? 'file' : 'files' }}
          </button>
          <i class="bi bi-folder2" />
          <form
            v-if="editing === f.name"
            class="d-flex align-items-center gap-1"
            novalidate
            @submit.prevent="moveWeek"
          >
            <label class="small" :for="`week-${f.week}`">Week</label>
            <input
              :id="`week-${f.week}`"
              v-model.number="newWeek"
              class="ca-input week-input"
              type="number"
              min="1"
              max="13"
              :class="{ 'ca-input--invalid': weekError }"
              @input="weekError = ''"
            />
            <button type="submit" class="ca-btn ca-btn--primary ca-btn--sm" :disabled="movingWeek">
              Save
            </button>
            <button type="button" class="ca-btn ca-btn--sm" @click="editing = null">Cancel</button>
            <span v-if="weekError" class="ca-field-error mb-0">{{ weekError }}</span>
          </form>
          <template v-else>
            <span class="fw-semibold">{{ f.name }}</span>
            <button
              v-if="isProf && !course.archived"
              type="button"
              class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm"
              @click="editWeek(f)"
            >
              <i class="bi bi-pencil" />
              <span class="visually-hidden">Change the week</span>
            </button>
          </template>
        </div>

        <!-- the dropdown: the folder's code files, each with the classes run from it -->
        <ul v-if="opened[f.week]" class="list-group mt-2">
          <li
            v-for="l in f.files"
            :key="l.id"
            class="list-group-item"
            :data-testid="`lesson-row-${slug(l.title)}`"
          >
            <div class="d-flex flex-wrap align-items-center gap-2">
              <i class="bi bi-file-earmark-code" />
              <span class="fw-semibold">{{ fileName(l) }}</span>
              <span v-if="isStaff" class="badge" :class="STATUS[l.status].css">{{
                STATUS[l.status].label
              }}</span>

              <span
                v-if="isProf && !course.archived"
                class="ms-auto d-flex flex-wrap align-items-center gap-1"
              >
                <!-- any file not archived, taught before or not; while one of its classes is live,
                     Open class (in its list below) is the way in instead -->
                <button
                  v-if="l.status !== LessonStatus.ARCHIVED && !hasLiveClass(l)"
                  type="button"
                  class="ca-btn ca-btn--primary ca-btn--sm"
                  :disabled="starting === l.id"
                  :data-testid="`lesson-start-${slug(l.title)}`"
                  @click="startClass(l)"
                >
                  <span v-if="starting === l.id" class="spinner-border spinner-border-sm" />
                  Start new session
                </button>

                <!-- ⋯: edit the files, show or hide it from students, archive -->
                <div class="dropdown">
                  <button
                    type="button"
                    class="ca-btn ca-btn--ghost ca-btn--sm ca-btn--icon"
                    :data-testid="`lesson-menu-${slug(l.title)}`"
                    @click.stop="toggleMenu(l)"
                  >
                    <i class="bi bi-three-dots-vertical" />
                    <span class="visually-hidden">Lesson options</span>
                  </button>
                  <!-- top-100 end-0: under the ⋯, right edges lined up (no Bootstrap JS to place it) -->
                  <!-- clicks inside don't close it, so the switch can be flipped and seen -->
                  <div
                    class="dropdown-menu top-100 end-0"
                    :class="{ show: menuFor === l.id }"
                    @click.stop
                  >
                    <RouterLink
                      :to="{ name: 'lesson-edit', params: { id: l.id } }"
                      class="dropdown-item"
                    >
                      <i class="bi bi-pencil me-2" />Edit files
                    </RouterLink>
                    <!-- an archived lesson's classes stay visible, so it gets Unarchive instead -->
                    <button
                      v-if="l.status === LessonStatus.ARCHIVED"
                      type="button"
                      class="dropdown-item"
                      @click="unarchive(l)"
                    >
                      <i class="bi bi-arrow-counterclockwise me-2" />Unarchive
                    </button>
                    <template v-else>
                      <!-- a row like the others: icon and name, the switch on the right; the
                           whole row flips it (on = students can see the lesson) -->
                      <label
                        class="dropdown-item d-flex align-items-center"
                        :for="`lesson-visible-${l.id}`"
                      >
                        <i
                          class="bi me-2"
                          :class="l.status === LessonStatus.READY ? 'bi-eye' : 'bi-eye-slash'"
                        />Visibility
                        <span
                          class="form-check form-switch d-flex align-items-center mb-0 ps-0 ms-auto"
                        >
                          <input
                            :id="`lesson-visible-${l.id}`"
                            class="form-check-input float-none ms-4 mt-0"
                            type="checkbox"
                            :checked="l.status === LessonStatus.READY"
                            :disabled="savingVisible === l.id"
                            :data-testid="`lesson-visible-${slug(l.title)}`"
                            @change="setVisible(l, $event.target)"
                          />
                        </span>
                      </label>
                      <button type="button" class="dropdown-item" @click="askArchive(l)">
                        <i class="bi bi-archive me-2" />Archive
                      </button>
                    </template>
                    <button
                      v-if="!classesOf(l).length"
                      type="button"
                      class="dropdown-item text-danger"
                      @click="askDelete(l)"
                    >
                      <i class="bi bi-trash me-2" />Delete
                    </button>
                    <!-- taught: greyed out, and the ? says why (hover, or click on a phone) -->
                    <template v-else>
                      <!-- faded red: it's Delete, just not available; the bare ? keeps the row as
                           tall as the others -->
                      <div class="dropdown-item-text d-flex align-items-center">
                        <span class="text-danger opacity-50">
                          <i class="bi bi-trash me-2" />Delete
                        </span>
                        <button
                          type="button"
                          class="border-0 bg-transparent p-0 lh-1 ms-auto text-danger opacity-50"
                          :title="noDeleteReason(l)"
                          :data-testid="`lesson-why-no-delete-${slug(l.title)}`"
                          @click="whyNoDelete = !whyNoDelete"
                        >
                          <i class="bi bi-question-circle" />
                          <span class="visually-hidden">Why can't I delete it?</span>
                        </button>
                      </div>
                      <p
                        v-if="whyNoDelete"
                        class="dropdown-item-text small text-body-secondary mb-0"
                      >
                        {{ noDeleteReason(l) }}
                      </p>
                    </template>
                  </div>
                </div>
              </span>
            </div>

            <ul v-if="classesOf(l).length" class="list-group mt-2">
              <li
                v-for="s in classesOf(l)"
                :key="s.id"
                class="list-group-item d-flex flex-wrap align-items-center gap-2"
              >
                <span v-if="s.status === SessionStatus.LIVE" class="ca-pill ca-pill--sm ca-state--error">
                  <i class="bi bi-broadcast" />Live
                </span>
                <span v-else class="badge text-bg-light">Ended</span>
                <span class="text-body-secondary small">{{ when(s.started_at) }}</span>
                <span v-if="isStaff && s.status === SessionStatus.LIVE" class="small">
                  Code <span class="ca-mono fw-semibold">{{ s.join_code }}</span>
                </span>

                <span class="ms-auto d-flex gap-1">
                  <template v-if="s.status === SessionStatus.LIVE && !course.archived">
                    <RouterLink
                      v-if="isProf"
                      :to="{ name: 'teach', params: { id: s.id } }"
                      class="ca-btn ca-btn--primary ca-btn--sm"
                    >
                      Open class
                    </RouterLink>
                    <RouterLink
                      v-else-if="isStaff"
                      :to="{ name: 'help-queue', params: { id: s.id } }"
                      class="ca-btn ca-btn--primary ca-btn--sm"
                    >
                      Help queue
                    </RouterLink>
                    <RouterLink
                      v-else
                      :to="{ name: 'workspace', params: { id: s.id } }"
                      class="ca-btn ca-btn--primary ca-btn--sm"
                    >
                      Join
                    </RouterLink>
                  </template>
                  <template v-else-if="s.status !== 'live'">
                    <RouterLink
                      :to="{ name: 'replay', params: { sessionId: s.id } }"
                      class="ca-btn ca-btn--secondary ca-btn--sm"
                    >
                      Replay
                    </RouterLink>
                    <RouterLink
                      v-if="isStaff"
                      :to="{ name: 'session-report', params: { id: s.id } }"
                      class="ca-btn ca-btn--ghost ca-btn--sm"
                    >
                      Report
                    </RouterLink>
                  </template>
                </span>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>

    <ConfirmModal
      :open="archiving !== null"
      title="Archive this lesson?"
      confirm-label="Archive lesson"
      :busy="archiveBusy"
      @update:open="archiving = null"
      @confirm="archive"
    >
      No new class can start from it. Its past classes, replays and reports stay, and students can
      still open them.
    </ConfirmModal>

    <ConfirmModal
      :open="deleting !== null"
      :title="`Delete ${deleting ? fileName(deleting) : 'this lesson'}?`"
      confirm-label="Delete lesson"
      variant="danger"
      :busy="deleteBusy"
      @update:open="deleting = null"
      @confirm="removeLesson"
    >
      Its starter files will be removed. This can't be undone.
    </ConfirmModal>
  </section>
</template>

<style scoped>
/* same width whatever the count, so the lesson titles line up */
.lesson-toggle {
  min-width: 6.5rem;
}
/* the week box on a folder: as tall as the small buttons next to it, wide enough for 2 digits */
.week-input {
  width: 4.5rem;
  min-height: 2rem;
  padding-block: 0;
}
</style>
