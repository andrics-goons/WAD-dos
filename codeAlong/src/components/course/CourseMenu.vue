<script setup>
import { ref, watch } from 'vue'

// The ⋯ menu on a course in My courses (the cards and the archived list):
//   Archive (or Restore, once archived) · Leave course (a student) · Delete (the owner, until a
//   class has run in the course; after that it's greyed out, and the ? says why).
// The page decides which menu is open (one at a time) and what each choice does.
//   <CourseMenu :course="c" :open="menuFor === c.id" @toggle="toggleMenu(c)" @archive="…" />
const props = defineProps({
  course: { type: Object, required: true }, // from listCourses: code, myRole, isOwner, hasClasses, archived
  open: { type: Boolean, default: false },
})
defineEmits(['toggle', 'archive', 'restore', 'delete', 'leave'])

// the ? on a greyed-out Delete: hover shows it as a tooltip, click shows it under the row
const showWhy = ref(false)
watch(
  () => props.open,
  () => (showWhy.value = false),
)
const reason = () =>
  props.course.archived
    ? "It has classes, so it can't be deleted."
    : "It has classes, so it can't be deleted. Archive it instead."
</script>

<template>
  <!-- the card is clickable, so a click in here must not reach it -->
  <div class="dropdown" @click.stop>
    <!-- as tall as the text beside it (not the 32px kit button), so it doesn't push the card's
         header row, and the gap above the text, taller than the card's padding -->
    <button
      type="button"
      class="border-0 bg-transparent rounded p-1 lh-1 text-body-secondary"
      :data-testid="`course-menu-${course.code}`"
      @click="$emit('toggle')"
    >
      <i class="bi bi-three-dots-vertical" />
      <span class="visually-hidden">Course options</span>
    </button>
    <div class="dropdown-menu top-100 end-0" :class="{ show: open }">
      <button
        v-if="course.archived"
        type="button"
        class="dropdown-item"
        :data-testid="`course-restore-${course.code}`"
        @click="$emit('restore')"
      >
        <i class="bi bi-arrow-counterclockwise me-2" />Restore
      </button>
      <button v-else type="button" class="dropdown-item" @click="$emit('archive')">
        <i class="bi bi-archive me-2" />Archive
      </button>

      <!-- a student can't delete a course; they leave it (their code in it is deleted) -->
      <button
        v-if="course.myRole === 'student'"
        type="button"
        class="dropdown-item text-danger"
        :data-testid="`course-leave-${course.code}`"
        @click="$emit('leave')"
      >
        <i class="bi bi-box-arrow-left me-2" />Leave course
      </button>

      <template v-if="course.isOwner">
        <button
          v-if="!course.hasClasses"
          type="button"
          class="dropdown-item text-danger"
          @click="$emit('delete')"
        >
          <i class="bi bi-trash me-2" />Delete
        </button>
        <template v-else>
          <div class="dropdown-item-text d-flex align-items-center">
            <span class="text-danger opacity-50"><i class="bi bi-trash me-2" />Delete</span>
            <button
              type="button"
              class="border-0 bg-transparent p-0 lh-1 ms-auto text-danger opacity-50"
              :title="reason()"
              :data-testid="`course-why-no-delete-${course.code}`"
              @click="showWhy = !showWhy"
            >
              <i class="bi bi-question-circle" />
              <span class="visually-hidden">Why can't I delete it?</span>
            </button>
          </div>
          <p v-if="showWhy" class="dropdown-item-text small text-body-secondary mb-0">
            {{ reason() }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
