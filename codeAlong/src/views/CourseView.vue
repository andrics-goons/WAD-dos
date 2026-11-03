<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode' // Source: https://github.com/soldair/node-qrcode (MIT)
import { RoleLabel } from '@shared/constants.js'
import { useCourseStore } from '@/stores/course'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import LessonLibrary from '@/components/lesson/LessonLibrary.vue'
import CourseForm from '@/components/course/CourseForm.vue'

// One course: its lessons (each with its classes) and its people. The owner also gets the enrol link.
const props = defineProps({ id: { type: String, required: true } })

const store = useCourseStore()
const toast = useToastStore()
const router = useRouter()

const course = ref(null)
const loading = ref(true)
const loadError = ref('') // also covers "not yours": the database hides it, so it reads as not found

const staff = ref([])
const students = ref([])
const hasClasses = ref(false) // a course with classes keeps its history, so it can't be deleted

const tab = ref('lessons')
const tabs = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'people', label: 'People' },
]

onMounted(async () => {
  try {
    course.value = await store.get(props.id)
    ;[staff.value, students.value] = await Promise.all([
      store.staff(props.id),
      store.students(props.id),
    ])
    if (course.value.isOwner) {
      hasClasses.value = (await store.sessions(props.id)).length > 0
      await makeQr()
    }
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
  } finally {
    loading.value = false
  }
})

// Edit or delete the course (owner), archive it from your own list (anyone)
const editing = ref(false)
const saving = ref(false)
const editError = ref('')
async function saveCourse(changes) {
  saving.value = true
  editError.value = ''
  try {
    course.value = { ...course.value, ...(await store.update(props.id, changes)) }
    editing.value = false
    toast.show('Course updated', 'success')
  } catch (error) {
    editError.value = error.message
  } finally {
    saving.value = false
  }
}

const confirmDelete = ref(false)
const confirmArchive = ref(false)
const changing = ref(false)
async function deleteCourse() {
  changing.value = true
  try {
    await store.remove(props.id)
    toast.show('Course deleted', 'success')
    router.replace({ name: 'courses' })
  } catch (error) {
    confirmDelete.value = false
    // a class started since this page loaded, so it can only be archived now
    if (error.code === 'CONFLICT') confirmArchive.value = true
    else toast.show(error.message, 'danger')
  } finally {
    changing.value = false
  }
}
async function setArchived(archived) {
  changing.value = true
  try {
    await store.setArchived(props.id, archived)
    course.value.archived = archived
    confirmArchive.value = false
    toast.show(archived ? 'Course archived' : 'Course restored', 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    changing.value = false
  }
}

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

// People (students): who's online in each live class. Staff have the enrolment list instead.
const isStaff = computed(() => ['prof', 'ta'].includes(course.value?.myRole))
const liveClasses = ref([])
let closeChannels = []
function stopWatching() {
  closeChannels.forEach((close) => close())
  closeChannels = []
}
watch(tab, async (now) => {
  stopWatching()
  if (now !== 'people' || isStaff.value) return
  try {
    const sessions = await store.sessions(props.id)
    if (tab.value !== 'people') return
    liveClasses.value = sessions
      .filter((s) => s.status === 'live')
      .map((s) => ({ id: s.id, title: s.lessons.title, people: [] }))
    closeChannels = liveClasses.value.map((c) =>
      store.watchPresent(c.id, (people) => (c.people = people)),
    )
  } catch (error) {
    toast.show(error.message, 'danger')
  }
})
onBeforeUnmount(stopWatching)

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

    <!-- Not found / couldn't load -->
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState
        :icon="loadError === 'not-found' ? 'bi-journal-x' : 'bi-exclamation-triangle'"
        :title="loadError === 'not-found' ? 'Course not found' : `Couldn't load the course`"
      >
        <template v-if="loadError === 'not-found'">
          It may have been removed or the page couldn't be loaded.
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
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span v-if="course.archived" class="badge text-bg-secondary">Archived</span>
          <span class="badge text-bg-light">{{ RoleLabel[course.myRole] }}</span>
          <button
            v-if="course.isOwner"
            type="button"
            class="ca-btn ca-btn--secondary ca-btn--sm"
            @click="editing = !editing"
          >
            <i class="bi bi-pencil" />Edit
          </button>
          <button
            v-if="course.archived"
            type="button"
            class="ca-btn ca-btn--secondary ca-btn--sm"
            :disabled="changing"
            @click="setArchived(false)"
          >
            <i class="bi bi-arrow-counterclockwise" />Restore
          </button>
          <button
            v-else
            type="button"
            class="ca-btn ca-btn--secondary ca-btn--sm"
            @click="confirmArchive = true"
          >
            <i class="bi bi-archive" />Archive
          </button>
          <button
            v-if="course.isOwner"
            type="button"
            class="ca-btn ca-btn--ghost ca-btn--sm"
            :disabled="hasClasses"
            :title="hasClasses ? 'A course that has existing lessons can only be archived' : ''"
            @click="confirmDelete = true"
          >
            <i class="bi bi-trash" />Delete
          </button>
        </div>
      </div>

      <CourseForm
        v-if="editing"
        :course="course"
        submit-label="Save changes"
        :saving="saving"
        :error="editError"
        @save="saveCourse"
        @cancel="editing = false"
      />

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

      <!-- Lessons and their classes (Ray Yien's) -->
      <LessonLibrary v-if="tab === 'lessons'" :course="course" />

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

        <!-- students see who's online in a live class; the enrolment list is for staff only -->
        <div v-if="!isStaff" class="col-12 col-lg-6">
          <div class="ca-card h-100">
            <h2 class="fs-5 mb-3">In class now</h2>
            <p v-if="!liveClasses.length" class="text-body-secondary mb-0">
              No class is live right now.
            </p>
            <div v-for="c in liveClasses" :key="c.id" class="mb-3">
              <div class="ca-eyebrow mb-2">{{ c.title }} · {{ c.people.length }} online</div>
              <p v-if="!c.people.length" class="text-body-secondary mb-0">Nobody yet.</p>
              <ul v-else class="list-group">
                <li v-for="p in c.people" :key="p.userId" class="list-group-item">{{ p.name }}</li>
              </ul>
            </div>
          </div>
        </div>

        <div v-else class="col-12 col-lg-6">
          <div class="ca-card h-100">
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

    <ConfirmModal
      v-model:open="confirmDelete"
      title="Delete this course?"
      confirm-label="Delete course"
      variant="danger"
      :busy="changing"
      @confirm="deleteCourse"
    >
      This can't be undone.
    </ConfirmModal>

    <ConfirmModal
      v-model:open="confirmArchive"
      title="Archive this course?"
      confirm-label="Archive course"
      :busy="changing"
      @confirm="setArchived(true)"
    >
      It moves to your archived courses, and can be restored anytime. This action only applies to
      your list, nobody else is affected.
    </ConfirmModal>
  </div>
</template>
