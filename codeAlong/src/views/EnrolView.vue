<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'

// /enrol        → type the code the prof shows
// /enrol/:code  → the shared link or QR: submitted straight away.
// Logged-out visitors are sent to log in (or register) first; returnTo brings them back here.
const props = defineProps({ code: { type: String, default: '' } })

const courses = useCoursesStore()
const toast = useToastStore()
const router = useRouter()

const enrolCode = ref(props.code)
const isSubmitting = ref(false)
const errorMsg = ref('')

// Codes are 6 upper-case letters and digits; accept "wad2g2" or "WAD-2G2" too
const clean = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function enrol() {
  const code = clean(enrolCode.value)
  if (code.length !== 6) {
    errorMsg.value = 'Enter the 6-character code from your instructor'
    return
  }
  isSubmitting.value = true
  errorMsg.value = ''

  try {
    const course = await courses.enrol(code)
    toast.show(`You're enrolled in ${course.code} · ${course.title}`, 'success')
    router.replace({ name: 'course', params: { id: course.id } })
  } catch (error) {
    // NOT_FOUND covers wrong and archived codes alike; the rest have their own message
    errorMsg.value = error.code === 'NOT_FOUND' ? 'No course with that code' : error.message
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (props.code) enrol()
})
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <h1>Enrol in a course</h1>
    </div>
    <p class="text-body-secondary">
      Enter the code your instructor gave you. You only need to do this once per course.
    </p>

    <form class="row g-3 align-items-end" @submit.prevent="enrol()">
      <div class="ca-field col-sm-6 col-md-4">
        <label class="ca-label" for="enrol-code">Enrol code</label>
        <input
          id="enrol-code"
          v-model="enrolCode"
          class="ca-input ca-mono fs-4 text-uppercase"
          :aria-invalid="!!errorMsg"
          data-testid="input-enrol-code"
        />
      </div>
      <div class="col-auto">
        <button class="ca-btn ca-btn--primary" :disabled="isSubmitting" data-testid="btn-enrol">
          {{ isSubmitting ? 'Enrolling…' : 'Enrol' }}
        </button>
      </div>
    </form>

    <p v-if="errorMsg" class="ca-field-error mt-2">{{ errorMsg }}</p>
  </div>
</template>
