<script setup>
import { computed, ref } from 'vue'

// the course fields, for creating a course (CoursesView) and editing one (CourseView).
const props = defineProps({
  course: { type: Object, default: null }, // the course being edited; empty for a new one
  submitLabel: { type: String, required: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['save', 'cancel'])

// the term is stored as one string, like "AY2026/27 T1"
const [ay = '', termNo = ''] = props.course?.term.split(' ') ?? []
const form = ref({
  code: props.course?.code ?? '',
  title: props.course?.title ?? '',
  ay,
  termNo,
  section: props.course?.section ?? '',
})

// this academic year and the next, like AY2026/27 and AY2027/28. A new AY starts in August.
// when editing an older course, its own year stays in the list.
const now = new Date()
const firstYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
const academicYears = computed(() => {
  const years = [firstYear, firstYear + 1].map((y) => `AY${y}/${String(y + 1).slice(2)}`)
  return ay && !years.includes(ay) ? [ay, ...years] : years
})
const terms = ['T1', 'T2', 'T3A', 'T3B']

const codeError = ref('')

function save() {
  const { code, title, section } = form.value
  // like IS216: starts with a letter, ends with a number
  if (!/^[a-z].*\d$/i.test(code.trim())) {
    codeError.value = 'Invalid course code format'
    return
  }
  emit('save', {
    code: code.trim().toUpperCase(),
    title: title.trim(),
    term: `${form.value.ay} ${form.value.termNo}`,
    section: section.trim(),
  })
}
</script>

<template>
  <form class="ca-card mb-4" @submit.prevent="save">
    <div class="row g-3">
      <div class="ca-field col-12 col-sm-4">
        <label class="ca-label" for="course-code">Course code</label>
        <input
          id="course-code"
          v-model="form.code"
          class="ca-input text-uppercase"
          :class="{ 'ca-input--invalid': codeError }"
          placeholder="IS216"
          required
          @input="codeError = ''"
        />
        <p v-if="codeError" class="ca-field-error">{{ codeError }}</p>
      </div>
      <div class="ca-field col-12 col-sm-8">
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
      <div class="ca-field col-6 col-sm-4">
        <label class="ca-label" for="course-ay">Academic year</label>
        <select id="course-ay" v-model="form.ay" class="ca-input" required>
          <option value="" disabled>Choose…</option>
          <option v-for="y in academicYears" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <div class="ca-field col-6 col-sm-4">
        <label class="ca-label" for="course-term">Term</label>
        <select id="course-term" v-model="form.termNo" class="ca-input" required>
          <option value="" disabled>Choose…</option>
          <option v-for="t in terms" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="ca-field col-12 col-sm-4">
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
    <p v-if="error" class="ca-field-error mt-3">{{ error }}</p>
    <div class="d-flex flex-wrap gap-2 mt-3">
      <button type="submit" class="ca-btn ca-btn--primary" :disabled="saving">
        <span v-if="saving" class="spinner-border spinner-border-sm" />
        {{ submitLabel }}
      </button>
      <button type="button" class="ca-btn ca-btn--secondary" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
