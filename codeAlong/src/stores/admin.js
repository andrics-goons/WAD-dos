import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as adminApi from '@/api/admin.api'

// The user list on /admin/users, kept in step with each role change so the page never
// needs a full reload.
export const useAdminStore = defineStore('admin', () => {
  const users = ref([])
  const loaded = ref(false)

  async function load() {
    users.value = await adminApi.listUsers()
    loaded.value = true
  }

  async function setRole(userId, role) {
    const updated = await adminApi.setRole(userId, role)
    users.value = users.value.map((u) => (u.id === userId ? { ...u, role: updated.role } : u))
  }

  return { users, loaded, load, setRole }
})
