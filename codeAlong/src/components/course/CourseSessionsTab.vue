<script setup>
import { onMounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Sessions tab on a course page: every class started in this course, live ones first.
const props = defineProps({
  course: { type: Object, required: true }, // from courses.get(): has myRole
})

const sessionStore = useSessionStore()

const isStaff = props.course.myRole !== 'student'
const isProf = props.course.myRole === 'prof'
const sessions = ref([])
const loading = ref(true)
const loadError = ref('')

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

onMounted(async () => {
  try {
    const all = await sessionStore.listForCourse(props.course.id)
    // live classes on top, then the rest newest first (the list already comes newest first)
    sessions.value = [
      ...all.filter((s) => s.status === 'live'),
      ...all.filter((s) => s.status !== 'live'),
    ]
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="d-flex justify-content-center py-5">
    <span class="spinner-border text-primary" />
  </div>

  <div v-else-if="loadError" class="ca-surface">
    <EmptyState icon="bi-exclamation-triangle" title="Couldn't load the classes">
      {{ loadError }}
    </EmptyState>
  </div>

  <div v-else-if="!sessions.length" class="ca-surface">
    <EmptyState icon="bi-broadcast" title="No classes yet">
      <template v-if="isProf">Start one from a ready lesson on the Lessons tab.</template>
      <template v-else>Classes your instructor runs in this course will appear here.</template>
    </EmptyState>
  </div>

  <!-- each class stacks on phones and is one row from md -->
  <ul v-else class="list-group">
    <li v-for="s in sessions" :key="s.id" class="list-group-item">
      <div class="row g-2 align-items-center">
        <div class="col-md-6">
          <div class="fw-semibold">{{ s.lessons?.title }}</div>
          <div class="small text-body-secondary">{{ when(s.started_at) }}</div>
        </div>
        <div class="col-md-2">
          <span v-if="s.status === 'live'" class="badge text-bg-danger">
            <i class="bi bi-broadcast me-1" />Live
          </span>
          <span v-else class="badge text-bg-light">Ended</span>
          <div v-if="s.status === 'live'" class="ca-mono small mt-1">{{ s.join_code }}</div>
        </div>
        <div class="col-md-4 d-flex flex-wrap gap-2 justify-content-md-end">
          <template v-if="s.status === 'live'">
            <RouterLink
              v-if="isProf"
              :to="{ name: 'teach', params: { id: s.id } }"
              class="ca-btn ca-btn--primary ca-btn--sm"
            >
              Teach
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
              :to="{ name: 'join', params: { code: s.join_code } }"
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
              class="ca-btn ca-btn--secondary ca-btn--sm"
            >
              Report
            </RouterLink>
          </template>
        </div>
      </div>
    </li>
  </ul>
</template>
