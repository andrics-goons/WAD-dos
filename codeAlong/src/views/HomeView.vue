<script setup>
import { computed, onMounted, ref } from 'vue'
import { RoleLabel } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useHomeStore } from '@/stores/home'
import EmptyState from '@/components/ui/EmptyState.vue'

// Where you land once logged in: classes that are live right now, a way to join one,
// and your courses. The public landing page (/) sends logged-in users here.
const auth = useAuthStore()
const courses = useCoursesStore()
const store = useHomeStore()

const live = ref([])
const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    ;[live.value] = await Promise.all([store.liveClasses(), courses.load()])
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

const firstName = computed(() => auth.user.name?.split(' ')[0])
const isProf = computed(() => auth.role === 'prof')
const recentCourses = computed(() => courses.courses.slice(0, 3))

// my role in that class's course decides where its button goes
const roleIn = (courseId) => courses.courses.find((c) => c.id === courseId)?.myRole
function classLink(s) {
  const role = roleIn(s.course_id)
  if (role === 'prof') return { label: 'Open class', to: { name: 'teach', params: { id: s.id } } }
  if (role === 'ta')
    return { label: 'Help queue', to: { name: 'help-queue', params: { id: s.id } } }
  return { label: 'Join', to: { name: 'workspace', params: { id: s.id } } }
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <div>
        <div class="ca-eyebrow">{{ RoleLabel[auth.role] }}</div>
        <h1>Hi, {{ firstName }}</h1>
      </div>
      <RouterLink v-if="!isProf" :to="{ name: 'join' }" class="ca-btn ca-btn--primary">
        <i class="bi bi-box-arrow-in-right" />Join with a code
      </RouterLink>
    </div>

    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading…</span>
      </span>
    </div>

    <div v-else-if="loadError" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Couldn't load your home page">
        {{ loadError }}
      </EmptyState>
    </div>

    <div v-else class="row g-4">
      <!-- Live now -->
      <section class="col-12 col-lg-7">
        <h2 class="fs-5 mb-3">Live now</h2>
        <div v-if="!live.length" class="ca-surface">
          <EmptyState icon="bi-broadcast" title="No live classes" compact>
            <template v-if="isProf">Start one from a ready lesson on your course page.</template>
            <template v-else>When your class starts, it shows up here.</template>
          </EmptyState>
        </div>
        <ul v-else class="list-group">
          <li
            v-for="s in live"
            :key="s.id"
            class="list-group-item d-flex flex-wrap align-items-center gap-2"
          >
            <span class="ca-pill ca-pill--sm ca-state--error"
              ><i class="bi bi-broadcast" />Live</span
            >
            <span class="fw-semibold">{{ s.lessons.title }}</span>
            <span class="text-body-secondary small"
              >{{ s.courses.code }} · {{ s.courses.section }}</span
            >
            <RouterLink :to="classLink(s).to" class="ca-btn ca-btn--primary ca-btn--sm ms-auto">
              {{ classLink(s).label }}
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- My courses -->
      <section class="col-12 col-lg-5">
        <div class="d-flex align-items-center mb-3">
          <h2 class="fs-5 mb-0">My courses</h2>
          <RouterLink :to="{ name: 'courses' }" class="ms-auto small">See all</RouterLink>
        </div>
        <div v-if="!recentCourses.length" class="ca-surface">
          <EmptyState icon="bi-journal" title="No courses yet" compact>
            <template v-if="isProf">Create one on the courses page.</template>
            <template v-else>Enrol with the code your instructor gave you.</template>
          </EmptyState>
        </div>
        <div v-else class="list-group">
          <RouterLink
            v-for="c in recentCourses"
            :key="c.id"
            :to="{ name: 'course', params: { id: c.id } }"
            class="list-group-item list-group-item-action"
          >
            <div class="ca-eyebrow">{{ c.code }} · {{ c.section }}</div>
            <div class="fw-semibold text-body">{{ c.title }}</div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
