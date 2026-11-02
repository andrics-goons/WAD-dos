<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Lessons tab of the course page: search, the list, and for the prof New / Edit / Start new session.
// Each lesson has a dropdown of the classes run from it.
// Owner: Ray Yien (started by Ying Qi as a working first version).
const props = defineProps({ course: { type: Object, required: true } })

const store = useCourseStore()
const sessionStore = useSessionStore()
const toast = useToastStore()
const router = useRouter()

const isStaff = computed(() => ['prof', 'ta'].includes(props.course.myRole))
const isProf = computed(() => props.course.myRole === 'prof')

const lessons = ref([])
const sessions = ref([])
const opened = ref({}) // lesson id → is its dropdown open?
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
      if (s.status === 'live') opened.value[s.lesson_id] = true
    }
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

const search = ref('')
const shownLessons = computed(() =>
  lessons.value.filter((l) => l.title.toLowerCase().includes(search.value.trim().toLowerCase())),
)
// "Week 6 - Mini Cart". A title that already starts with its week ("Week 6 · Mini Cart") isn't doubled.
const heading = (l) => {
  const title = l.title.replace(/^Week \d+\s*[·:-]\s*/i, '')
  return l.week ? `Week ${l.week} - ${title}` : l.title
}
const classesOf = (lesson) => sessions.value.filter((s) => s.lesson_id === lesson.id)
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// "Week 6 · Mini Cart" → "week-6-mini-cart", for the lesson-row / lesson-start test ids
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const starting = ref(null)
async function startClass(lesson) {
  starting.value = lesson.id
  try {
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
        :title="search ? 'No matching lessons' : 'No lessons yet'"
        compact
      >
        <template v-if="!search && isProf">Create a lesson from your starter code.</template>
      </EmptyState>
    </div>
    <ul v-else class="list-group">
      <li
        v-for="l in shownLessons"
        :key="l.id"
        class="list-group-item"
        :data-testid="`lesson-row-${slug(l.title)}`"
      >
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            class="ca-btn ca-btn--secondary ca-btn--sm lesson-toggle"
            @click="opened[l.id] = !opened[l.id]"
          >
            <i class="bi" :class="opened[l.id] ? 'bi-chevron-up' : 'bi-chevron-down'" />
            {{ classesOf(l).length }} {{ classesOf(l).length === 1 ? 'class' : 'classes' }}
          </button>
          <span class="fw-semibold">{{ heading(l) }}</span>
          <span v-if="isStaff" class="badge text-bg-light text-capitalize">{{ l.status }}</span>

          <span class="ms-auto d-flex flex-wrap gap-1">
            <template v-if="isProf">
              <RouterLink
                :to="{ name: 'lesson-edit', params: { id: l.id } }"
                class="ca-btn ca-btn--ghost ca-btn--sm"
              >
                Edit
              </RouterLink>
              <button
                v-if="l.status === 'ready'"
                type="button"
                class="ca-btn ca-btn--primary ca-btn--sm"
                :disabled="starting === l.id"
                :data-testid="`lesson-start-${slug(l.title)}`"
                @click="startClass(l)"
              >
                <span v-if="starting === l.id" class="spinner-border spinner-border-sm" />
                Start new session
              </button>
            </template>
          </span>
        </div>

        <!-- the dropdown: every class run from this lesson, newest first -->
        <template v-if="opened[l.id]">
          <p v-if="!classesOf(l).length" class="text-body-secondary small mt-2 mb-0">
            No classes yet.
          </p>
          <ul v-else class="list-group mt-2">
            <li
              v-for="s in classesOf(l)"
              :key="s.id"
              class="list-group-item d-flex flex-wrap align-items-center gap-2"
            >
              <span v-if="s.status === 'live'" class="ca-pill ca-pill--sm ca-state--error">
                <i class="bi bi-broadcast" />Live
              </span>
              <span v-else class="badge text-bg-light">Ended</span>
              <span class="fw-semibold">{{ heading(l) }}</span>
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
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* same width whatever the count, so the lesson titles line up */
.lesson-toggle {
  min-width: 7.5rem;
}
</style>
