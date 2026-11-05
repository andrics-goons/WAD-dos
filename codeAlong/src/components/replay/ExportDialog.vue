<script setup>
// "Export to GitHub" on the replay: a new repo on my own GitHub, one commit per checkpoint.
// needs a GitHub sign-in; if there isn't one (never connected, or Supabase
// dropped GitHub's token when it refreshed the session) it offers to reconnect and come back here.
//   <ExportDialog v-model:open="show" :session-id="id" default-name="week-6-mini-cart" @exported="url = $event" />
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isValidRepoName } from '@shared/github.js'
import { useAuthStore } from '@/stores/auth'
import { useGithubStore } from '@/stores/github'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  sessionId: { type: String, required: true },
  defaultName: { type: String, default: '' },
  mine: { type: Boolean, default: false }, // my own final code as one commit, not the prof's checkpoints
})
// exported(repoUrl): the new repo's commit history on GitHub
const emit = defineEmits(['update:open', 'exported'])

const github = useGithubStore()
const auth = useAuthStore()
const route = useRoute()

const name = ref('')
const isPrivate = ref(false)
const nameError = ref('') // something to fix in the name, e.g. it's taken
const error = ref('') // anything else
const needsGithub = ref(false) // not connected, expired, or not allowed to create repos
const busy = ref(false)

// leaves for GitHub and comes back to this replay
async function reconnect() {
  busy.value = true
  try {
    await auth.connectGitHub(route.fullPath)
  } catch (err) {
    error.value = err.message
    needsGithub.value = false
    busy.value = false
  }
}

// start fresh every time it opens
watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.defaultName
    isPrivate.value = false
    nameError.value = error.value = ''
    needsGithub.value = false
  },
)

async function exportRepo() {
  nameError.value = error.value = ''
  needsGithub.value = false
  if (!isValidRepoName(name.value.trim())) {
    nameError.value = 'Use only letters, numbers, - _ and . (up to 100 characters)'
    return
  }
  busy.value = true
  try {
    const { repoUrl } = await github.exportSession(
      props.sessionId,
      name.value.trim(),
      isPrivate.value,
      props.mine,
    )
    emit('exported', repoUrl)
    emit('update:open', false)
  } catch (err) {
    if (err.code === 'CONFLICT' || err.code === 'BAD_REQUEST') nameError.value = err.message
    else if (err.code === 'UNAUTHENTICATED' || err.code === 'FORBIDDEN') {
      needsGithub.value = true
      error.value = err.message
    } else error.value = err.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ConfirmModal
    :open="open"
    title="Export to GitHub"
    confirm-label="Export"
    :busy="busy"
    @update:open="emit('update:open', $event)"
    @confirm="exportRepo"
  >
    <p v-if="mine">A new repository on your GitHub, with your code at the end of the class.</p>
    <p v-else>A new repository on your GitHub, with one commit per checkpoint.</p>
    <form @submit.prevent="exportRepo">
      <div class="ca-field mb-2">
        <label class="ca-label" for="export-repo-name">Repository name</label>
        <input
          id="export-repo-name"
          v-model="name"
          class="ca-input"
          :class="{ 'ca-input--invalid': nameError }"
          maxlength="100"
        />
        <p v-if="nameError" class="ca-field-error">{{ nameError }}</p>
      </div>
      <div class="form-check">
        <input id="export-private" v-model="isPrivate" class="form-check-input" type="checkbox" />
        <label class="form-check-label" for="export-private">Private repository</label>
      </div>
    </form>
    <p v-if="error" class="ca-field-error mt-2">{{ error }}</p>
    <button
      v-if="needsGithub"
      type="button"
      class="ca-btn ca-btn--secondary mt-2"
      :disabled="busy"
      data-testid="btn-connect-github"
      @click="reconnect"
    >
      <i class="bi bi-github" />Reconnect GitHub
    </button>
  </ConfirmModal>
</template>
