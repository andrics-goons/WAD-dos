<script setup>
// The "Import from GitHub" tab of New lesson: paste a repo link, get its starter files.
// The prof's own GitHub reads the repo, so they connect GitHub first; it comes back to this tab.
// Emits `imported` with { files, entryFile, source }, which the page handles like an upload.
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGithubStore } from '@/stores/github'

const emit = defineEmits(['imported'])
const github = useGithubStore()
const auth = useAuthStore()
const route = useRoute()

const repoUrl = ref('')
const error = ref('')
const needsGithub = ref(false) // not connected, or the connection expired
const loading = ref(false)

async function importRepo() {
  error.value = ''
  needsGithub.value = false
  loading.value = true
  try {
    emit('imported', await github.importRepo(repoUrl.value.trim()))
  } catch (err) {
    if (err.code === 'UNAUTHENTICATED') needsGithub.value = true
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function connect() {
  loading.value = true
  try {
    await auth.connectGitHub(`${route.path}?source=github`)
  } catch (err) {
    error.value = err.message
    loading.value = false
  }
}
</script>

<template>
  <form class="ca-field" @submit.prevent="importRepo">
    <label class="ca-label" for="repo">GitHub repository</label>
    <div class="d-flex flex-column flex-sm-row gap-2">
      <input
        id="repo"
        v-model="repoUrl"
        type="url"
        class="ca-input"
        :class="{ 'ca-input--invalid': error }"
        placeholder="https://github.com/your-prof/week6-mini-cart"
        required
      />
      <button type="submit" class="ca-btn ca-btn--primary" :disabled="loading || !repoUrl.trim()">
        <span v-if="loading" class="spinner-border spinner-border-sm" />Import
      </button>
    </div>
    <p v-if="error" class="ca-field-error">{{ error }}</p>
    <p v-else class="ca-field-hint">
      The whole repository, or one folder of it (…/tree/main/week6). Read with your own GitHub
      account, so private repositories you can open work too. CodeAlong adds its error reporter
      (src/ca-probe.js) so students' errors reach you.
    </p>
    <button
      v-if="needsGithub"
      type="button"
      class="ca-btn ca-btn--secondary align-self-start"
      :disabled="loading"
      data-testid="btn-connect-github"
      @click="connect"
    >
      <i class="bi bi-github" />Connect GitHub
    </button>
  </form>
</template>
