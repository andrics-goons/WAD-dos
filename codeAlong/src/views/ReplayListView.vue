<script setup>
import { computed, onMounted, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { useReplaysStore } from '@/stores/replays'
import EmptyState from '@/components/ui/EmptyState.vue'

// Every ended class in my courses, grouped by course and then by lesson (a lesson taught several
// times is one row that opens to its classes), with search across checkpoint titles and my own
// notes. Owner: Ray Yien. design-docs/04 "/replays".
const store = useReplaysStore()

const replays = ref([])
const loading = ref(true)
const loadError = ref('')
onMounted(async () => {
  try {
    replays.value = await store.list()
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// one group per course, and in it one per lesson, each in the order its newest class happened
// (the list comes newest first, so the first class seen is the newest)
const groups = computed(() => {
  const byCourse = new Map()
  for (const r of replays.value) {
    if (!byCourse.has(r.courseId)) {
      byCourse.set(r.courseId, { courseId: r.courseId, course: r.course, lessons: new Map() })
    }
    const lessons = byCourse.get(r.courseId).lessons
    if (!lessons.has(r.lessonId)) {
      lessons.set(r.lessonId, { lessonId: r.lessonId, title: r.lessonTitle, classes: [] })
    }
    lessons.get(r.lessonId).classes.push(r)
  }
  return [...byCourse.values()].map((g) => ({ ...g, lessons: [...g.lessons.values()] }))
})

// which lessons are open (lesson id → true); they start closed, like the Lessons tab's folders
const opened = ref({})

const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const day = (iso) => new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

// Search: null until the first search, then the results (possibly none)
const q = ref('')
const results = ref(null)
const searching = ref(false)
const searchError = ref('')
async function runSearch() {
  if (!q.value.trim()) return clearSearch()
  searching.value = true
  searchError.value = ''
  try {
    results.value = await store.search(q.value)
  } catch (error) {
    searchError.value = error.message
  } finally {
    searching.value = false
  }
}
function clearSearch() {
  q.value = ''
  results.value = null
  searchError.value = ''
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <h1>Replays</h1>
    </div>

    <form class="d-flex flex-wrap gap-2 mb-4" @submit.prevent="runSearch">
      <label class="visually-hidden" for="replay-search">Search replays and notes</label>
      <input
        id="replay-search"
        v-model="q"
        type="search"
        class="ca-input w-auto flex-grow-1"
        placeholder="Search checkpoint titles and your notes"
        data-testid="input-search"
      />
      <button type="submit" class="ca-btn ca-btn--primary" :disabled="searching">
        <span v-if="searching" class="spinner-border spinner-border-sm" />
        <i v-else class="bi bi-search" />Search
      </button>
      <button
        v-if="results || searchError"
        type="button"
        class="ca-btn ca-btn--ghost"
        @click="clearSearch"
      >
        Clear
      </button>
    </form>

    <!-- Search results replace the list until cleared -->
    <section v-if="searchError || results" class="mb-4">
      <div v-if="searchError" class="ca-surface">
        <EmptyState icon="bi-exclamation-triangle" title="Search didn't work" compact>
          {{ searchError }}
        </EmptyState>
      </div>
      <div v-else-if="!results.length" class="ca-surface">
        <EmptyState icon="bi-search" title="No matches" compact>
          Try fewer or different words.
        </EmptyState>
      </div>
      <div v-else class="list-group">
        <RouterLink
          v-for="r in results"
          :key="`${r.kind}-${r.checkpointId}-${r.body}`"
          :to="{ name: 'replay', params: { sessionId: r.sessionId }, query: { seq: r.seq } }"
          class="list-group-item list-group-item-action"
        >
          <div class="ca-eyebrow">
            {{ r.courseCode }} · {{ r.lessonTitle }} · {{ day(r.startedAt) }} ·
            {{ r.kind === 'note' ? 'My note' : 'Checkpoint' }}
          </div>
          <div class="fw-semibold text-body">{{ checkpointLabel(r.seq, r.title) }}</div>
          <div v-if="r.body" class="small text-body-secondary text-break">{{ r.body }}</div>
        </RouterLink>
      </div>
    </section>

    <template v-else>
      <div v-if="loading" class="d-flex justify-content-center py-5">
        <span class="spinner-border text-primary">
          <span class="visually-hidden">Loading replays…</span>
        </span>
      </div>
      <div v-else-if="loadError" class="ca-surface">
        <EmptyState icon="bi-exclamation-triangle" title="Couldn't load your replays">
          {{ loadError }}
        </EmptyState>
      </div>
      <div v-else-if="!groups.length" class="ca-surface">
        <EmptyState icon="bi-clock-history" title="No replays yet">
          When a class ends, you can step back through it here.
        </EmptyState>
      </div>
      <template v-else>
        <section v-for="g in groups" :key="g.courseId" class="mb-4">
          <h2 class="fs-5 mb-3">
            {{ g.course.code }} · {{ g.course.section }} · {{ g.course.title }}
            <span class="fs-6 fw-normal text-body-secondary">{{ g.course.term }}</span>
          </h2>
          <ul class="list-group">
            <li
              v-for="l in g.lessons"
              :key="l.lessonId"
              class="list-group-item"
              :data-testid="`replay-lesson-${l.lessonId}`"
            >
              <div class="d-flex flex-wrap align-items-center gap-2">
                <button
                  type="button"
                  class="ca-btn ca-btn--secondary ca-btn--sm replay-lesson-toggle"
                  @click="opened[l.lessonId] = !opened[l.lessonId]"
                >
                  <i class="bi" :class="opened[l.lessonId] ? 'bi-chevron-up' : 'bi-chevron-down'" />
                  {{ plural(l.classes.length, 'class', 'classes') }}
                </button>
                <i class="bi bi-file-earmark-code" />
                <span class="fw-semibold me-auto">{{ l.title }}</span>
                <span class="small text-body-secondary"
                  >Last {{ day(l.classes[0].startedAt) }}</span
                >
              </div>

              <!-- its classes, newest first -->
              <div v-if="opened[l.lessonId]" class="list-group mt-2">
                <RouterLink
                  v-for="r in l.classes"
                  :key="r.id"
                  :to="{ name: 'replay', params: { sessionId: r.id } }"
                  class="list-group-item list-group-item-action d-flex flex-wrap align-items-center gap-2"
                >
                  <i class="bi bi-play-circle" />
                  <span class="text-body me-auto">{{ when(r.startedAt) }}</span>
                  <span class="small text-body-secondary">
                    {{ plural(r.checkpointCount, 'checkpoint') }}
                  </span>
                </RouterLink>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>
