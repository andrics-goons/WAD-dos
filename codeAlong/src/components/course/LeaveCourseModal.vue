<script setup>
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

// "Leave this course?" for a student, with the warning that their code and replays in it are
// deleted. Used on the course page and in the ⋯ menu on the My courses cards.
//   <LeaveCourseModal v-model:open="show" :title="course.title" :busy="leaving" @confirm="leave" />
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' }, // the course's name
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'confirm'])
</script>

<template>
  <ConfirmModal
    :open="open"
    :title="`Leave ${title}?`"
    confirm-label="Leave course"
    variant="danger"
    :busy="busy"
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm')"
  >
    <p>
      <strong>Your code and replays in this course will be deleted.</strong> That's your saved code
      from every class, your progress, your help requests and your notes. You'll no longer be able
      to open the course's replays.
    </p>
    <p class="mb-0">
      This can't be undone. You can join again with the enrol code, but you won't get any of it
      back.
    </p>
  </ConfirmModal>
</template>
