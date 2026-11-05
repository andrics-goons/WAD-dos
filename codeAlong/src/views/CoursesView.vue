<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Role, RoleLabel } from '@shared/constants.js'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'
import { useCourseStore } from '@/stores/course'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import CourseMenu from '@/components/course/CourseMenu.vue'
import LeaveCourseModal from '@/components/course/LeaveCourseModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import CourseForm from '@/components/course/CourseForm.vue'

// My courses: one card per course. Educators can create a course here;
// students and TAs go to /enrol to join one with a code.
const auth = useAuthStore()
const courses = useCoursesStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()

const isProf = computed(() => auth.role === Role.PROF)
const canEnrol = computed(() => [Role.STUDENT, Role.TA].includes(auth.role))

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

// The ⋯ menu on each card: archive it from my list (anyone), or delete it (the owner, until a
// class has run in it). One menu open at a time; a click anywhere else closes it.
const menuFor = ref(null) // the course id whose menu is open
function toggleMenu(course) {
  menuFor.value = menuFor.value === course.id ? null : course.id
}
function closeMenu() {
  menuFor.value = null
}
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

const archiving = ref(null) // the course waiting for "Archive this course?"
const deleting = ref(null) // the course waiting for "Delete this course?"
const leaving = ref(null) // the course waiting for "Leave this course?" (students and TAs)
const changing = ref(false)
function askArchive(course) {
  closeMenu()
  archiving.value = course
}
function askDelete(course) {
  closeMenu()
  deleting.value = course
}
function askLeave(course) {
  closeMenu()
  leaving.value = course
}
// the archived list is loaded on demand, so reload it when it's open and a course changed
const refreshArchived = async () => {
  if (archived.value) archived.value = await courseStore.archived()
}
async function restoreCourse(course) {
  closeMenu()
  try {
    await courseStore.setArchived(course.id, false)
    await refreshArchived()
    toast.show('Course restored', 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  }
}
async function leaveCourse() {
  changing.value = true
  try {
    await courseStore.leave(leaving.value.id)
    await refreshArchived()
    toast.show(`You left ${leaving.value.title}`, 'success')
    leaving.value = null
  } catch (error) {
    leaving.value = null
    toast.show(error.message, 'danger')
  } finally {
    changing.value = false
  }
}
async function archiveCourse() {
  changing.value = true
  try {
    await courseStore.setArchived(archiving.value.id, true)
    await refreshArchived()
    toast.show('Course archived', 'success')
    archiving.value = null
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    changing.value = false
  }
}
async function deleteCourse() {
  changing.value = true
  try {
    await courseStore.remove(deleting.value.id)
    await refreshArchived()
    toast.show('Course deleted', 'success')
    deleting.value = null
  } catch (error) {
    // a class started since this page loaded: it can only be archived now
    const message =
      error.code === 'CONFLICT' ? 'It has classes now, so archive it instead' : error.message
    deleting.value = null
    toast.show(message, 'danger', { title: "Couldn't delete the course" })
    courses.load({ force: true }).catch(() => {})
  } finally {
    changing.value = false
  }
}

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
  <div class="ca-page ca-page--narrow">
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

    <!-- 1 column on phones, 2 from tablets up: big cards, since the page is narrow -->
    <div v-else class="row g-4">
      <div v-for="c in courses.courses" :key="c.id" class="col-12 col-md-6">
        <!-- a plain box, not a link, so its text can be selected and copied;
             the title is the link, and a click anywhere else on the card opens the course too -->
        <!-- pt-3: the header row (name, role, ⋯) is taller than its text, so less padding above it
             keeps the gap at the top looking as big as the sides -->
        <div
          class="ca-card d-flex flex-column h-100 pt-3"
          :data-testid="`course-card-${c.code}`"
          @click="openCourse(c)"
        >
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="ca-eyebrow">{{ c.code }} · {{ c.section }}</span>
            <span class="badge text-bg-light ms-auto">{{ RoleLabel[c.myRole] }}</span>
            <CourseMenu
              :course="c"
              :open="menuFor === c.id"
              @toggle="toggleMenu(c)"
              @archive="askArchive(c)"
              @leave="askLeave(c)"
              @delete="askDelete(c)"
            />
          </div>
          <h3 class="fs-4 mb-1">
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
          <div
            v-for="c in archived"
            :key="c.id"
            class="list-group-item d-flex align-items-center gap-2"
          >
            <RouterLink
              :to="{ name: 'course', params: { id: c.id } }"
              class="flex-grow-1 text-decoration-none"
            >
              <div class="ca-eyebrow">{{ c.code }} · {{ c.section }} · {{ c.term }}</div>
              <div class="fw-semibold text-body">{{ c.title }}</div>
            </RouterLink>
            <CourseMenu
              :course="c"
              :open="menuFor === c.id"
              @toggle="toggleMenu(c)"
              @restore="restoreCourse(c)"
              @leave="askLeave(c)"
              @delete="askDelete(c)"
            />
          </div>
        </div>
      </template>
    </template>

    <ConfirmModal
      :open="archiving !== null"
      title="Archive this course?"
      confirm-label="Archive course"
      :busy="changing"
      @update:open="archiving = null"
      @confirm="archiveCourse"
    >
      It moves to your archived courses, and can be restored anytime. This action only applies to
      your list, nobody else is affected.
    </ConfirmModal>

    <LeaveCourseModal
      :open="leaving !== null"
      :title="leaving?.title"
      :ta="leaving?.myRole === Role.TA"
      :busy="changing"
      @update:open="leaving = null"
      @confirm="leaveCourse"
    />

    <ConfirmModal
      :open="deleting !== null"
      :title="`Delete ${deleting?.title}?`"
      confirm-label="Delete course"
      variant="danger"
      :busy="changing"
      @update:open="deleting = null"
      @confirm="deleteCourse"
    >
      This can't be undone.
    </ConfirmModal>
  </div>
</template>
