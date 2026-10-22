<script setup>
import { computed, onMounted, ref } from 'vue'
import { useCoursesStore } from '@/stores/courses'
import EmptyState from '@/components/ui/EmptyState.vue'
import CourseLessonsTab from '@/components/course/CourseLessonsTab.vue'
import CourseSessionsTab from '@/components/course/CourseSessionsTab.vue'
import CoursePeopleTab from '@/components/course/CoursePeopleTab.vue'

// /courses/:id — one course, in tabs (design-docs/04): Lessons · Sessions · People.
// People is staff only: students don't see who else is enrolled.
const props = defineProps({ id: { type: String, required: true } })

const courses = useCoursesStore()

const course = ref(null)
const loading = ref(true)
const notFound = ref(false)

const tabs = computed(() => [
  { key: 'lessons', label: 'Lessons', icon: 'bi-journal-code' },
  { key: 'sessions', label: 'Sessions', icon: 'bi-broadcast' },
  ...(course.value?.myRole === 'student'
    ? []
    : [{ key: 'people', label: 'People', icon: 'bi-people' }]),
])
const tab = ref('lessons')

onMounted(async () => {
  try {
    course.value = await courses.get(props.id)
  } catch {
    // RLS makes a course you're not in look exactly like one that doesn't exist
    notFound.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="ca-page">
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary" />
    </div>

    <div v-else-if="notFound" class="ca-surface">
      <EmptyState icon="bi-journal-x" title="Course not found">
        It doesn't exist, or you're not in it.
        <template #actions>
          <RouterLink :to="{ name: 'courses' }" class="ca-btn ca-btn--primary"
            >My courses</RouterLink
          >
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="ca-page-header">
        <div>
          <div class="ca-eyebrow">{{ course.code }} · {{ course.section }} · {{ course.term }}</div>
          <h1>{{ course.title }}</h1>
        </div>
      </div>

      <ul class="nav nav-tabs mb-3">
        <li v-for="t in tabs" :key="t.key" class="nav-item">
          <button
            type="button"
            class="nav-link"
            :class="{ active: tab === t.key }"
            @click="tab = t.key"
          >
            <i class="bi me-1" :class="t.icon" />{{ t.label }}
          </button>
        </li>
      </ul>

      <CourseLessonsTab v-if="tab === 'lessons'" :course="course" />
      <CourseSessionsTab v-else-if="tab === 'sessions'" :course="course" />
      <CoursePeopleTab v-else-if="tab === 'people'" :course="course" />
    </template>
  </div>
</template>
