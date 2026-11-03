<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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
const router = useRouter()

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
const blankForm = () => ({ code: '', title: '', ay: '', termNo: '', section: '' })
const showForm = ref(false)
const form = ref(blankForm())
const saving = ref(false)
const formError = ref('')

// This academic year and the next, e.g. AY2026/27 and AY2027/28. A new AY starts in August.
const now = new Date()
const firstYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
const academicYears = [firstYear, firstYear + 1].map((y) => `AY${y}/${String(y + 1).slice(2)}`)
const terms = ['T1', 'T2', 'T3A', 'T3B']

function closeForm() {
  form.value = blankForm()
  formError.value = ''
  showForm.value = false
}

// Clicking a course card opens it, unless you were selecting text (e.g. to copy the enrol code)
function openCourse(course) {
  if (window.getSelection().toString()) return
  router.push({ name: 'course', params: { id: course.id } })
}

async function createCourse() {
  saving.value = true
  formError.value = ''
  try {
    const { code, title, ay, termNo, section } = form.value
    // stored as one string, e.g. "AY2026/27 T1"
    const course = await courses.create({ code, title, term: `${ay} ${termNo}`, section })
    toast.show(`Created ${course.code} · ${course.title}`, 'success')
    closeForm()
  } catch (error) {
    formError.value = error.message // e.g. "You already have a course with that code, term and section"
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="ca-page">
    <!-- the new course form takes over the page; Back returns to the course list -->
    <button
      v-if="showForm"
      type="button"
      class="ca-btn ca-btn--ghost ca-btn--sm mb-2"
      @click="closeForm"
    >
      <i class="bi bi-arrow-left" />My courses
    </button>

    <div class="ca-page-header">
      <h1>{{ showForm ? 'New course' : 'My courses' }}</h1>
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
        v-if="canEnrol && !showForm"
        :to="{ name: 'enrol' }"
        class="ca-btn ca-btn--primary"
        data-testid="btn-enrol-course"
      >
        <i class="bi bi-box-arrow-in-right" />Enrol in a course
      </RouterLink>
    </div>

    <!-- New course (educators) -->
    <form v-if="showForm" class="ca-card mb-4" @submit.prevent="createCourse">
      <div class="row g-3">
        <div class="ca-field col-12 col-sm-6 col-lg-2">
          <label class="ca-label" for="course-code">Course code</label>
          <input
            id="course-code"
            v-model="form.code"
            class="ca-input text-uppercase"
            placeholder="IS216"
            required
          />
        </div>
        <div class="ca-field col-12 col-sm-6 col-lg-4">
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
        <div class="ca-field col-6 col-sm-4 col-lg-2">
          <label class="ca-label" for="course-ay">Academic year</label>
          <select id="course-ay" v-model="form.ay" class="ca-input" required>
            <option value="" disabled>Choose…</option>
            <option v-for="ay in academicYears" :key="ay" :value="ay">{{ ay }}</option>
          </select>
        </div>
        <div class="ca-field col-6 col-sm-4 col-lg-2">
          <label class="ca-label" for="course-term">Term</label>
          <select id="course-term" v-model="form.termNo" class="ca-input" required>
            <option value="" disabled>Choose…</option>
            <option v-for="t in terms" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="ca-field col-12 col-sm-4 col-lg-2">
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
        <button type="button" class="ca-btn ca-btn--secondary" @click="closeForm">Cancel</button>
      </div>
    </form>

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
  </div>
</template>
