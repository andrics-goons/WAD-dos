<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

// profile page: link a GitHub account to this one, so a replay can be exported to GitHub
// (one commit per checkpoint). connecting leaves for GitHub and comes back here.
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const busy = ref(false)

onMounted(async () => {
  // GitHub sends us back with the reason in the URL when linking failed (like that GitHub
  // belongs to another account); say so instead of showing a card that looks untouched
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
  if (params.get('error_description')) {
    toast.show(params.get('error_description').replace(/\+/g, ' '), 'danger')
  }
  try {
    await auth.loadGitHub()
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    loading.value = false
  }
})

async function connect() {
  busy.value = true
  try {
    await auth.connectGitHub('/profile?chapter=connections')
  } catch (error) {
    toast.show(error.message, 'danger')
    busy.value = false
  }
}

async function disconnect() {
  busy.value = true
  try {
    await auth.disconnectGitHub()
    toast.show('GitHub disconnected', 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="h3"><i class="bi bi-github" /> GitHub</h2>

    <div v-if="loading" class="spinner-border spinner-border-sm text-primary">
      <span class="visually-hidden">Checking GitHub…</span>
    </div>

    <template v-else-if="auth.github">
      <p class="small mb-4" data-testid="github-username">
        <i class="bi bi-check-circle-fill me-1" />Connected as
        <strong>@{{ auth.github.username }}</strong
        >. You can export a class's replay to your GitHub, and import a repo as a lesson.
      </p>
      <button
        type="button"
        class="ca-btn ca-btn--secondary"
        :disabled="busy || !auth.github.canDisconnect"
        data-testid="btn-disconnect-github"
        @click="disconnect()"
      >
        Disconnect
      </button>
      <p v-if="!auth.github.canDisconnect" class="ca-field-hint mt-2 mb-0">
        You log in with GitHub, so it can't be disconnected.
      </p>
    </template>

    <template v-else>
      <p class="text-body-secondary small mb-4">
        Connect GitHub to export a class's replay as a repo, one commit per step.
      </p>
      <button
        type="button"
        class="ca-btn ca-btn--primary"
        :disabled="busy"
        data-testid="btn-connect-github"
        @click="connect()"
      >
        <span v-if="busy" class="spinner-border spinner-border-sm" />
        <i v-else class="bi bi-github" />
        Connect GitHub
      </button>
    </template>
  </div>
</template>
