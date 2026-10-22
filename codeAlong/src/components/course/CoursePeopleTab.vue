<script setup>
import { computed, onMounted, ref } from 'vue'
import { enrolUrl } from '@/api/courses.api'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

// The People tab on a course page (staff only): who teaches it and who takes it.
// The owner also shares the enrol code, adds TAs and removes students.
const props = defineProps({
  course: { type: Object, required: true }, // from courses.get(): has isOwner, enrol_code
})

const courses = useCoursesStore()
const toast = useToastStore()

const staff = ref([])
const students = ref([])
const loading = ref(true)
const loadError = ref('')

const link = computed(() => enrolUrl(props.course.enrol_code))
const joined = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

async function load() {
  try {
    ;[staff.value, students.value] = await Promise.all([
      courses.listStaff(props.course.id),
      courses.listStudents(props.course.id),
    ])
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.show('Enrol link copied', 'success')
  } catch {
    toast.show("Couldn't copy — select the link and copy it yourself", 'warning')
  }
}

// Add a TA by email (owner)
const taEmail = ref('')
const adding = ref(false)
const addError = ref('')

async function addTa() {
  adding.value = true
  addError.value = ''
  try {
    await courses.addStaff(props.course.id, taEmail.value)
    staff.value = await courses.listStaff(props.course.id)
    toast.show(`${taEmail.value} is now a TA`, 'success')
    taEmail.value = ''
  } catch (error) {
    addError.value = error.message
  } finally {
    adding.value = false
  }
}

// Remove a student (owner), confirmed first
const removing = ref(null) // the student being removed
const busy = ref(false)

async function confirmRemove() {
  busy.value = true
  try {
    await courses.removeStudent(props.course.id, removing.value.user_id)
    toast.show(`${removing.value.name} was removed from the course`, 'success')
    students.value = students.value.filter((s) => s.user_id !== removing.value.user_id)
    removing.value = null
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="d-flex justify-content-center py-5">
    <span class="spinner-border text-primary" />
  </div>

  <div v-else-if="loadError" class="ca-surface">
    <EmptyState icon="bi-exclamation-triangle" title="Couldn't load the people">
      {{ loadError }}
    </EmptyState>
  </div>

  <div v-else class="row g-3">
    <!-- the owner: share enrolment + add a TA -->
    <div v-if="course.isOwner" class="col-12 col-lg-5 d-flex flex-column gap-3">
      <div class="ca-card">
        <h2 class="h5">Share enrolment</h2>
        <p class="text-body-secondary small">
          Students enrol once with this code, or by opening the link.
        </p>
        <div class="ca-mono fs-3 fw-semibold mb-2">{{ course.enrol_code }}</div>
        <div class="d-flex gap-2">
          <input class="ca-input ca-mono small" :value="link" readonly data-testid="enrol-link" />
          <button
            type="button"
            class="ca-btn ca-btn--secondary"
            data-testid="btn-copy-enrol-link"
            @click="copyLink()"
          >
            <i class="bi bi-clipboard" />Copy
          </button>
        </div>
      </div>

      <form class="ca-card" @submit.prevent="addTa()">
        <h2 class="h5">Add a TA</h2>
        <div class="ca-field">
          <label class="ca-label" for="ta-email">Their CodeAlong email</label>
          <input
            id="ta-email"
            v-model="taEmail"
            type="email"
            class="ca-input"
            :class="{ 'ca-input--invalid': addError }"
            required
          />
          <p v-if="addError" class="ca-field-error mb-0">{{ addError }}</p>
        </div>
        <button type="submit" class="ca-btn ca-btn--primary mt-3" :disabled="adding">
          <span v-if="adding" class="spinner-border spinner-border-sm" />
          Add TA
        </button>
      </form>
    </div>

    <div class="col-12" :class="{ 'col-lg-7': course.isOwner }">
      <h2 class="h5">Staff</h2>
      <ul class="list-group mb-4">
        <li
          v-for="s in staff"
          :key="s.user_id"
          class="list-group-item d-flex justify-content-between align-items-center"
        >
          {{ s.name }}
          <span class="badge" :class="s.role === 'prof' ? 'text-bg-primary' : 'text-bg-light'">
            {{ s.role === 'prof' ? 'Prof' : 'TA' }}
          </span>
        </li>
      </ul>

      <h2 class="h5">Students ({{ students.length }})</h2>
      <div v-if="!students.length" class="ca-surface">
        <EmptyState icon="bi-people" title="No students yet" compact>
          Share the enrol code so they can join.
        </EmptyState>
      </div>
      <ul v-else class="list-group">
        <li
          v-for="s in students"
          :key="s.user_id"
          class="list-group-item d-flex justify-content-between align-items-center gap-2"
        >
          <span>
            {{ s.name }}
            <span class="small text-body-secondary ms-1">since {{ joined(s.enrolled_at) }}</span>
          </span>
          <button
            v-if="course.isOwner"
            type="button"
            class="ca-btn ca-btn--ghost ca-btn--sm"
            @click="removing = s"
          >
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>

  <ConfirmModal
    :open="removing !== null"
    :title="removing ? `Remove ${removing.name}?` : ''"
    confirm-label="Remove"
    variant="danger"
    :busy="busy"
    @confirm="confirmRemove"
    @cancel="removing = null"
  >
    They lose access to the course. Their past class data stays in the reports.
  </ConfirmModal>
</template>
