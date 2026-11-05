<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode' // Source: https://github.com/soldair/node-qrcode (MIT)
import { CourseRole, Role, RoleLabel, SessionStatus } from '@shared/constants.js'
import { useCourseStore } from '@/stores/course'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import LeaveCourseModal from '@/components/course/LeaveCourseModal.vue'
import LessonLibrary from '@/components/lesson/LessonLibrary.vue'
import CourseForm from '@/components/course/CourseForm.vue'

// one course: its lessons (each with its classes) and its people. the owner also gets the enrol link.
const props = defineProps({ id: { type: String, required: true } })

const store = useCourseStore()
const toast = useToastStore()
const router = useRouter()

const course = ref(null)
const loading = ref(true)
const loadError = ref('') // also covers "not yours": the database hides it, so it reads as not found

const staff = ref([])
// the Staff card: the prof who runs the course on top, then the TAs
const profs = computed(() => staff.value.filter((s) => s.role === CourseRole.PROF))
const tas = computed(() => staff.value.filter((s) => s.role === CourseRole.TA))
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

// edit or delete the course (owner), archive it from your own list (anyone)
// A course I've archived is read-only for me until I restore it: no editing, sharing or people changes
const canManage = computed(() => course.value?.isOwner && !course.value.archived)
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

// a student leaves the course: their code, progress and notes in it are deleted
const confirmLeave = ref(false)
async function leaveCourse() {
  changing.value = true
  try {
    await store.leave(props.id)
    toast.show(`You left ${course.value.title}`, 'success')
    router.replace({ name: 'courses' })
  } catch (error) {
    confirmLeave.value = false
    toast.show(error.message, 'danger')
  } finally {
    changing.value = false
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

// share enrolment (owner)
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

// people: who's online in each live class. students see the names per class; staff see a
// dot beside each enrolled student who is online.
const isStaff = computed(() => [Role.PROF, Role.TA].includes(course.value?.myRole))
const liveClasses = ref([])
const onlineIds = computed(
  () => new Set(liveClasses.value.flatMap((c) => c.people.map((p) => p.userId))),
)
let closeChannels = []
function stopWatching() {
  closeChannels.forEach((close) => close())
  closeChannels = []
}
watch(tab, async (now) => {
  stopWatching()
  if (now !== 'people') return
  try {
    const sessions = await store.sessions(props.id)
    if (tab.value !== 'people') return
    liveClasses.value = sessions
      .filter((s) => s.status === SessionStatus.LIVE)
      .map((s) => ({ id: s.id, title: s.lessons.title, people: [] }))
    closeChannels = liveClasses.value.map((c) =>
      store.watchPresent(c.id, (people) => (c.people = people)),
    )
  } catch (error) {
    toast.show(error.message, 'danger')
  }
})
onBeforeUnmount(stopWatching)

// people (owner): add or remove a TA, remove a student
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

const taToRemove = ref(null)
async function removeTa() {
  removing.value = true
  try {
    await store.removeTa(props.id, taToRemove.value.user_id)
    staff.value = staff.value.filter((s) => s.user_id !== taToRemove.value.user_id)
    toast.show(`${taToRemove.value.name} is no longer a TA here`, 'success')
    taToRemove.value = null
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    removing.value = false
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
    <!-- loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the course…</span>
      </span>
    </div>

    <!-- not found / couldn't load -->
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
          <!-- who I am in this course, next to which course it is -->
          <div class="d-flex align-items-center gap-2">
            <span class="ca-eyebrow"
              >{{ course.code }} · {{ course.section }} · {{ course.term }}</span
            >
            <span class="badge text-bg-light">{{ RoleLabel[course.myRole] }}</span>
          </div>
          <h1>{{ course.title }}</h1>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span v-if="course.archived" class="badge text-bg-secondary">Archived</span>
          <button
            v-if="canManage"
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
          <!-- students and TAs: a prof owns the course -->
          <button
            v-if="course.myRole === Role.STUDENT || course.myRole === Role.TA"
            type="button"
            class="ca-btn ca-btn--danger ca-btn--sm"
            data-testid="btn-leave-course"
            @click="confirmLeave = true"
          >
            <i class="bi bi-box-arrow-left" />Leave course
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
        v-if="editing && canManage"
        :course="course"
        submit-label="Save changes"
        :saving="saving"
        :error="editError"
        @save="saveCourse"
        @cancel="editing = false"
      />

      <!-- share enrolment (owner) -->
      <section v-if="canManage" class="ca-card mb-4">
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

      <!-- tabs -->
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

      <!-- lessons and their classes -->
      <LessonLibrary v-if="tab === 'lessons'" :course="course" />

      <!-- people -->
      <section v-else class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="ca-card h-100">
            <h2 class="fs-5 mb-3">Staff</h2>

            <!-- the prof who runs the course -->
            <div v-for="p in profs" :key="p.user_id" class="d-flex align-items-center gap-2 mb-3">
              <span class="ca-avatar">{{ p.name[0] }}</span>
              <div>
                <div class="fw-semibold">{{ p.name }}</div>
                <div class="small text-body-secondary">{{ RoleLabel[p.role] }}</div>
              </div>
            </div>

            <!-- the TAs, laid out like the students list -->
            <div class="ca-eyebrow mb-2">Teaching assistants ({{ tas.length }})</div>
            <p v-if="!tas.length" class="text-body-secondary">No TAs yet.</p>
            <ul v-else class="list-group mb-3">
              <li
                v-for="p in tas"
                :key="p.user_id"
                class="list-group-item d-flex align-items-center justify-content-between"
              >
                {{ p.name }}
                <button
                  v-if="canManage"
                  type="button"
                  class="ca-btn ca-btn--ghost ca-btn--sm"
                  data-testid="btn-remove-ta"
                  @click="taToRemove = p"
                >
                  Remove
                </button>
              </li>
            </ul>

            <!-- the owner adds TAs by the email they signed up with -->
            <form v-if="canManage" class="ca-field" @submit.prevent="addTa">
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
                <span>
                  {{ p.name }}
                  <i
                    v-if="onlineIds.has(p.user_id)"
                    class="bi bi-circle-fill text-success small ms-1"
                    title="Online in a live class"
                  />
                </span>
                <button
                  v-if="canManage"
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
      :open="!!taToRemove"
      :title="`Remove ${taToRemove?.name} as a TA?`"
      confirm-label="Remove TA"
      variant="danger"
      :busy="removing"
      @update:open="(open) => !open && (taToRemove = null)"
      @confirm="removeTa"
    >
      They'll lose access to this course's classes and help queue. Help requests they'd claimed go
      back to the queue, and their past replies stay.
    </ConfirmModal>

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

    <LeaveCourseModal
      v-model:open="confirmLeave"
      :title="course?.title"
      :ta="course?.myRole === Role.TA"
      :busy="changing"
      @confirm="leaveCourse"
    />

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
