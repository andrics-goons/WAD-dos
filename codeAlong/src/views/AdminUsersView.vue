<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

// /admin/users — the one admin page: every account, and a role dropdown for each.
// The admin's own row is locked: nobody can change their own role, so an admin can
// never accidentally remove the last admin.
const ROLES = ['student', 'ta', 'prof', 'admin']
const ROLE_LABEL = { student: 'Student', ta: 'TA', prof: 'Educator', admin: 'Admin' }

const admin = useAdminStore()
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')
const search = ref('')
const busyId = ref(null) // the user whose role is being saved

const isMe = (user) => user.id === auth.user?.id

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return admin.users
  return admin.users.filter(
    (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role === q,
  )
})

const joined = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

onMounted(async () => {
  try {
    await admin.load()
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// A role change is confirmed first. Picking a role only opens the dialog; the dropdown
// shows the new role once the server has agreed.
const pending = ref(null) // { user, role, select }
const confirmOpen = computed({
  get: () => pending.value !== null,
  set: (open) => {
    if (!open) cancelRole()
  },
})

function askRole(user, event) {
  pending.value = { user, role: event.target.value, select: event.target }
}

function cancelRole() {
  if (pending.value) pending.value.select.value = pending.value.user.role // put the dropdown back
  pending.value = null
}

async function confirmRole() {
  const { user, role, select } = pending.value
  pending.value = null
  busyId.value = user.id
  try {
    await admin.setRole(user.id, role)
    toast.show(`${user.name} is now ${ROLE_LABEL[role]}`, 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    select.value = admin.users.find((u) => u.id === user.id)?.role ?? user.role
    busyId.value = null
  }
}
</script>

<template>
  <div class="admin-page">
    <h1>Users</h1>
    <p class="text-body-secondary">
      Change an account's role here. Course staff are managed on each course's People tab.
    </p>

    <div class="ca-field search">
      <label class="ca-label" for="user-search">Search</label>
      <input
        id="user-search"
        v-model="search"
        class="ca-input"
        type="search"
        placeholder="Name, email or role"
        data-testid="input-user-search"
      />
    </div>

    <p v-if="loading" class="text-body-secondary">Loading users…</p>
    <EmptyState v-else-if="loadError" icon="bi-shield-exclamation" title="Couldn't load users">
      {{ loadError }}
    </EmptyState>
    <EmptyState v-else-if="filtered.length === 0" icon="bi-person-x" title="No matching users">
      Try a different name or email.
    </EmptyState>

    <template v-else>
      <!-- lg and up: one table -->
      <table class="table align-middle d-none d-lg-table" data-testid="users-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Joined</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filtered" :key="user.id" :data-testid="`user-row-${user.id}`">
            <td>
              {{ user.name }}
              <span v-if="isMe(user)" class="badge text-bg-secondary ms-1">You</span>
            </td>
            <td class="text-break">{{ user.email }}</td>
            <td>
              <select
                class="ca-input role-select"
                :value="user.role"
                :disabled="isMe(user) || busyId === user.id"
                :aria-label="`Role for ${user.name}`"
                :data-testid="`select-role-${user.id}`"
                @change="askRole(user, $event)"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
              </select>
            </td>
            <td>{{ joined(user.created_at) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- below lg: one card per user -->
      <ul class="list-unstyled d-lg-none user-cards" data-testid="users-cards">
        <li
          v-for="user in filtered"
          :key="user.id"
          class="ca-card"
          :data-testid="`user-card-${user.id}`"
        >
          <strong>{{ user.name }}</strong>
          <span v-if="isMe(user)" class="badge text-bg-secondary ms-1">You</span>
          <div class="text-body-secondary text-break small">{{ user.email }}</div>
          <div class="small">Joined {{ joined(user.created_at) }}</div>

          <label class="ca-label mt-2" :for="`role-${user.id}`">Role</label>
          <select
            :id="`role-${user.id}`"
            class="ca-input"
            :value="user.role"
            :disabled="isMe(user) || busyId === user.id"
            @change="askRole(user, $event)"
          >
            <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
          </select>
        </li>
      </ul>
    </template>

    <ConfirmModal
      v-model:open="confirmOpen"
      :title="pending ? `Make ${pending.user.name} ${ROLE_LABEL[pending.role]}?` : ''"
      confirm-label="Change role"
      @confirm="confirmRole"
      @cancel="cancelRole"
    >
      <template v-if="pending">
        Their account changes from {{ ROLE_LABEL[pending.user.role] }} to
        {{ ROLE_LABEL[pending.role] }}. Courses they already teach or take are not affected.
      </template>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 1rem;
  max-width: 64rem;
}
.search {
  max-width: 24rem;
  margin-bottom: 1rem;
}
.role-select {
  min-width: 8rem;
}
.user-cards {
  display: grid;
  gap: 0.75rem;
}
.user-cards .ca-card {
  padding: 1rem;
}
</style>
