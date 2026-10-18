<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCoursesStore } from '@/stores/courses'
import { useToastStore } from '@/stores/toast'

// /enrol        → type the code the prof shows
// /enrol/:code  → the shared link or QR: pre-filled and submitted straight away.
// Logged-out visitors are sent to log in (or register) first; returnTo brings them back here.
const props = defineProps({ code: { type: String, default: '' } })

const courses = useCoursesStore()
const toast = useToastStore()
const router = useRouter()

const CODE_LENGTH = 6
// Codes are upper-case letters and digits. Accept "wad2g2" or "WAD-2G2" and tidy it up.
// (No maxlength on the input: it would cut a pasted "WAD-2G2" before this runs.)
const clean = (value) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)

const enrolCode = ref(clean(props.code))
const isSubmitting = ref(false)
const errorMsg = ref('')

async function enrol() {
  if (enrolCode.value.length !== CODE_LENGTH) {
    errorMsg.value = `Enter the ${CODE_LENGTH}-character code from your instructor`
    return
  }
  isSubmitting.value = true
  errorMsg.value = ''

  try {
    const course = await courses.enrol(enrolCode.value)
    toast.show(`You're enrolled in ${course.code} · ${course.title}`, 'success')
    router.replace({ name: 'course', params: { id: course.id } })
  } catch (error) {
    // NOT_FOUND covers wrong and archived codes alike; the rest have their own message
    // (e.g. CONFLICT: you're on this course's staff)
    errorMsg.value = error.code === 'NOT_FOUND' ? 'No course with that code' : error.message
  } finally {
    isSubmitting.value = false
  }
}

function onInput(event) {
  enrolCode.value = clean(event.target.value)
  event.target.value = enrolCode.value // keep the box showing the tidied code
  errorMsg.value = ''
}

onMounted(() => {
  if (enrolCode.value.length === CODE_LENGTH) enrol()
})
</script>

<template>
  <h1>Enrol in a course</h1>
  <p>Enter the code your instructor gave you. You only need to do this once per course.</p>

  <form @submit.prevent="enrol()" novalidate>
    <label for="enrol-code">Enrol code</label>
    <input
      id="enrol-code"
      class="form-control enrol-code"
      data-testid="input-enrol-code"
      :value="enrolCode"
      @input="onInput"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      placeholder="WAD2G2"
      :aria-invalid="errorMsg ? 'true' : 'false'"
      aria-describedby="enrol-error"
    />

    <button
      type="submit"
      class="ca-btn ca-btn--primary"
      data-testid="btn-enrol"
      :disabled="isSubmitting"
    >
      {{ isSubmitting ? 'Enrolling…' : 'Enrol' }}
    </button>
  </form>

  <p v-if="errorMsg" id="enrol-error" class="text-danger" role="alert">{{ errorMsg }}</p>
</template>

<style scoped>
.enrol-code {
  max-width: 12rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}
</style>
