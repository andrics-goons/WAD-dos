<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Lessons tab of the course page: search, the list, and for the prof New / Edit / Start class.
// Owner: Ray Yien (started by Ying Qi as a working first version).
const props = defineProps({ course: { type: Object, required: true } })

const store = useCourseStore()
const sessionStore = useSessionStore()
const toast = useToastStore()
const router = useRouter()

const isStaff = computed(() => ['prof', 'ta'].includes(props.course.myRole))
const isProf = computed(() => props.course.myRole === 'prof')

const lessons = ref([])
const loading = ref(true)
const loadError = ref('')
onMounted(async () => {
  try {
    lessons.value = await store.lessons(props.course.id)
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
    <div v-else class="table-responsive ca-surface">
      <table class="table align-middle mb-0">
        <thead>
          <tr>
            <th>Week</th>
            <th>Lesson</th>
            <th v-if="isStaff">Status</th>
            <th v-if="isProf" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in shownLessons" :key="l.id" :data-testid="`lesson-row-${slug(l.title)}`">
            <td class="text-body-secondary">{{ l.week ?? '—' }}</td>
            <td class="fw-semibold">{{ l.title }}</td>
            <td v-if="isStaff">
              <span class="badge text-bg-light text-capitalize">{{ l.status }}</span>
            </td>
            <td v-if="isProf" class="text-end text-nowrap">
              <RouterLink
                :to="{ name: 'lesson-edit', params: { id: l.id } }"
                class="ca-btn ca-btn--ghost ca-btn--sm"
              >
                Edit
              </RouterLink>
              <button
                v-if="l.status === 'ready'"
                type="button"
                class="ca-btn ca-btn--primary ca-btn--sm ms-1"
                :disabled="starting === l.id"
                :data-testid="`lesson-start-${slug(l.title)}`"
                @click="startClass(l)"
              >
                <span v-if="starting === l.id" class="spinner-border spinner-border-sm" />
                Start class
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
