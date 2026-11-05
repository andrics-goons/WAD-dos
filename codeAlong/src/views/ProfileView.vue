<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useRoute, useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import { Role, RoleLabel } from '@shared/constants'
import TelegramLinkCard from '@/components/help/TelegramLinkCard.vue'
import GitHubLinkCard from '@/components/auth/GitHubLinkCard.vue'
import DeleteAccountCard from '@/components/auth/DeleteAccountCard.vue'
import TaCoursesCard from '@/components/auth/TaCoursesCard.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const courses = useCoursesStore()

// Courses I'm a TA in. Anyone can be one (a prof too, in another prof's course), so this
// comes from the courses, not my account role.
const taCourses = computed(() => courses.courses.filter((c) => c.myRole === Role.TA))
onMounted(() => courses.load().catch((error) => toast.show(error.message, 'danger')))

// The sidebar: one chapter shows at a time. It's in the URL, so a reload stays on it and
// connecting GitHub comes back to it (?chapter=connections).
const CHAPTERS = [
  { key: 'profile', label: 'Profile', icon: 'bi-person' },
  { key: 'connections', label: 'Connections', icon: 'bi-link-45deg' },
]
const chapter = computed(() =>
  CHAPTERS.some((c) => c.key === route.query.chapter) ? route.query.chapter : 'profile',
)
const openChapter = (key) => router.replace({ query: key === 'profile' ? {} : { chapter: key } })

const isSubmitting = ref(false)

async function logout() {
  isSubmitting.value = true
  try {
    await auth.logout()
    router.replace('/login')
    toast.show('Logged Out Successfully', 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    isSubmitting.value = false
  }
}

// Change name
const name = ref(auth.user?.name ?? '')
const savingName = ref(false)
const nameError = ref('')

async function saveName() {
  savingName.value = true
  nameError.value = ''
  try {
    await auth.updateName(name.value)
    name.value = auth.user.name
    toast.show('Name updated', 'success')
  } catch (error) {
    nameError.value = error.code === 'VALIDATION_FAILED' ? 'Use 2 to 60 characters' : error.message
  } finally {
    savingName.value = false
  }
}

// Change password
const currentPassword = ref('')
const newPassword = ref('')
const savingPassword = ref(false)
const passwordError = ref('')

async function savePassword() {
  savingPassword.value = true
  passwordError.value = ''
  try {
    await auth.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    toast.show('Password changed', 'success')
  } catch (error) {
    passwordError.value = error.message
  } finally {
    savingPassword.value = false
  }
}
</script>

<template>
  <!-- v-if: after a logout (here or in another tab) user is null for a moment before
       the page changes, and every auth.user.x below would throw -->
  <div v-if="auth.user" class="ca-page">
    <div class="ca-page-header">
      <h1>Profile</h1>
      <button
        class="ca-btn ca-btn--secondary"
        :disabled="isSubmitting"
        data-testid="btn-logout"
        @click="logout()"
      >
        <i class="bi bi-box-arrow-right" />Log out
      </button>
    </div>

    <div class="row g-4">
      <!-- beside the chapter from lg; a row of pills above it on phones -->
      <nav class="col-12 col-lg-3">
        <ul class="nav nav-pills nav-fill flex-nowrap flex-lg-column gap-1">
          <li v-for="c in CHAPTERS" :key="c.key" class="nav-item">
            <button
              type="button"
              class="nav-link w-100 text-lg-start"
              :class="{ active: chapter === c.key }"
              :data-testid="`profile-chapter-${c.key}`"
              @click="openChapter(c.key)"
            >
              <i class="bi me-2 d-none d-sm-inline" :class="c.icon" />{{ c.label }}
            </button>
          </li>
        </ul>
      </nav>

      <div class="col-12 col-lg-8 col-xl-7">
        <!-- v-show: switching chapters keeps what's half typed, and a Telegram link in progress -->
        <div v-show="chapter === 'profile'" data-testid="chapter-profile">
          <section>
            <h2 class="h3">Your details</h2>
            <p class="mb-1">
              Email: <strong>{{ auth.user.email }}</strong>
              <span v-if="!auth.user.hasPassword" class="text-body-secondary small">
                (from your GitHub account)
              </span>
            </p>
            <p class="mb-1">
              <!-- a TA account is a student who helps in some courses: those are listed below -->
              Role:
              <strong>{{ RoleLabel[auth.role === Role.TA ? Role.STUDENT : auth.role] }}</strong>
            </p>
            <!-- the update policy locks role, so explain who can change it (04: error states) -->
            <p class="text-body-secondary small mb-4">
              Picked the wrong account type? You can't change it yourself — ask an admin.
            </p>

            <form class="d-flex flex-column gap-3" @submit.prevent="saveName()">
              <div class="ca-field">
                <label class="ca-label" for="profile-name">Name</label>
                <input
                  id="profile-name"
                  v-model="name"
                  class="ca-input"
                  required
                  :class="{ 'ca-input--invalid': nameError }"
                  data-testid="input-profile-name"
                />
                <p v-if="nameError" class="ca-field-error mb-0">{{ nameError }}</p>
              </div>
              <div>
                <button
                  type="submit"
                  class="ca-btn ca-btn--primary"
                  :disabled="savingName || name.trim() === auth.user.name"
                  data-testid="btn-save-name"
                >
                  <span v-if="savingName" class="spinner-border spinner-border-sm" />
                  Save name
                </button>
              </div>
            </form>
          </section>
          <hr class="my-4" />
          <!-- an account made with "Continue with GitHub" has no password to change -->
          <section v-if="!auth.user.hasPassword">
            <h2 class="h3">Password</h2>
            <p class="text-body-secondary mb-0">
              You log in with GitHub, so there's no CodeAlong password to change.
            </p>
          </section>
          <section v-else>
            <h2 class="h3">Password</h2>
            <form class="d-flex flex-column gap-3" @submit.prevent="savePassword()">
              <div class="ca-field">
                <label class="ca-label" for="current-password">Current password</label>
                <input
                  id="current-password"
                  v-model="currentPassword"
                  type="password"
                  class="ca-input"
                  required
                  :class="{ 'ca-input--invalid': passwordError }"
                  data-testid="input-current-password"
                />
              </div>
              <div class="ca-field">
                <label class="ca-label" for="new-password">New password</label>
                <input
                  id="new-password"
                  v-model="newPassword"
                  type="password"
                  class="ca-input"
                  required
                  :class="{ 'ca-input--invalid': passwordError }"
                  data-testid="input-new-password"
                />
                <p v-if="passwordError" class="ca-field-error mb-0">
                  {{ passwordError }}
                </p>
                <p v-else class="ca-field-hint mb-0">At least 6 characters</p>
              </div>
              <div>
                <button
                  type="submit"
                  class="ca-btn ca-btn--primary"
                  :disabled="savingPassword"
                  data-testid="btn-change-password"
                >
                  <span v-if="savingPassword" class="spinner-border spinner-border-sm" />
                  Change password
                </button>
              </div>
            </form>
          </section>
          <template v-if="taCourses.length">
            <hr class="my-4" />
            <TaCoursesCard :courses="taCourses" />
          </template>
          <hr class="my-4" />
          <DeleteAccountCard />
        </div>

        <div v-show="chapter === 'connections'" data-testid="chapter-connections">
          <GitHubLinkCard />
          <hr class="my-4" />
          <TelegramLinkCard />
        </div>
      </div>
    </div>
  </div>
</template>
