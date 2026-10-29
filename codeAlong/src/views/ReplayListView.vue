<script setup>
import { computed, onMounted, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { useReplaysStore } from '@/stores/replays'
import EmptyState from '@/components/ui/EmptyState.vue'

// Every ended class in my courses, grouped by course, with search across checkpoint titles
// and my own notes. Owner: Ray Yien. design-docs/04 "/replays".
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

// one group per course, in the order their newest class happened
const groups = computed(() => {
  const byCourse = new Map()
  for (const r of replays.value) {
    if (!byCourse.has(r.courseId)) {
      byCourse.set(r.courseId, { courseId: r.courseId, course: r.course, replays: [] })
    }
    byCourse.get(r.courseId).replays.push(r)
  }
  return [...byCourse.values()]
})

const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// Search: null until the first search, then the results (possibly none)
const q = ref('')
const results = ref(null)
const searching = ref(false)
const searchError = ref('')
async function runSearch() {
  if (!q.value.trim()) {
    results.value = null
    return
  }
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
      <button v-if="results" type="button" class="ca-btn ca-btn--ghost" @click="clearSearch">
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
            {{ r.courseCode }} · {{ r.lessonTitle }} ·
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
          </h2>
          <div class="list-group">
            <RouterLink
              v-for="r in g.replays"
              :key="r.id"
              :to="{ name: 'replay', params: { sessionId: r.id } }"
              class="list-group-item list-group-item-action d-flex flex-wrap align-items-center gap-2"
            >
              <span class="fw-semibold text-body me-auto">{{ r.lessonTitle }}</span>
              <span class="small text-body-secondary">
                {{ when(r.startedAt) }} · {{ r.checkpointCount }} checkpoints
              </span>
            </RouterLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
