<script setup>
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

// "Leave this course?" for a student, with the warning that their code and replays in it are
// deleted, or for a TA, who only stops helping there. Used on the course page and in the ⋯ menu on
// the My courses cards.
//   <LeaveCourseModal v-model:open="show" :title="course.title" :ta="isTa" :busy="leaving" @confirm="leave" />
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' }, // the course's name
  ta: { type: Boolean, default: false }, // a TA leaving: nothing of theirs is deleted
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
    <template v-if="ta">
      <p>
        You'll stop being a TA here: the course, its classes and its help queue go from your list.
        Requests you've claimed go back to the queue. Your past replies stay.
      </p>
      <p class="mb-0">The prof can add you as a TA again.</p>
    </template>
    <template v-else>
      <p>
        <strong>Your code and replays in this course will be deleted.</strong> That's your saved
        code from every class, your progress, your help requests and your notes. You'll no longer be
        able to open the course's replays.
      </p>
      <p class="mb-0">
        This can't be undone. You can join again with the enrol code, but you won't get any of it
        back.
      </p>
    </template>
  </ConfirmModal>
</template>
