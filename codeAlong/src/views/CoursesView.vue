<script setup>
import { computed, onMounted, ref } from 'vue'
import { RoleLabel } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// My courses: one card per course. Educators can create a course here;
// students and TAs go to /enrol to join one with a code.
const auth = useAuthStore()
const courses = useCoursesStore()
const toast = useToastStore()

const isProf = computed(() => auth.role === 'prof')
const canEnrol = computed(() => ['student', 'ta'].includes(auth.role))

const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    await courses.load()
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// New course form (educators only)
const blankForm = () => ({ code: '', title: '', term: '', section: '' })
const showForm = ref(false)
const form = ref(blankForm())
const saving = ref(false)
const formError = ref('')

async function createCourse() {
  saving.value = true
  formError.value = ''
  try {
    const course = await courses.create(form.value)
    toast.show(`Created ${course.code} · ${course.title}`, 'success')
    form.value = blankForm()
    showForm.value = false
  } catch (error) {
    formError.value = error.message // e.g. "You already have a course with that code, term and section"
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
        v-if="isProf && !showForm"
        type="button"
        class="ca-btn ca-btn--primary"
        data-testid="btn-new-course"
        @click="showForm = true"
      >
        <i class="bi bi-plus-lg" />New course
      </button>
      <RouterLink
        v-if="canEnrol"
        :to="{ name: 'enrol' }"
        class="ca-btn ca-btn--primary"
        data-testid="btn-enrol-course"
      >
        <i class="bi bi-box-arrow-in-right" />Enrol in a course
      </RouterLink>
    </div>

    <!-- New course (educators) -->
    <form v-if="showForm" class="ca-card mb-4" @submit.prevent="createCourse">
      <h2 class="fs-5 mb-3">New course</h2>
      <div class="row g-3">
        <div class="ca-field col-12 col-sm-6 col-lg-3">
          <label class="ca-label" for="course-code">Course code</label>
          <input
            id="course-code"
            v-model="form.code"
            class="ca-input text-uppercase"
            placeholder="IS216"
            required
          />
        </div>
        <div class="ca-field col-12 col-sm-6 col-lg-5">
          <label class="ca-label" for="course-title">Title</label>
          <input
            id="course-title"
            v-model="form.title"
            class="ca-input"
            placeholder="Web Application Development II"
            maxlength="100"
            required
          />
        </div>
        <div class="ca-field col-6 col-lg-2">
          <label class="ca-label" for="course-term">Term</label>
          <input
            id="course-term"
            v-model="form.term"
            class="ca-input"
            placeholder="AY2026/27 T1"
            required
          />
        </div>
        <div class="ca-field col-6 col-lg-2">
          <label class="ca-label" for="course-section">Section</label>
          <input
            id="course-section"
            v-model="form.section"
            class="ca-input"
            placeholder="G2"
            required
          />
        </div>
      </div>
      <p v-if="formError" class="ca-field-error mt-3">{{ formError }}</p>
      <div class="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" class="ca-btn ca-btn--primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm" />
          Create course
        </button>
        <button type="button" class="ca-btn ca-btn--secondary" @click="showForm = false">
          Cancel
        </button>
      </div>
    </form>

    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading your courses…</span>
      </span>
    </div>

    <!-- Couldn't load -->
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Couldn't load your courses">
        {{ loadError }}
      </EmptyState>
    </div>

    <!-- No courses yet -->
    <div v-else-if="!courses.courses.length" class="ca-surface">
      <EmptyState icon="bi-journal" title="No courses yet">
        <template v-if="isProf">Create your first course to start adding lessons.</template>
        <template v-else-if="canEnrol">Enrol with the code your instructor gave you.</template>
        <template v-else>Courses you're part of will show up here.</template>
      </EmptyState>
    </div>

    <!-- 1 column on phones, 2 on tablets, 3 on desktop -->
    <div v-else class="row g-3">
      <div v-for="c in courses.courses" :key="c.id" class="col-12 col-md-6 col-xl-4">
        <RouterLink
          :to="{ name: 'course', params: { id: c.id } }"
          class="ca-card d-flex flex-column h-100 text-reset text-decoration-none"
          :data-testid="`course-card-${c.code}`"
        >
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="ca-eyebrow">{{ c.code }} · {{ c.section }}</span>
            <span class="badge text-bg-light ms-auto">{{ RoleLabel[c.myRole] }}</span>
          </div>
          <h3 class="mb-1">{{ c.title }}</h3>
          <p class="text-body-secondary small mb-0">{{ c.term }}</p>
          <!-- the owner sees the code students enrol with -->
          <p v-if="c.isOwner" class="small mt-auto pt-3 mb-0">
            Enrol code <span class="ca-mono fw-semibold">{{ c.enrol_code }}</span>
          </p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
