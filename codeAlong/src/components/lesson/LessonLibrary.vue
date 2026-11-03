<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LessonStatus } from '@shared/constants.js'
import { useCourseStore } from '@/stores/course'
import { useLessonsStore } from '@/stores/lessons'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Lessons tab of the course page. Lessons sit in one folder per week ("Week 6"), and opening a
// folder shows its code files ("ICE", "Extra exercises"), each with the classes run from it.
// Start new session goes to the import page, so every class starts from code the prof brought in.
// Owner: Ray Yien (started by Ying Qi as a working first version).
const props = defineProps({ course: { type: Object, required: true } })

const store = useCourseStore()
const lessonsStore = useLessonsStore()
const sessionStore = useSessionStore()
const toast = useToastStore()
const router = useRouter()

const isStaff = computed(() => ['prof', 'ta'].includes(props.course.myRole))
const isProf = computed(() => props.course.myRole === 'prof')

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
      if (s.status === 'live' && lesson) opened.value[lesson.week] = true
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
// one folder per week, in week order (listLessons sorts them); lessons with no week go last
const folders = computed(() => {
  const byWeek = new Map()
  for (const l of shownLessons.value) {
    if (!byWeek.has(l.week)) byWeek.set(l.week, [])
    byWeek.get(l.week).push(l)
  }
  return [...byWeek].map(([week, files]) => ({
    week,
    name: week ? `Week ${week}` : 'No week',
    files,
  }))
})
// the folder already says the week, so "Week 6 · Mini Cart" shows as "Mini Cart"
const fileName = (l) => l.title.replace(/^Week \d+\s*[·:-]\s*/i, '')
const classesOf = (lesson) => sessions.value.filter((s) => s.lesson_id === lesson.id)

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
        v-if="isProf"
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
        <template v-else-if="!search && isProf">Create a lesson from your starter code.</template>
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
          <span class="fw-semibold">{{ f.name }}</span>
          <RouterLink
            v-if="isProf"
            :to="{
              name: 'lesson-new',
              params: { id: course.id },
              query: { start: 1, week: f.week ?? undefined },
            }"
            class="ca-btn ca-btn--primary ca-btn--sm ms-auto"
          >
            Start new session
          </RouterLink>
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

              <span v-if="isProf" class="ms-auto d-flex flex-wrap gap-1">
                <RouterLink
                  :to="{ name: 'lesson-edit', params: { id: l.id } }"
                  class="ca-btn ca-btn--ghost ca-btn--sm"
                >
                  Edit
                </RouterLink>
                <!-- only code that hasn't been taught: a new class imports its own -->
                <button
                  v-if="l.status === 'ready' && !classesOf(l).length"
                  type="button"
                  class="ca-btn ca-btn--primary ca-btn--sm"
                  :disabled="starting === l.id"
                  :data-testid="`lesson-start-${slug(l.title)}`"
                  @click="startClass(l)"
                >
                  <span v-if="starting === l.id" class="spinner-border spinner-border-sm" />
                  Start class
                </button>
              </span>
            </div>

            <ul v-if="classesOf(l).length" class="list-group mt-2">
              <li
                v-for="s in classesOf(l)"
                :key="s.id"
                class="list-group-item d-flex flex-wrap align-items-center gap-2"
              >
                <span v-if="s.status === 'live'" class="ca-pill ca-pill--sm ca-state--error">
                  <i class="bi bi-broadcast" />Live
                </span>
                <span v-else class="badge text-bg-light">Ended</span>
                <span class="text-body-secondary small">{{ when(s.started_at) }}</span>
                <span v-if="isStaff && s.status === 'live'" class="small">
                  Code <span class="ca-mono fw-semibold">{{ s.join_code }}</span>
                </span>

                <span class="ms-auto d-flex gap-1">
                  <template v-if="s.status === 'live'">
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
                  <template v-else>
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
  </section>
</template>

<style scoped>
/* same width whatever the count, so the lesson titles line up */
.lesson-toggle {
  min-width: 6.5rem;
}
</style>
