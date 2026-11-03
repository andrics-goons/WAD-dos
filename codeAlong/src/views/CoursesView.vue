<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RoleLabel } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'
import { useCourseStore } from '@/stores/course'
import EmptyState from '@/components/ui/EmptyState.vue'
import CourseForm from '@/components/course/CourseForm.vue'

// My courses: one card per course. Educators can create a course here;
// students and TAs go to /enrol to join one with a code.
const auth = useAuthStore()
const courses = useCoursesStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()

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

// New course form (educators only). It has its own address, so the My courses button closes it.
const showForm = computed(() => isProf.value && !!route.query.new)
const saving = ref(false)
const formError = ref('')

function closeForm() {
  formError.value = ''
  router.replace({ name: 'courses' })
}

// Clicking a course card opens it, unless you were selecting text (e.g. to copy the enrol code)
function openCourse(course) {
  if (window.getSelection().toString()) return
  router.push({ name: 'course', params: { id: course.id } })
}

async function createCourse(fields) {
  saving.value = true
  formError.value = ''
  try {
    const course = await courses.create(fields)
    toast.show(`Created ${course.code} · ${course.title}`, 'success')
    closeForm()
  } catch (error) {
    formError.value = error.message // e.g. "You already have a course with that code, term and section"
  } finally {
    saving.value = false
  }
}

// The courses you've archived are off the main list; you can still open and restore them
const courseStore = useCourseStore()
const archived = ref(null) // null while the list is closed
async function toggleArchived() {
  if (archived.value) {
    archived.value = null
    return
  }
  try {
    archived.value = await courseStore.archived()
  } catch (error) {
    toast.show(error.message, 'danger')
  }
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <h1>{{ showForm ? 'New course' : 'My courses' }}</h1>
      <button
        v-if="isProf && !showForm"
        type="button"
        class="ca-btn ca-btn--primary"
        data-testid="btn-new-course"
        @click="router.push({ query: { new: 1 } })"
      >
        <i class="bi bi-plus-lg" />New course
      </button>
      <RouterLink
        v-if="canEnrol && !showForm"
        :to="{ name: 'enrol' }"
        class="ca-btn ca-btn--primary"
        data-testid="btn-enrol-course"
      >
        <i class="bi bi-box-arrow-in-right" />Enrol in a course
      </RouterLink>
    </div>

    <!-- New course (educators) -->
    <CourseForm
      v-if="showForm"
      submit-label="Create course"
      :saving="saving"
      :error="formError"
      @save="createCourse"
      @cancel="closeForm"
    />

    <!-- Loading (the list is hidden while the form is open) -->
    <div v-else-if="loading" class="d-flex justify-content-center py-5">
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
        <!-- a plain box, not a link, so its text can be selected and copied;
             the title is the link, and a click anywhere else on the card opens the course too -->
        <div
          class="ca-card d-flex flex-column h-100"
          :data-testid="`course-card-${c.code}`"
          @click="openCourse(c)"
        >
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="ca-eyebrow">{{ c.code }} · {{ c.section }}</span>
            <span class="badge text-bg-light ms-auto">{{ RoleLabel[c.myRole] }}</span>
          </div>
          <h3 class="mb-1">
            <RouterLink :to="{ name: 'course', params: { id: c.id } }" class="text-reset">
              {{ c.title }}
            </RouterLink>
          </h3>
          <p class="text-body-secondary small mb-0">{{ c.term }}</p>
          <!-- the owner sees the code students enrol with -->
          <p v-if="c.isOwner" class="small mt-auto pt-3 mb-0">
            Enrol code <span class="ca-mono fw-semibold">{{ c.enrol_code }}</span>
          </p>
        </div>
      </div>
    </div>

    <template v-if="!showForm && !loading">
      <button type="button" class="ca-btn ca-btn--ghost ca-btn--sm mt-3" @click="toggleArchived">
        <i class="bi" :class="archived ? 'bi-chevron-up' : 'bi-archive'" />
        {{ archived ? 'Hide archived courses' : 'Show archived courses' }}
      </button>
      <template v-if="archived">
        <h2 class="fs-5 mt-4 mb-3">Archived courses</h2>
        <p v-if="!archived.length" class="text-body-secondary mb-0">No archived courses.</p>
        <div v-else class="list-group">
          <RouterLink
            v-for="c in archived"
            :key="c.id"
            :to="{ name: 'course', params: { id: c.id } }"
            class="list-group-item list-group-item-action"
          >
            <div class="ca-eyebrow">{{ c.code }} · {{ c.section }} · {{ c.term }}</div>
            <div class="fw-semibold text-body">{{ c.title }}</div>
          </RouterLink>
        </div>
      </template>
    </template>
  </div>
</template>
