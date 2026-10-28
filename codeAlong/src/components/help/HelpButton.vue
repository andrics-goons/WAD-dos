<script setup>
import { ref } from 'vue'
import StudentHelpPanel from '@/components/help/StudentHelpPanel.vue'

// The workspace's Help button. It opens a pop-up with Check my work, Ask for help and the
// status of my requests. The panel stays mounted while the pop-up is closed, so a TA's reply
// is still received. Props are passed straight to the panel.
defineProps({
  sessionId: { type: String, required: true },
  files: { type: Array, required: true },
})

const open = ref(false)
</script>

<template>
  <button
    type="button"
    class="ca-btn ca-btn--secondary"
    data-testid="btn-help"
    @click="open = true"
  >
    <i class="bi bi-question-circle" />
    <span class="d-none d-lg-inline">Help</span>
    <span class="visually-hidden d-lg-none">Help</span>
  </button>

  <Teleport to="body">
    <div v-show="open" class="ca-modal-backdrop" @click.self="open = false">
      <div class="ca-modal">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <h2 class="fs-5 mb-0">Need a hand?</h2>
          <button type="button" class="ca-btn ca-btn--ghost ca-btn--icon" @click="open = false">
            <i class="bi bi-x-lg" /><span class="visually-hidden">Close</span>
          </button>
        </div>
        <StudentHelpPanel :session-id="sessionId" :files="files" />
      </div>
    </div>
  </Teleport>
</template>
