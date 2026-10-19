<script setup>
import { ref } from 'vue'
import JoinCodeInput from '@/components/ui/JoinCodeInput.vue'

// Karin's page — Ying Qi added the code boxes. To finish it (design-docs/04, T-SESS-03–05):
// 1. On @complete, call useSessionStore().join(code) → { session_id, role }.
// 2. Go to /s/<session_id>/code for a student, /s/<session_id>/teach for staff.
// 3. On an error, show error.message under the boxes and set :invalid="true".
//    (NOT_FOUND "No live class with that code", FORBIDDEN "You're not in this course")
const props = defineProps({ code: { type: String, default: '' } })

// /join/<code> from a QR code fills the boxes straight away
const joinCode = ref(props.code)
</script>

<template>
  <div class="ca-page">
    <div class="row justify-content-center">
      <div class="col-12 col-sm-10 col-md-7 col-lg-5">
        <div class="ca-card text-center">
          <h1 class="mb-2">Join a class</h1>
          <p class="text-body-secondary mb-4">Enter the code on the projector</p>
          <JoinCodeInput v-model="joinCode" />
        </div>
      </div>
    </div>
  </div>
</template>
