<script setup>
// The "Import from GitHub" tab of New lesson: paste a public repo link, get its starter files.
// Emits `imported` with { files, entryFile, source }, which the page handles like an upload.
import { ref } from 'vue'
import { useGithubStore } from '@/stores/github'

const emit = defineEmits(['imported'])
const github = useGithubStore()

const repoUrl = ref('')
const error = ref('')
const loading = ref(false)

async function importRepo() {
  error.value = ''
  loading.value = true
  try {
    emit('imported', await github.importRepo(repoUrl.value.trim()))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="ca-field" @submit.prevent="importRepo">
    <label class="ca-label" for="repo">Public GitHub repository</label>
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
      The whole repository, or one folder of it (…/tree/main/week6). Public repositories only.
    </p>
  </form>
</template>
