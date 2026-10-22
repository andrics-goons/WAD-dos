<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// /courses — every course I teach or take. RLS returns exactly those, nobody else's.
// Profs can create a course here; students and TAs enrol with a code.
const auth = useAuthStore()
const courses = useCoursesStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')

const ROLE_BADGE = { prof: 'Teaching', ta: 'TA', student: 'Enrolled' }

onMounted(async () => {
  try {
    await courses.load({ force: true })
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// New course (profs)
const showForm = ref(false)
const form = ref({ code: '', title: '', term: '', section: '' })
const saving = ref(false)
const formError = ref('')

async function createCourse() {
  saving.value = true
  formError.value = ''
  try {
    const course = await courses.create(form.value)
    toast.show(`${course.code} · ${course.title} created`, 'success')
    form.value = { code: '', title: '', term: '', section: '' }
    showForm.value = false
  } catch (error) {
    formError.value = error.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <h1>My courses</h1>
      <button
        v-if="auth.role === 'prof'"
        class="ca-btn ca-btn--primary"
        data-testid="btn-new-course"
        @click="showForm = !showForm"
      >
        <i class="bi bi-plus-lg" />New course
      </button>
      <RouterLink
        v-else-if="auth.role === 'student' || auth.role === 'ta'"
        :to="{ name: 'enrol' }"
        class="ca-btn ca-btn--primary"
        data-testid="btn-enrol-course"
      >
        <i class="bi bi-box-arrow-in-right" />Enrol in a course
      </RouterLink>
    </div>

    <form v-if="showForm" class="ca-card mb-4" @submit.prevent="createCourse()">
      <h2 class="h5 mb-3">New course</h2>
      <div class="row g-3">
        <div class="ca-field col-6 col-md-3">
          <label class="ca-label" for="course-code">Code</label>
          <input id="course-code" v-model="form.code" class="ca-input text-uppercase" required />
        </div>
        <div class="ca-field col-12 col-md-9">
          <label class="ca-label" for="course-title">Title</label>
          <input id="course-title" v-model="form.title" class="ca-input" required />
        </div>
        <div class="ca-field col-6 col-md-3">
          <label class="ca-label" for="course-term">Term</label>
          <input id="course-term" v-model="form.term" class="ca-input" required />
        </div>
        <div class="ca-field col-6 col-md-3">
          <label class="ca-label" for="course-section">Section</label>
          <input id="course-section" v-model="form.section" class="ca-input" required />
        </div>
      </div>
      <p v-if="formError" class="ca-field-error mt-3 mb-0">{{ formError }}</p>
      <div class="d-flex gap-2 mt-3">
        <button type="submit" class="ca-btn ca-btn--primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm" />
          Create course
        </button>
        <button type="button" class="ca-btn ca-btn--secondary" @click="showForm = false">
          Cancel
        </button>
      </div>
    </form>

    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary" />
    </div>

    <div v-else-if="loadError" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Couldn't load your courses">
        {{ loadError }}
      </EmptyState>
    </div>

    <div v-else-if="!courses.courses.length" class="ca-surface">
      <EmptyState icon="bi-journal" title="No courses yet">
        <template v-if="auth.role === 'prof'">Create your first course to add lessons.</template>
        <template v-else>Enrol with the code your instructor gave you.</template>
      </EmptyState>
    </div>

    <!-- 1 column on phones, 2 from md, 3 from xl -->
    <div v-else class="row g-3">
      <div v-for="c in courses.courses" :key="c.id" class="col-12 col-md-6 col-xl-4">
        <RouterLink
          :to="{ name: 'course', params: { id: c.id } }"
          class="ca-card h-100 d-block text-reset text-decoration-none"
          :data-testid="`course-card-${c.code}`"
        >
          <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
            <span class="ca-eyebrow">{{ c.code }} · {{ c.section }}</span>
            <span class="badge text-bg-light">{{ ROLE_BADGE[c.myRole] }}</span>
          </div>
          <h2 class="h5 mb-1">{{ c.title }}</h2>
          <p class="text-body-secondary small mb-0">{{ c.term }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
