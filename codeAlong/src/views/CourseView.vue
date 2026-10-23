<script setup>
import { computed, onMounted, ref } from 'vue'
import QRCode from 'qrcode' // Source: https://github.com/soldair/node-qrcode (MIT)
import { RoleLabel } from '@shared/constants.js'
import { useCourseStore } from '@/stores/course'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import LessonLibrary from '@/components/lesson/LessonLibrary.vue'

// One course: who's in it, its lessons and its classes. The owner also gets the enrol
// link to share. The Lessons tab is Ray Yien's LessonLibrary.
const props = defineProps({ id: { type: String, required: true } })

const store = useCourseStore()
const toast = useToastStore()

const course = ref(null)
const loading = ref(true)
const loadError = ref('') // also covers "not yours": the database hides it, so it reads as not found

const sessions = ref([])
const staff = ref([])
const students = ref([])

const tab = ref('lessons')
const tabs = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'sessions', label: 'Classes' },
  { key: 'people', label: 'People' },
]

const isStaff = computed(() => ['prof', 'ta'].includes(course.value?.myRole))
const isProf = computed(() => course.value?.myRole === 'prof')

onMounted(async () => {
  try {
    course.value = await store.get(props.id)
    ;[sessions.value, staff.value, students.value] = await Promise.all([
      store.sessions(props.id),
      store.staff(props.id),
      store.students(props.id),
    ])
    if (course.value.isOwner) await makeQr()
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
  } finally {
    loading.value = false
  }
})

// Share enrolment (owner)
const shareLink = computed(() => course.value && store.shareLink(course.value.enrol_code))
const qr = ref('')
async function makeQr() {
  qr.value = await QRCode.toDataURL(shareLink.value, { margin: 1, width: 200 })
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    toast.show('Enrol link copied', 'success')
  } catch {
    toast.show("Couldn't copy — select the link and copy it yourself", 'warning')
  }
}

// Classes
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

// People (owner): add a TA, remove a student
const taEmail = ref('')
const addingTa = ref(false)
const taError = ref('')
async function addTa() {
  addingTa.value = true
  taError.value = ''
  try {
    await store.addTa(props.id, taEmail.value)
    staff.value = await store.staff(props.id)
    toast.show(`${taEmail.value} is now a TA`, 'success')
    taEmail.value = ''
  } catch (error) {
    taError.value = error.message
  } finally {
    addingTa.value = false
  }
}

const toRemove = ref(null)
const removing = ref(false)
async function removeStudent() {
  removing.value = true
  try {
    await store.removeStudent(props.id, toRemove.value.user_id)
    students.value = students.value.filter((s) => s.user_id !== toRemove.value.user_id)
    toast.show(`Removed ${toRemove.value.name}`, 'success')
    toRemove.value = null
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="ca-page">
    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the course…</span>
      </span>
    </div>

    <!-- Not found (or not yours) / couldn't load -->
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState
        :icon="loadError === 'not-found' ? 'bi-journal-x' : 'bi-exclamation-triangle'"
        :title="loadError === 'not-found' ? 'Course not found' : `Couldn't load the course`"
      >
        <template v-if="loadError === 'not-found'">
          It may have been removed, or you're not in it.
        </template>
        <template v-else>{{ loadError }}</template>
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
        <span class="badge text-bg-light">{{ RoleLabel[course.myRole] }}</span>
      </div>

      <!-- Share enrolment (owner) -->
      <section v-if="course.isOwner" class="ca-card mb-4">
        <div class="row g-4 align-items-center">
          <div class="col-12 col-md">
            <h2 class="fs-5 mb-1">Share enrolment</h2>
            <p class="text-body-secondary small mb-3">
              Students join this course once with the code, the link or the QR code.
            </p>
            <div class="mb-3">
              Enrol code <span class="ca-mono fs-4 fw-semibold ms-2">{{ course.enrol_code }}</span>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <label class="visually-hidden" for="enrol-link">Enrol link</label>
              <input
                id="enrol-link"
                class="ca-input ca-mono flex-grow-1 w-auto"
                :value="shareLink"
                readonly
                data-testid="enrol-link"
                @focus="$event.target.select()"
              />
              <button
                type="button"
                class="ca-btn ca-btn--secondary"
                data-testid="btn-copy-enrol-link"
                @click="copyLink"
              >
                <i class="bi bi-clipboard" />Copy link
              </button>
            </div>
          </div>
          <div v-if="qr" class="col-12 col-md-auto text-center">
            <img
              :src="qr"
              alt="QR code for the enrol link"
              width="160"
              height="160"
              data-testid="enrol-qr"
            />
          </div>
        </div>
      </section>

      <!-- Tabs -->
      <ul class="nav nav-tabs mb-3">
        <li v-for="t in tabs" :key="t.key" class="nav-item">
          <button
            type="button"
            class="nav-link"
            :class="{ active: tab === t.key }"
            @click="tab = t.key"
          >
            {{ t.label }}
          </button>
        </li>
      </ul>

      <!-- Lessons (Ray Yien's) -->
      <LessonLibrary v-if="tab === 'lessons'" :course="course" />

      <!-- Classes: live and past sessions -->
      <section v-else-if="tab === 'sessions'">
        <div v-if="!sessions.length" class="ca-surface">
          <EmptyState icon="bi-broadcast" title="No classes yet" compact>
            <template v-if="isProf">Start a class from a ready lesson in the Lessons tab.</template>
          </EmptyState>
        </div>
        <ul v-else class="list-group">
          <li
            v-for="s in sessions"
            :key="s.id"
            class="list-group-item d-flex flex-wrap align-items-center gap-2"
          >
            <span v-if="s.status === 'live'" class="ca-pill ca-pill--sm ca-state--error">
              <i class="bi bi-broadcast" />Live
            </span>
            <span v-else class="badge text-bg-light">Ended</span>
            <span class="fw-semibold">{{ s.lessons.title }}</span>
            <span class="text-body-secondary small">{{ when(s.started_at) }}</span>
            <span v-if="isStaff && s.status === 'live'" class="small">
              Code <span class="ca-mono fw-semibold">{{ s.join_code }}</span>
            </span>

            <span class="ms-auto d-flex gap-1">
              <template v-if="s.status === 'live'">
                <RouterLink
                  v-if="isProf"
                  :to="{ name: 'teach', params: { id: s.id } }"
                  class="ca-btn ca-btn--primary ca-btn--sm"
                >
                  Open class
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
                  :to="{ name: 'workspace', params: { id: s.id } }"
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
                  class="ca-btn ca-btn--ghost ca-btn--sm"
                >
                  Report
                </RouterLink>
              </template>
            </span>
          </li>
        </ul>
      </section>

      <!-- People -->
      <section v-else class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="ca-card h-100">
            <h2 class="fs-5 mb-3">Staff</h2>
            <ul class="list-group mb-3">
              <li
                v-for="p in staff"
                :key="p.user_id"
                class="list-group-item d-flex justify-content-between"
              >
                {{ p.name }}
                <span class="badge text-bg-light">{{ RoleLabel[p.role] }}</span>
              </li>
            </ul>

            <!-- the owner adds TAs by the email they signed up with -->
            <form v-if="course.isOwner" class="ca-field" @submit.prevent="addTa">
              <label class="ca-label" for="ta-email">Add a TA by email</label>
              <div class="d-flex gap-2">
                <input
                  id="ta-email"
                  v-model="taEmail"
                  type="email"
                  class="ca-input"
                  :class="{ 'ca-input--invalid': taError }"
                  placeholder="ana@example.com"
                  required
                />
                <button type="submit" class="ca-btn ca-btn--primary" :disabled="addingTa">
                  Add
                </button>
              </div>
              <p v-if="taError" class="ca-field-error">{{ taError }}</p>
            </form>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="ca-card h-100">
            <!-- staff see every student; a student only sees themselves -->
            <h2 class="fs-5 mb-3">Students ({{ students.length }})</h2>
            <p v-if="!students.length" class="text-body-secondary mb-0">Nobody has enrolled yet.</p>
            <ul v-else class="list-group">
              <li
                v-for="p in students"
                :key="p.user_id"
                class="list-group-item d-flex align-items-center justify-content-between"
              >
                {{ p.name }}
                <button
                  v-if="course.isOwner"
                  type="button"
                  class="ca-btn ca-btn--ghost ca-btn--sm"
                  @click="toRemove = p"
                >
                  Remove
                </button>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>

    <ConfirmModal
      :open="!!toRemove"
      :title="`Remove ${toRemove?.name}?`"
      confirm-label="Remove"
      variant="danger"
      :busy="removing"
      @update:open="(open) => !open && (toRemove = null)"
      @confirm="removeStudent"
    >
      They'll lose access to this course. Their past class activity stays in the reports.
    </ConfirmModal>
  </div>
</template>
