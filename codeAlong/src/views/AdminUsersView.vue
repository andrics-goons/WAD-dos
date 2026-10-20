<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { Role, RoleLabel } from '@shared/constants'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

// /admin/users — the one admin page: every account, and a role dropdown for each.
// The admin's own row is locked: nobody can change their own role, so an admin can
// never accidentally remove the last admin.
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

// Picking a role only opens the confirm dialog; the role changes once the server agrees.
const pending = ref(null) // { user, role, select }

function askRole(user, event) {
  pending.value = { user, role: event.target.value, select: event.target }
}

function cancelRole() {
  pending.value.select.value = pending.value.user.role // put the dropdown back
  pending.value = null
}

async function confirmRole() {
  const { user, role, select } = pending.value
  pending.value = null
  busyId.value = user.id
  try {
    await admin.setRole(user.id, role)
    toast.show(`${user.name} is now ${RoleLabel[role]}`, 'success')
  } catch (error) {
    select.value = user.role
    toast.show(error.message, 'danger')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <h1>Users</h1>
    </div>
    <p class="text-body-secondary">
      Change an account's role here. Course staff are managed on each course's People tab.
    </p>

    <div class="ca-field mb-3 col-md-6 col-lg-4">
      <label class="ca-label" for="user-search">Search</label>
      <input
        id="user-search"
        v-model="search"
        class="ca-input"
        type="search"
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

    <!-- One list: each user is a stacked card on phones and a single row from lg up -->
    <ul v-else class="list-group">
      <li class="list-group-item d-none d-lg-block fw-semibold">
        <div class="row">
          <div class="col-lg-3">Name</div>
          <div class="col-lg-4">Email</div>
          <div class="col-lg-3">Role</div>
          <div class="col-lg-2">Joined</div>
        </div>
      </li>
      <li
        v-for="user in filtered"
        :key="user.id"
        class="list-group-item"
        :data-testid="`admin-user-row-${user.id}`"
      >
        <div class="row g-2 align-items-center">
          <div class="col-lg-3 fw-semibold">
            {{ user.name }}
            <span v-if="isMe(user)" class="badge text-bg-secondary ms-1">You</span>
          </div>
          <div class="col-lg-4 text-break text-body-secondary">{{ user.email }}</div>
          <div class="col-lg-3">
            <select
              class="ca-input"
              :value="user.role"
              :disabled="isMe(user) || busyId === user.id"
              :aria-label="`Role for ${user.name}`"
              :data-testid="`select-role-${user.id}`"
              @change="askRole(user, $event)"
            >
              <option v-for="r in Role" :key="r" :value="r">{{ RoleLabel[r] }}</option>
            </select>
          </div>
          <div class="col-lg-2 small text-body-secondary">{{ joined(user.created_at) }}</div>
        </div>
      </li>
    </ul>

    <ConfirmModal
      :open="pending !== null"
      :title="pending ? `Make ${pending.user.name} ${RoleLabel[pending.role]}?` : ''"
      confirm-label="Change role"
      @confirm="confirmRole"
      @cancel="cancelRole"
    >
      <template v-if="pending">
        Their account changes from {{ RoleLabel[pending.user.role] }} to
        {{ RoleLabel[pending.role] }}. Courses they already teach or take are not affected.
      </template>
    </ConfirmModal>
  </div>
</template>
