<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLessonsStore } from '@/stores/lessons'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

// The Lessons tab on a course page: the course's lesson library.
// Staff see every lesson; students see only the ones that aren't drafts (RLS decides).
const props = defineProps({
  course: { type: Object, required: true }, // from courses.get(): has myRole and isOwner
})

const router = useRouter()
const lessonsStore = useLessonsStore()
const session = useSessionStore()
const toast = useToastStore()

const isProf = props.course.myRole === 'prof'
const lessons = ref([])
const loading = ref(true)
const loadError = ref('')
const search = ref('')
const startingId = ref(null)

const STATUS_BADGE = {
  draft: 'text-bg-secondary',
  ready: 'text-bg-success',
  archived: 'text-bg-light',
}
const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const updated = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    lessons.value = await lessonsStore.list(props.course.id, { search: search.value })
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Start a live class from a ready lesson, then open the teach view
async function startClass(lesson) {
  startingId.value = lesson.id
  try {
    const started = await session.start(lesson.id)
    router.push({ name: 'teach', params: { id: started.id } })
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    startingId.value = null
  }
}
</script>

<template>
  <div class="d-flex flex-column flex-sm-row gap-2 mb-3">
    <form class="flex-grow-1" @submit.prevent="load()">
      <input
        v-model="search"
        class="ca-input"
        type="search"
        placeholder="Search lessons"
        @search="load()"
      />
    </form>
    <RouterLink
      v-if="isProf"
      :to="{ name: 'lesson-new', params: { id: course.id } }"
      class="ca-btn ca-btn--primary"
    >
      <i class="bi bi-plus-lg" />New lesson
    </RouterLink>
  </div>

  <div v-if="loading" class="d-flex justify-content-center py-5">
    <span class="spinner-border text-primary" />
  </div>

  <div v-else-if="loadError" class="ca-surface">
    <EmptyState icon="bi-exclamation-triangle" title="Couldn't load the lessons">
      {{ loadError }}
    </EmptyState>
  </div>

  <div v-else-if="!lessons.length" class="ca-surface">
    <EmptyState icon="bi-journal-x" :title="search ? 'No matching lessons' : 'No lessons yet'">
      <template v-if="search">Try a different title.</template>
      <template v-else-if="isProf">Import starter code to create your first lesson.</template>
      <template v-else>Your instructor hasn't published any lessons yet.</template>
    </EmptyState>
  </div>

  <!-- each lesson stacks on phones and is one row from md -->
  <ul v-else class="list-group">
    <li
      v-for="lesson in lessons"
      :key="lesson.id"
      class="list-group-item"
      :data-testid="`lesson-row-${slug(lesson.title)}`"
    >
      <div class="row g-2 align-items-center">
        <div class="col-md-6">
          <div class="fw-semibold">{{ lesson.title }}</div>
          <div class="small text-body-secondary">
            <template v-if="lesson.week">Week {{ lesson.week }} · </template>Updated
            {{ updated(lesson.updatedAt) }}
          </div>
        </div>
        <div class="col-md-2">
          <span class="badge text-capitalize" :class="STATUS_BADGE[lesson.status]">
            {{ lesson.status }}
          </span>
        </div>
        <div v-if="isProf" class="col-md-4 d-flex gap-2 justify-content-md-end">
          <RouterLink
            :to="{ name: 'lesson-edit', params: { id: lesson.id } }"
            class="ca-btn ca-btn--secondary ca-btn--sm"
          >
            Edit
          </RouterLink>
          <button
            v-if="lesson.status === 'ready'"
            class="ca-btn ca-btn--primary ca-btn--sm"
            :disabled="startingId === lesson.id"
            :data-testid="`lesson-start-${slug(lesson.title)}`"
            @click="startClass(lesson)"
          >
            <span v-if="startingId === lesson.id" class="spinner-border spinner-border-sm" />
            Start class
          </button>
        </div>
      </div>
    </li>
  </ul>
</template>
