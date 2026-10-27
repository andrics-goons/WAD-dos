<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

// Profile page: link a GitHub account to this one, so a replay can be exported to GitHub
// (one commit per checkpoint). Connecting leaves for GitHub and comes back here.
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const busy = ref(false)

onMounted(async () => {
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
    await auth.connectGitHub()
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
  <div class="ca-card h-100">
    <h2 class="h3"><i class="bi bi-github" /> GitHub</h2>

    <div v-if="loading" class="spinner-border spinner-border-sm text-primary">
      <span class="visually-hidden">Checking GitHub…</span>
    </div>

    <template v-else-if="auth.github">
      <p class="mb-1" data-testid="github-username">
        Connected as <strong>@{{ auth.github.username }}</strong>
      </p>
      <p class="text-body-secondary small mb-4">You can export a class's replay to your GitHub.</p>
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
